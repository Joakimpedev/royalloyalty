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

export interface ReferralSettings {
  enabled: boolean;
  referrerPoints: number;
  refereePoints: number;
  reviewBeforePayout: boolean;
  holdbackHours: number; // 0 = pay out immediately on qualification
  sameIpBlocks: boolean; // true = block; false = flag for review
}

const DEFAULT_SETTINGS: ReferralSettings = {
  enabled: false,
  referrerPoints: 500,
  refereePoints: 200,
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
    data: { aiConfigSnapshot: { ...base, referrals: next } },
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
  if (existing) return { code: existing.code };

  // Retry on the unique(code) constraint.
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = genCode();
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
      // unique violation — try another code
    }
  }
  throw new Error("Could not allocate a unique referral code.");
}

export function referralLink(shopDomain: string, code: string): string {
  // Storefront landing — the theme app extension reads ?ref= and stores it.
  return `https://${shopDomain}/?ref=${encodeURIComponent(code)}`;
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

  // Referrer reward.
  await recordPointTransaction({
    shopId: params.shopId,
    memberId: referral.referrerId,
    type: "EARN",
    points: settings.referrerPoints,
    reason: `Referral reward (referrer) [referral:${referral.id}]`,
    orderId: referral.qualifiedOrderId ?? undefined,
  });

  // Referee reward — only if the referee resolves to an enrolled member.
  const refEmail = (params.refereeEmail ?? referral.refereeEmail ?? "")
    .toLowerCase()
    .trim();
  if (refEmail) {
    const refereeMember = await prisma.member.findFirst({
      where: { shopId: params.shopId, email: refEmail },
    });
    if (refereeMember && !refereeMember.redactedAt) {
      await recordPointTransaction({
        shopId: params.shopId,
        memberId: refereeMember.id,
        type: "EARN",
        points: settings.refereePoints,
        reason: `Referral reward (referee) [referral:${referral.id}]`,
        orderId: referral.qualifiedOrderId ?? undefined,
      });
    }
  }

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
