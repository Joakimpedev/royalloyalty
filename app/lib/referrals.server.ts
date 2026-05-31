// Referral engine (Phase 4).
//
// Responsibilities:
//  - issueReferralCode()  : unique code/link per member (idempotent)
//  - registerReferralClick(): record an intended referee (email + IP) against a code
//  - qualifyReferral()    : on a qualified order, run fraud heuristics, then either
//                           hold for review / hold for the holdback window / pay out
//  - releaseHeldReferrals(): scheduled sweep that pays out referrals whose
//                            post-order holdback window has elapsed
//
// Discipline:
//  - Referral status only ever changes through transitionStatus("referral", ...).
//  - Points only ever change through recordPointTransaction().
//  - Every payout gates on canAwardLoyalty(shop).
//  - No customer PII is ever logged.
//
// Fraud / anti-cheat (brief §3a.3 — non-optional):
//  - self-referral block (referee email == referrer email)
//  - same-email heuristic (referee email already a member / already referred)
//  - same-address heuristic (referee shipping/billing == referrer's known address)
//  - same-IP heuristic (referee click IP == referrer's last known IP)
//  - configurable review-before-payout (manual gate)
//  - configurable post-order holdback window (delay payout N hours after the order)
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
  /** Points the referrer earns once the friend's first qualifying order
   *  is detected (after the holdback window, if any). */
  referrerPoints: number;
  /** What the friend gets at checkout. Shopify auto-applies the discount
   *  code embedded in the referral link. */
  refereeDiscountType: RefereeDiscountType;
  refereeDiscountValue: number;
  reviewBeforePayout: boolean;
  holdbackHours: number; // 0 = pay out immediately on qualification
  sameIpBlocks: boolean; // true = block; false = flag for review
}

const DEFAULT_SETTINGS: ReferralSettings = {
  enabled: false,
  referrerPoints: 500,
  refereeDiscountType: "percent_off",
  refereeDiscountValue: 10,
  reviewBeforePayout: false,
  holdbackHours: 72,
  sameIpBlocks: false,
};

// Referral settings live on Shop.aiConfigSnapshot.referrals (no schema change in
// this phase — schema.prisma is owned by another agent / locked).
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
 * Issue (or fetch) the member's referral code. One PENDING "invite" Referral row
 * per member acts as the durable code holder; per-referee qualification rows are
 * spawned from it. Idempotent — returns the existing code if present.
 *
 * When an admin GraphQL client is supplied and the merchant has configured a
 * referee discount, this also mints a matching Shopify discount code so the
 * /discount/CODE link auto-applies for the friend at checkout. Best-effort —
 * if the mint fails, the row is still created (the friend just won't see a
 * discount, but the referrer's payout still works once we detect the code
 * later — well, only if the code exists in Shopify, so mint failures are a
 * real outage signal worth surfacing).
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
      // Mint the Shopify-side discount code so the /discount/CODE link
      // actually applies a discount at checkout. Caller may pass admin
      // (admin UI / webhooks) or omit it; in the omit case we lazily
      // obtain an offline session via withFreshToken so the storefront
      // proxy can still cause a mint on the customer's first link open.
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
          // Mint failure leaves the Referral row in place — re-running
          // hits the existing row and won't re-attempt the mint. If a
          // mint fails, the friend's discount won't apply but the link
          // is still copyable.
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
    // No usageLimit — this is shared by everyone the referrer invites.
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
  // and redirect the visitor to the store. No cookies, no email matching —
  // when the friend places an order, the code shows up in
  // order.discountApplications and we match by code.
  return `https://${shopDomain}/discount/${encodeURIComponent(code)}`;
}

/**
 * Record an intended referee against a code (called from the storefront
 * extension's server endpoint or on order qualification). Stores the referee
 * email + IP for fraud heuristics. Idempotent per (code, refereeEmail).
 */
