// Referral engine.
//
// Responsibilities:
//  - issueReferralCode()       : unique code/link per member (idempotent),
//                                also mints the matching Shopify discount
//                                code so /discount/CODE auto-applies the
//                                friend's discount at checkout
//  - qualifyReferralByCode()   : on a qualifying order, immediately pay the
//                                referrer their points
//  - payoutReferral()          : ledger write (referrer earn)
//
// Discipline:
//  - Referral status only ever changes through transitionStatus("referral", ...).
//  - Points only ever change through recordPointTransaction().
//  - Every payout gates on canAwardLoyalty(shop).
//  - No customer PII is ever logged.
//
// Fraud / holdback / review intentionally removed: the auto-detection caught
// almost nothing in practice (a fresh email + fresh account bypassed every
// heuristic), the holdback window delayed payouts without actually checking
// for cancellations, and the manual review queue surfaced no useful signal to
// the merchant. Referrers now get paid the instant the friend's order with
// the referral code hits orders/create.
import prisma from "../db.server";
import { recordPointTransaction } from "./points.server";
import { transitionStatus } from "./status.server";
import { canAwardLoyalty } from "./quota.server";

// Minimal GraphQL client shape — same one createDiscountCode uses in
// loyalty.server.ts. We do NOT import that one to avoid a circular dep.
type GraphqlClient = (
  query: string,
  options?: { variables?: Record<string, unknown> },
) => Promise<{ json: () => Promise<any> }>;

export type RefereeDiscountType = "percent_off" | "amount_off";

export interface ReferralSettings {
  enabled: boolean;
  /** Points the referrer earns the moment the friend's first qualifying
   *  order with the referral code is detected. */
  referrerPoints: number;
  /** What the friend gets at checkout. Shopify auto-applies the discount
   *  code embedded in the referral link. */
  refereeDiscountType: RefereeDiscountType;
  refereeDiscountValue: number;
}

const DEFAULT_SETTINGS: ReferralSettings = {
  enabled: false,
  referrerPoints: 500,
  refereeDiscountType: "percent_off",
  refereeDiscountValue: 10,
};

// Referral settings live on Shop.aiConfigSnapshot.referrals.
function readSettings(snapshot: unknown): ReferralSettings {
  const snap =
    snapshot && typeof snapshot === "object"
      ? ((snapshot as Record<string, unknown>).referrals as
          | Partial<ReferralSettings>
          | undefined)
      : undefined;
  return { ...DEFAULT_SETTINGS, ...(snap ?? {}) };
}

export async function getReferralSettings(
  shopId: string,
): Promise<ReferralSettings> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { aiConfigSnapshot: true },
  });
  return readSettings(shop?.aiConfigSnapshot);
}

export async function saveReferralSettings(
  shopId: string,
  next: ReferralSettings,
): Promise<void> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { aiConfigSnapshot: true },
  });
  const base =
    shop?.aiConfigSnapshot && typeof shop.aiConfigSnapshot === "object"
      ? (shop.aiConfigSnapshot as Record<string, unknown>)
      : {};
  await prisma.shop.update({
    where: { id: shopId },
    data: {
      aiConfigSnapshot: { ...base, referrals: next } as any,
    },
  });
}

function genCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

/**
 * Issue (or fetch) the member's referral code. One PENDING "invite" Referral
 * row per member acts as the durable code holder. Idempotent — returns the
 * existing code if present.
 *
 * Also mints the matching Shopify discount code so /discount/CODE auto-
 * applies the friend's discount at checkout. Caller may pass admin (admin
 * UI / webhooks) or omit it; in the omit case we lazily obtain an offline
 * session via withFreshToken so the storefront proxy can also trigger a
 * mint on the customer's first link open.
 */
