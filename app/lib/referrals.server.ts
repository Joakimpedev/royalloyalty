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
  /** Points the referrer earns the moment the friend creates an account
   *  from their referral link. */
  referrerPoints: number;
  /** Points the friend earns the moment they create an account from the
   *  referral link (stacks with the "Create an account" earn rule if
   *  that rule is enabled). */
  refereePoints: number;
}

const DEFAULT_SETTINGS: ReferralSettings = {
  enabled: false,
  referrerPoints: 500,
  refereePoints: 200,
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
    | "claim_failed";
  referrerPoints?: number;
  refereePoints?: number;
  error?: string;
}

// Type used to satisfy the optional graphql param now that we no longer
// need an admin client for the claim (we removed the store-credit issue).
type AnyGraphqlClient = GraphqlClient;

/**
 * Friend just landed on the storefront WHILE logged in and the storefront
 * JS handed us the cookie value + logged-in customer id. Validate, record,
 * and award points to BOTH sides immediately.
 *
 * The friend also enrolls in the loyalty program as part of the same
 * transaction (creating a Member row if needed). Their "Create an account"
 * earn rule, if enabled, is handled independently by the customers/create
 * webhook — this function intentionally does NOT touch that path.
 */
export async function claimReferral(params: {
  shopId: string;
  shopifyCustomerId: string;
  customerEmail: string | null;
  customerName?: string | null;
  code: string;
  graphql?: AnyGraphqlClient;
}): Promise<ClaimReferralResult> {
  void params.graphql; // reserved for future use; currently unused
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
  const email = (params.customerEmail || "").toLowerCase().trim();
  const dup = await prisma.referral.findFirst({
    where: {
      shopId: params.shopId,
      referrerId: baseRow.referrerId,
      refereeEmail: email || null,
      status: "COMPLETED",
      NOT: { refereeEmail: null },
    },
  });
  if (dup) {
    return {
      ok: true,
      status: "already_claimed",
      referrerPoints: settings.referrerPoints,
      refereePoints: settings.refereePoints,
    };
  }

  // Quota gate (each point award counts toward monthly volume).
  const allowed = await canAwardLoyalty(params.shopId);
  if (!allowed) {
    return { ok: false, status: "claim_failed", error: "Plan quota reached." };
  }

  // Enroll the friend if they're not already a Member, so we can write to
  // their points ledger.
  const refereeMember = await prisma.member.upsert({
    where: {
      shopId_shopifyCustomerId: {
        shopId: params.shopId,
        shopifyCustomerId: params.shopifyCustomerId,
      },
    },
    update: {},
    create: {
      shopId: params.shopId,
      shopifyCustomerId: params.shopifyCustomerId,
      email: email || null,
      name: params.customerName ?? null,
      enrolledAt: new Date(),
    },
  });

  // Record the attribution row and mark it complete in one go (no later
  // qualifying event needed for this model — both sides paid now).
  const claimRow = await prisma.referral.create({
    data: {
      shopId: params.shopId,
      referrerId: baseRow.referrerId,
      code: `${baseRow.code}-${genCode().slice(0, 4)}`,
      refereeEmail: email || null,
      status: "ACTIVE",
    },
  });

  // Award referrer.
  if (settings.referrerPoints > 0) {
    await recordPointTransaction({
      shopId: params.shopId,
      memberId: baseRow.referrerId,
      type: "EARN",
      points: settings.referrerPoints,
      reason: `Referral reward (referrer) [referral:${claimRow.id}]`,
    });
  }
  // Award referee.
  if (settings.refereePoints > 0) {
    await recordPointTransaction({
      shopId: params.shopId,
      memberId: refereeMember.id,
      type: "EARN",
      points: settings.refereePoints,
      reason: `Referral welcome (referee) [referral:${claimRow.id}]`,
    });
  }
  await transitionStatus("referral", claimRow.id, "COMPLETED").catch(
    () => undefined,
  );

  return {
    ok: true,
    status: "claimed",
    referrerPoints: settings.referrerPoints,
    refereePoints: settings.refereePoints,
  };
}
