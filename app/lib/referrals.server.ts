// Referral engine.
//
// Model:
//   * Each member has one durable ROYAL- prefixed referral code.
//   * The referral link is `https://store/?ref=CODE`. The storefront JS
//     stores it in a cookie (royal_ref).
//   * When a friend creates an account and lands on the storefront WHILE
//     logged in, the storefront detects the cookie + the logged-in customer
//     and POSTs to /loyalty/claim-referral, which:
//       - validates the code
//       - guards self-referral
//       - records the attribution (refereeEmail on a new Referral row)
//       - issues the configured store-credit amount to the friend
//   * When that friend places their first order, orders/create matches the
//     pending Referral row by email and pays the referrer their points.
//
// No Shopify discount codes are created or consumed. No `/discount/...` URL.
// Store credit lives natively on the customer record so it survives logout
// and applies the next time they check out logged in.
//
// Discipline:
//   * Referral status only ever changes through transitionStatus("referral", ...).
//   * Points only ever change through recordPointTransaction().
//   * Store credit only ever changes through creditStoreCredit().
//   * Every payout gates on canAwardLoyalty(shop).
//   * No customer PII is ever logged.
import prisma from "../db.server";
import { recordPointTransaction } from "./points.server";
import { transitionStatus } from "./status.server";
import { canAwardLoyalty } from "./quota.server";

// Minimal GraphQL client shape so we don't import from loyalty.server.ts
// and create a cycle.
type GraphqlClient = (
  query: string,
  options?: { variables?: Record<string, unknown> },
) => Promise<{ json: () => Promise<any> }>;

export interface ReferralSettings {
  enabled: boolean;
  /** Points the referrer earns when the friend's first qualifying order
   *  comes through. */
  referrerPoints: number;
  /** Store credit the friend gets the moment they sign up via a referral
   *  link. Denominated in the shop's currency. */
  refereeStoreCreditAmount: number;
}

const DEFAULT_SETTINGS: ReferralSettings = {
  enabled: false,
  referrerPoints: 500,
  refereeStoreCreditAmount: 10,
};

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
 * row per member acts as the durable code holder. Idempotent.
 *
 * If we find an existing row that uses the legacy plain-8-char code format
 * (pre-ROYAL- prefix), we drop it and regenerate so the orders/create webhook
 * can spot the code reliably.
 */
export async function issueReferralCode(params: {
  shopId: string;
  memberId: string;
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

  if (existing && !/^ROYAL-/i.test(existing.code)) {
    await prisma.referral.delete({ where: { id: existing.id } });
  } else if (existing) {
    return { code: existing.code };
  }

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
      return { code: row.code };
    } catch {
      // unique violation — retry with another code
    }
  }
  throw new Error("Could not allocate a unique referral code.");
}

export function referralLink(shopDomain: string, code: string): string {
  // ?ref=CODE on the homepage. The storefront extension reads the param and
  // stores it in a cookie; the attribution fires the moment the customer is
  // signed in.
  return `https://${shopDomain}/?ref=${encodeURIComponent(code)}`;
}

export interface ClaimReferralResult {
  ok: boolean;
  status:
    | "claimed"
    | "already_claimed"
    | "self_referral"
    | "no_code"
    | "disabled"
    | "no_customer"
    | "credit_failed";
  amount?: number;
  currencyCode?: string;
  error?: string;
}

/**
 * Friend just landed on the storefront WHILE logged in and the storefront
 * JS handed us the cookie value + logged-in customer id. Validate, record,
 * and issue store credit.
 */