export async function registerReferralClick(params: {
  shopId: string;
  code: string;
  refereeEmail?: string | null;
  refereeIp?: string | null;
}): Promise<{ ok: boolean }> {
  const invite = await prisma.referral.findFirst({
    where: { shopId: params.shopId, code: params.code },
  });
  if (!invite) return { ok: false };

  const email = params.refereeEmail?.toLowerCase().trim() || null;
  if (!email) return { ok: true };

  const dup = await prisma.referral.findFirst({
    where: {
      shopId: params.shopId,
      referrerId: invite.referrerId,
      refereeEmail: email,
      qualifiedOrderId: null,
    },
  });
  if (dup) {
    if (params.refereeIp && !dup.refereeIp) {
      await prisma.referral.update({
        where: { id: dup.id },
        data: { refereeIp: params.refereeIp },
      });
    }
    return { ok: true };
  }

  // Spawn a per-referee PENDING row (its own unique code derived from the base).
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await prisma.referral.create({
        data: {
          shopId: params.shopId,
          referrerId: invite.referrerId,
          code: `${invite.code}-${genCode().slice(0, 4)}`,
          refereeEmail: email,
          refereeIp: params.refereeIp ?? null,
          status: "PENDING",
        },
      });
      return { ok: true };
    } catch {
      // unique collision — retry
    }
  }
  return { ok: false };
}

export type FraudReason =
  | "self_referral"
  | "same_email"
  | "same_address"
  | "same_ip";

export interface QualifyResult {
  outcome:
    | "paid"
    | "held_review"
    | "held_holdback"
    | "blocked_fraud"
    | "blocked_quota"
    | "no_referral"
    | "already_qualified";
  fraud?: FraudReason[];
  referralId?: string;
}

/**
 * Qualify a referral on a qualifying order from the referee.
 *
 * `referrerKnownIp` / `referrerKnownAddress` are the best signals we have for the
 * referrer (last click IP we stored, member address). Heuristics:
 *  - self-referral (email match) -> always blocked
 *  - same-email (referee already an enrolled member before the referral) -> blocked
 *  - same-address -> flagged (forces review)
 *  - same-IP -> blocked if settings.sameIpBlocks else flagged
 * Any flag forces review-before-payout regardless of the global setting.
 */