export async function issueReferralCode(params: {
  shopId: string;
  memberId: string;
  admin?: { graphql: GraphqlClient };
}): Promise<{ code: string }> {
  const existing = await prisma.referral.findFirst({
    where: {
      shopId: params.shopId,
      referrerId: params.memberId,
      refereeEmail: null,
      qualifiedOrderId: null,
    },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return { code: existing.code };

  const settings = await getReferralSettings(params.shopId);

  // Retry on the unique(code) constraint.
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = `ROYAL-${genCode()}`;
    try {
      const row = await prisma.referral.create({
        data: {
          shopId: params.shopId,
          referrerId: params.memberId,
          code,
          status: "PENDING",
        },
      });
      if (settings.enabled) {
        try {
          if (params.admin) {
            await mintShopifyReferralDiscount(
              params.admin.graphql,
              code,
              settings,
            );
          } else {
            const shop = await prisma.shop.findUnique({
              where: { id: params.shopId },
              select: { shopDomain: true },
            });
            if (shop) {
              const { withFreshToken } = await import("./token.server");
              await withFreshToken(shop.shopDomain, async (admin) =>
                mintShopifyReferralDiscount(admin.graphql, code, settings),
              );
            }
          }
        } catch (e) {
          // Mint failure leaves the Referral row in place; the link is
          // still copyable but Shopify won't apply a discount until the
          // mint succeeds on a later call.
          // eslint-disable-next-line no-console
          console.warn("[referrals] mintShopifyReferralDiscount failed", e);
        }
      }
      return { code: row.code };
    } catch {
      // unique violation — try another code
    }
  }
  throw new Error("Could not allocate a unique referral code.");
}

/**
 * Create a Shopify basic discount code with the merchant's configured
 * percent_off / amount_off value. Multi-use (every friend who clicks the
 * referrer's link applies the same code). Combines with other discounts.
 */
async function mintShopifyReferralDiscount(
  graphql: GraphqlClient,
  code: string,
  settings: ReferralSettings,
): Promise<void> {
  const now = new Date().toISOString();
  let customerGets: Record<string, unknown>;
  if (settings.refereeDiscountType === "percent_off") {
    const pct = Math.max(
      0,
      Math.min(1, (settings.refereeDiscountValue || 0) / 100),
    );
    customerGets = { value: { percentage: pct }, items: { all: true } };
  } else {
    customerGets = {
      value: {
        discountAmount: {
          amount: (settings.refereeDiscountValue || 0).toFixed(2),
          appliesOnEachItem: false,
        },
      },
      items: { all: true },
    };
  }
  const basicCodeDiscount: Record<string, unknown> = {
    title: `Royal Loyalty referral`,
    code,
    startsAt: now,
    customerSelection: { all: true },
    customerGets,
    appliesOncePerCustomer: true,
    combinesWith: {
      orderDiscounts: true,
      productDiscounts: true,
      shippingDiscounts: true,
    },
  };
  const MUTATION = `#graphql
    mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode { id }
        userErrors { field message }
      }
    }`;
  const resp = await graphql(MUTATION, {
    variables: { basicCodeDiscount },
  });
  const body = await resp.json();
  const errs = body?.data?.discountCodeBasicCreate?.userErrors as
    | Array<{ message: string }>
    | undefined;
  if (errs && errs.length > 0) {
    throw new Error(errs.map((e) => e.message).join("; "));
  }
}

export function referralLink(shopDomain: string, code: string): string {
  // /discount/CODE makes Shopify auto-apply the discount code at checkout
  // and redirect the visitor to the store. When the friend places an order,
  // the code shows up in order.discount_codes and we match by code.
  return `https://${shopDomain}/discount/${encodeURIComponent(code)}`;
}

export interface QualifyResult {
  outcome: "paid" | "blocked_quota" | "no_referral" | "already_qualified";
  referralId?: string;
}

/**
 * Qualify a referral by the discount code applied to an order, and pay the
 * referrer immediately. No fraud heuristics, no holdback, no manual review.
 *
 * Idempotent on (shopId, orderId): a re-delivery of the orders/create
 * webhook is a no-op.
 */
export async function qualifyReferralByCode(params: {
  shopId: string;
  code: string;
  orderId: string;
  refereeEmail?: string | null;
  refereeIp?: string | null;
  refereeShopifyCustomerId?: string | null;
}): Promise<QualifyResult> {
  const settings = await getReferralSettings(params.shopId);
  if (!settings.enabled) return { outcome: "no_referral" };

  // Find the base PENDING "invite" row for this code.
  const baseRow = await prisma.referral.findFirst({
    where: {
      shopId: params.shopId,
      code: params.code,
      qualifiedOrderId: null,
    },
    orderBy: { createdAt: "asc" },
  });
  if (!baseRow) return { outcome: "no_referral" };

  // Idempotency: this order already qualified some referral.
  const dupOrder = await prisma.referral.findFirst({
    where: { shopId: params.shopId, qualifiedOrderId: params.orderId },
    select: { id: true },
  });
  if (dupOrder) return { outcome: "already_qualified" };

  const allowed = await canAwardLoyalty(params.shopId);
  if (!allowed) return { outcome: "blocked_quota", referralId: baseRow.id };

  // Spawn a fresh row representing THIS friend's qualified purchase. The
  // base PENDING row stays usable for the next friend.
  const qualifyingRow = await prisma.referral.create({
    data: {
      shopId: params.shopId,
      referrerId: baseRow.referrerId,
      code: `${baseRow.code}-${genCode().slice(0, 4)}`,
      refereeEmail: (params.refereeEmail ?? "").toLowerCase().trim() || null,
      refereeIp: params.refereeIp ?? null,
      qualifiedOrderId: params.orderId,
      status: "ACTIVE",
    },
  });

  await payoutReferral({
    shopId: params.shopId,
    referralId: qualifyingRow.id,
    settings,
  });
  return { outcome: "paid", referralId: qualifyingRow.id };
}

/**
 * Pay out the referrer for a qualified referral row. The referee already
 * received their reward (the discount) at checkout, so no referee ledger
 * write here. Idempotent against the point-transaction reason tag, so a
 * second call is a no-op.
 */
export async function payoutReferral(params: {
  shopId: string;
  referralId: string;
  settings?: ReferralSettings;
}): Promise<{ ok: boolean; reason?: string }> {
  const settings =
    params.settings ?? (await getReferralSettings(params.shopId));

  const referral = await prisma.referral.findFirst({
    where: { id: params.referralId, shopId: params.shopId },
  });
  if (!referral) return { ok: false, reason: "not_found" };
  if (!referral.qualifiedOrderId)
    return { ok: false, reason: "not_qualified" };

  // Idempotency guard on the ledger.
  const priorPayout = await prisma.pointTransaction.findFirst({
    where: {
      shopId: params.shopId,
      reason: { contains: `[referral:${referral.id}]` },
    },
    select: { id: true },
  });
  if (priorPayout) {
    return { ok: false, reason: "already_paid" };
  }

  const allowed = await canAwardLoyalty(params.shopId);
  if (!allowed) return { ok: false, reason: "quota" };

  await recordPointTransaction({
    shopId: params.shopId,
    memberId: referral.referrerId,
    type: "EARN",
    points: settings.referrerPoints,
    reason: `Referral reward (referrer) [referral:${referral.id}]`,
    orderId: referral.qualifiedOrderId ?? undefined,
  });

  await transitionStatus("referral", referral.id, "COMPLETED");
  return { ok: true };
}