export async function claimReferral(params: {
  shopId: string;
  shopifyCustomerId: string;
  customerEmail: string | null;
  code: string;
  graphql: GraphqlClient;
  shopCurrencyCode: string;
}): Promise<ClaimReferralResult> {
  const settings = await getReferralSettings(params.shopId);
  if (!settings.enabled) return { ok: false, status: "disabled" };

  if (!params.shopifyCustomerId) {
    return { ok: false, status: "no_customer" };
  }

  // Find the base PENDING invite row for this code.
  const baseRow = await prisma.referral.findFirst({
    where: {
      shopId: params.shopId,
      code: params.code,
      refereeEmail: null,
      qualifiedOrderId: null,
    },
  });
  if (!baseRow) return { ok: false, status: "no_code" };

  // Self-referral guard: referrer used their own code.
  const referrer = await prisma.member.findUnique({
    where: { id: baseRow.referrerId },
    select: { shopifyCustomerId: true, email: true },
  });
  if (
    referrer?.shopifyCustomerId === params.shopifyCustomerId ||
    (referrer?.email &&
      params.customerEmail &&
      referrer.email.toLowerCase() === params.customerEmail.toLowerCase())
  ) {
    return { ok: false, status: "self_referral" };
  }

  // Idempotency — was this customer already claimed against this code?
  const dup = await prisma.referral.findFirst({
    where: {
      shopId: params.shopId,
      referrerId: baseRow.referrerId,
      refereeEmail: (params.customerEmail || "").toLowerCase().trim() || null,
      status: { not: "CANCELLED" },
      // Has a refereeEmail set so it's a per-friend row, not the base invite.
      NOT: { refereeEmail: null },
    },
  });
  if (dup) {
    return {
      ok: true,
      status: "already_claimed",
      amount: settings.refereeStoreCreditAmount,
      currencyCode: params.shopCurrencyCode,
    };
  }

  // Quota gate (the credit issue counts toward monthly volume in
  // canAwardLoyalty's accounting).
  const allowed = await canAwardLoyalty(params.shopId);
  if (!allowed) {
    return { ok: false, status: "credit_failed", error: "Plan quota reached." };
  }

  // Record the attribution row first so a partial credit failure still
  // leaves a trail.
  const claimRow = await prisma.referral.create({
    data: {
      shopId: params.shopId,
      referrerId: baseRow.referrerId,
      code: `${baseRow.code}-${genCode().slice(0, 4)}`,
      refereeEmail: (params.customerEmail || "").toLowerCase().trim() || null,
      status: "ACTIVE",
    },
  });

  // Issue the store credit.
  if (settings.refereeStoreCreditAmount > 0) {
    const { creditStoreCredit } = await import("./storecredit.server");
    const credit = await creditStoreCredit({
      graphql: params.graphql,
      shopId: params.shopId,
      shopifyCustomerId: params.shopifyCustomerId,
      amount: settings.refereeStoreCreditAmount,
      currencyCode: params.shopCurrencyCode,
      reason: `Referral welcome credit [referral:${claimRow.id}]`,
    });
    if (!credit.ok) {
      return {
        ok: false,
        status: "credit_failed",
        error: credit.error ?? "Store credit issue failed.",
      };
    }
  }

  return {
    ok: true,
    status: "claimed",
    amount: settings.refereeStoreCreditAmount,
    currencyCode: params.shopCurrencyCode,
  };
}

export interface QualifyResult {
  outcome: "paid" | "blocked_quota" | "no_referral" | "already_qualified";
  referralId?: string;
}

/**
 * Friend just placed an order. If their email matches a previously-claimed
 * pending referral row (status=ACTIVE, qualifiedOrderId=null), mark it
 * qualified and pay the referrer their points.
 */
export async function qualifyReferralByEmail(params: {
  shopId: string;
  refereeEmail: string;
  orderId: string;
}): Promise<QualifyResult> {
  const settings = await getReferralSettings(params.shopId);
  if (!settings.enabled) return { outcome: "no_referral" };

  const email = (params.refereeEmail || "").toLowerCase().trim();
  if (!email) return { outcome: "no_referral" };

  const claim = await prisma.referral.findFirst({
    where: {
      shopId: params.shopId,
      refereeEmail: email,
      qualifiedOrderId: null,
      status: "ACTIVE",
    },
    orderBy: { createdAt: "asc" },
  });
  if (!claim) return { outcome: "no_referral" };

  const dupOrder = await prisma.referral.findFirst({
    where: { shopId: params.shopId, qualifiedOrderId: params.orderId },
    select: { id: true },
  });
  if (dupOrder) return { outcome: "already_qualified" };

  await prisma.referral.update({
    where: { id: claim.id },
    data: { qualifiedOrderId: params.orderId },
  });

  await payoutReferral({
    shopId: params.shopId,
    referralId: claim.id,
    settings,
  });
  return { outcome: "paid", referralId: claim.id };
}

/**
 * Pay out the referrer for a qualified referral row. Idempotent against the
 * point-transaction reason tag.
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