export async function qualifyReferral(params: {
  shopId: string;
  refereeEmail: string;
  refereeIp?: string | null;
  refereeAddress?: string | null;
  orderId: string;
}): Promise<QualifyResult> {
  const settings = await getReferralSettings(params.shopId);
  if (!settings.enabled) return { outcome: "no_referral" };

  const email = params.refereeEmail.toLowerCase().trim();
  if (!email) return { outcome: "no_referral" };

  const referral = await prisma.referral.findFirst({
    where: {
      shopId: params.shopId,
      refereeEmail: email,
      qualifiedOrderId: null,
      status: { in: ["PENDING", "ACTIVE"] },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!referral) return { outcome: "no_referral" };

  // Idempotency: this order already qualified some referral.
  const dupOrder = await prisma.referral.findFirst({
    where: { shopId: params.shopId, qualifiedOrderId: params.orderId },
    select: { id: true },
  });
  if (dupOrder) return { outcome: "already_qualified" };

  const referrer = await prisma.member.findUnique({
    where: { id: referral.referrerId },
  });

  const fraud: FraudReason[] = [];

  // self-referral: referee email == referrer email
  if (referrer?.email && referrer.email.toLowerCase().trim() === email) {
    fraud.push("self_referral");
  }

  // same-email: the referee is already an enrolled member that pre-dates the
  // referral row (i.e. not a genuinely new customer brought in by the referral).
  const existingMember = await prisma.member.findFirst({
    where: { shopId: params.shopId, email },
  });
  if (
    existingMember &&
    existingMember.id !== referral.referrerId &&
    existingMember.enrolledAt < referral.createdAt
  ) {
    fraud.push("same_email");
  }

  // same-address heuristic
  if (
    params.refereeAddress &&
    referrer &&
    (referrer as unknown as { lastAddress?: string }).lastAddress &&
    normalizeAddr(params.refereeAddress) ===
      normalizeAddr(
        (referrer as unknown as { lastAddress?: string }).lastAddress!,
      )
  ) {
    fraud.push("same_address");
  }

  // same-IP heuristic: referee order IP == the IP we recorded for the referrer's
  // own last activity OR the referrer's own click IP on any of their referrals.
  if (params.refereeIp) {
    const referrerIpRow = await prisma.referral.findFirst({
      where: {
        shopId: params.shopId,
        referrerId: referral.referrerId,
        refereeIp: params.refereeIp,
      },
      select: { id: true },
    });
    // Only meaningful if it's NOT this same referral row's own stored referee IP.
    if (referrerIpRow && referrerIpRow.id !== referral.id) {
      fraud.push("same_ip");
    }
  }

  // Hard blocks.
  const hardBlock =
    fraud.includes("self_referral") ||
    fraud.includes("same_email") ||
    (fraud.includes("same_ip") && settings.sameIpBlocks);

  if (hardBlock) {
    await transitionStatus("referral", referral.id, "CANCELLED").catch(
      () => undefined,
    );
    return { outcome: "blocked_fraud", fraud, referralId: referral.id };
  }

  const allowed = await canAwardLoyalty(params.shopId);
  if (!allowed) return { outcome: "blocked_quota", referralId: referral.id };

  // Mark the order qualified + move to ACTIVE (awaiting payout).
  await prisma.referral.update({
    where: { id: referral.id },
    data: { qualifiedOrderId: params.orderId },
  });
  if (referral.status === "PENDING") {
    await transitionStatus("referral", referral.id, "ACTIVE");
  }

  // Soft flags or explicit review-before-payout -> hold for manual review.
  const needsReview = settings.reviewBeforePayout || fraud.length > 0;
  if (needsReview) {
    return { outcome: "held_review", fraud, referralId: referral.id };
  }

  // Holdback window -> the release sweep pays it out later.
  if (settings.holdbackHours > 0) {
    return { outcome: "held_holdback", referralId: referral.id };
  }

  await payoutReferral({
    shopId: params.shopId,
    referralId: referral.id,
    settings,
    refereeEmail: email,
  });
  return { outcome: "paid", referralId: referral.id };
}

function normalizeAddr(a: string): string {
  return a.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Qualify a referral by the discount code that was applied to an order.
 *
 * The new flow: the friend clicks /discount/CODE → Shopify auto-applies the
 * code → friend checks out → the order's discount_codes contains CODE → this
 * handler matches the code to a Referral row and treats the order as the
 * qualifying purchase. No cookies, no email matching.
 *
 * Self-referral / fraud heuristics still apply where signals exist (referrer's
 * own purchase, same IP, same email). The referee's email is read off the
 * order if present; otherwise the referral simply qualifies on the order id
 * (we never need the referee's email for the discount-code path).
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

  const referral = await prisma.referral.findFirst({
    where: {
      shopId: params.shopId,
      code: params.code,
      // The base PENDING "invite" row is the source code; clones can also
      // be matched (legacy email-based flow) but the primary case is the
      // base row itself with no refereeEmail.
      qualifiedOrderId: null,
      status: { in: ["PENDING", "ACTIVE"] },
    },
    orderBy: { createdAt: "asc" },
  });
  if (!referral) return { outcome: "no_referral" };

  // Idempotency: this order already qualified some referral.
  const dupOrder = await prisma.referral.findFirst({
    where: { shopId: params.shopId, qualifiedOrderId: params.orderId },
    select: { id: true },
  });
  if (dupOrder) return { outcome: "already_qualified" };

  const referrer = await prisma.member.findUnique({
    where: { id: referral.referrerId },
  });

  const fraud: FraudReason[] = [];
  const email = (params.refereeEmail ?? "").toLowerCase().trim();

  // self-referral by Shopify customer id (most reliable signal: the friend
  // signed in as the referrer themselves).
  if (
    params.refereeShopifyCustomerId &&
    referrer?.shopifyCustomerId === params.refereeShopifyCustomerId
  ) {
    fraud.push("self_referral");
  }
  // self-referral by email.
  if (email && referrer?.email?.toLowerCase().trim() === email) {
    fraud.push("self_referral");
  }

  // same-IP heuristic — if any of this referrer's prior referral rows have
  // the same IP we now see on this order, flag it.
  if (params.refereeIp) {
    const ipMatch = await prisma.referral.findFirst({
      where: {
        shopId: params.shopId,
        referrerId: referral.referrerId,
        refereeIp: params.refereeIp,
      },
      select: { id: true },
    });
    if (ipMatch && ipMatch.id !== referral.id) {
      fraud.push("same_ip");
    }
  }

  const hardBlock =
    fraud.includes("self_referral") ||
    (fraud.includes("same_ip") && settings.sameIpBlocks);

  if (hardBlock) {
    // Don't burn the referrer's base PENDING row — clone it and cancel the
    // clone so the original code can still be used by other friends.
    try {
      await prisma.referral.create({
        data: {
          shopId: params.shopId,
          referrerId: referral.referrerId,
          code: `${referral.code}-${genCode().slice(0, 4)}`,
          refereeEmail: email || null,
          refereeIp: params.refereeIp ?? null,
          qualifiedOrderId: params.orderId,
          status: "CANCELLED",
        },
      });
    } catch {
      /* non-fatal */
    }
    return { outcome: "blocked_fraud", fraud, referralId: referral.id };
  }

  const allowed = await canAwardLoyalty(params.shopId);
  if (!allowed) return { outcome: "blocked_quota", referralId: referral.id };

  // For the discount-code path the base PENDING row stays usable for the
  // NEXT friend. We create a fresh row representing THIS friend's
  // qualified purchase, then treat it as the one to pay out.
  const qualifyingRow = await prisma.referral.create({
    data: {
      shopId: params.shopId,
      referrerId: referral.referrerId,
      code: `${referral.code}-${genCode().slice(0, 4)}`,
      refereeEmail: email || null,
      refereeIp: params.refereeIp ?? null,
      qualifiedOrderId: params.orderId,
      status: "ACTIVE",
    },
  });

  const needsReview = settings.reviewBeforePayout || fraud.length > 0;
  if (needsReview) {
    return { outcome: "held_review", fraud, referralId: qualifyingRow.id };
  }
  if (settings.holdbackHours > 0) {
    return { outcome: "held_holdback", referralId: qualifyingRow.id };
  }
  await payoutReferral({
    shopId: params.shopId,
    referralId: qualifyingRow.id,
    settings,
  });
  return { outcome: "paid", referralId: qualifyingRow.id };
}

/**
 * Pay out a qualified referral: award the referrer + the referee, complete the
 * Referral. Idempotent — a COMPLETED referral or a prior payout txn short-circuits.
 */
export async function payoutReferral(params: {
  shopId: string;
  referralId: string;
  settings?: ReferralSettings;
  refereeEmail?: string;
}): Promise<{ ok: boolean; reason?: string }> {
  const settings =
    params.settings ?? (await getReferralSettings(params.shopId));

  const referral = await prisma.referral.findFirst({
    where: { id: params.referralId, shopId: params.shopId },
  });
  if (!referral) return { ok: false, reason: "not_found" };
  if (referral.status === "COMPLETED")
    return { ok: false, reason: "already_paid" };
  if (!referral.qualifiedOrderId)
    return { ok: false, reason: "not_qualified" };

  // Idempotency guard on the ledger (reason carries the referral id).
  const priorPayout = await prisma.pointTransaction.findFirst({
    where: {
      shopId: params.shopId,
      reason: { contains: `[referral:${referral.id}]` },
    },
    select: { id: true },
  });
  if (priorPayout) {
    if (referral.status !== "COMPLETED") {
      await transitionStatus("referral", referral.id, "COMPLETED").catch(
        () => undefined,
      );
    }
    return { ok: false, reason: "already_paid" };
  }

  const allowed = await canAwardLoyalty(params.shopId);
  if (!allowed) return { ok: false, reason: "quota" };

  // Referrer reward. The referee's reward is the discount they already
  // received at checkout (Shopify applied it through the /discount/CODE
  // link). Nothing to record on the referee's points ledger.
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

/**
 * Scheduled sweep (uses no Shopify API, pure DB) — pay out referrals whose
 * holdback window has elapsed and that are not awaiting manual review.
 * Manual-review referrals stay ACTIVE until an admin approves them.
 */
export async function releaseHeldReferrals(): Promise<{ released: number }> {
  const shops = await prisma.shop.findMany({
    where: { isActive: true },
    select: { id: true, aiConfigSnapshot: true },
  });
  let released = 0;
  for (const shop of shops) {
    const settings = readSettings(shop.aiConfigSnapshot);
    if (!settings.enabled || settings.reviewBeforePayout) continue;
    const cutoff = new Date(
      Date.now() - settings.holdbackHours * 60 * 60 * 1000,
    );
    const due = await prisma.referral.findMany({
      where: {
        shopId: shop.id,
        status: "ACTIVE",
        qualifiedOrderId: { not: null },
        statusChangedAt: { lt: cutoff },
      },
    });
    for (const r of due) {
      const res = await payoutReferral({
        shopId: shop.id,
        referralId: r.id,
        settings,
      });
      if (res.ok) released++;
    }
  }
  return { released };
}
