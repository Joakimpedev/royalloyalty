// Volume quota — REAL logic (ROYAL-LOYALTY-DEVELOPMENT.md Phase 5).
//
// NO feature is ever gated — volume only. A shop over its monthly loyalty-order
// cap simply stops accruing new loyalty orders until the period rolls over or
// it upgrades; nothing is hidden and no data is lost. The cap-hit surface is
// neutral/informational (see app.billing.tsx) — no fear framing.
//
// "Loyalty order" is defined in billing.server.ts (one Shopify order that
// earned or redeemed via Royal within the current calendar-month period,
// counted at most once). This file owns the count-vs-cap comparison and the
// calendar-month rollover of Shop.monthlyLoyaltyOrderCount / quotaPeriodStart.
import prisma from "../db.server";
import { planDef } from "./billing.server";

/**
 * True if `a` and `b` fall in the same calendar month (same year + month).
 * Quota periods are calendar months, anchored at quotaPeriodStart.
 */
function sameCalendarMonth(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth()
  );
}

/** Start-of-month (UTC) for the given date — the canonical period anchor. */
function monthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

export interface QuotaState {
  plan: import("@prisma/client").PlanTier;
  cap: number | null; // null = unlimited (Pro)
  used: number;
  remaining: number | null; // null = unlimited
  overCap: boolean;
  periodStart: Date;
}

/**
 * Read the current quota state, applying a lazy calendar-month rollover: if
 * quotaPeriodStart is in an earlier month than now, the counter is reset to 0
 * and quotaPeriodStart is moved to the start of the current month before the
 * comparison. This is the single rollover point — every earn/redeem entry
 * point calls canAwardLoyalty() which goes through here.
 */
export async function getQuotaState(shopId: string): Promise<QuotaState | null> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      plan: true,
      monthlyLoyaltyOrderCount: true,
      quotaPeriodStart: true,
    },
  });
  if (!shop) return null;

  const now = new Date();
  let used = shop.monthlyLoyaltyOrderCount;
  let periodStart = shop.quotaPeriodStart;

  // Lazy monthly rollover.
  if (!sameCalendarMonth(shop.quotaPeriodStart, now)) {
    periodStart = monthStart(now);
    used = 0;
    await prisma.shop.update({
      where: { id: shopId },
      data: { monthlyLoyaltyOrderCount: 0, quotaPeriodStart: periodStart },
    });
  }

  const cap = planDef(shop.plan).cap;
  const overCap = cap !== null && used >= cap;
  return {
    plan: shop.plan,
    cap,
    used,
    remaining: cap === null ? null : Math.max(0, cap - used),
    overCap,
    periodStart,
  };
}

/**
 * Volume gate for every earn/redeem entry point. Returns false when the shop
 * is over its monthly cap (or inactive). Pro (cap = null) is always true.
 * Does NOT increment the counter — recordLoyaltyOrder() does that, once per
 * order, after work is actually attributed to Royal.
 */
export async function canAwardLoyalty(shopId: string): Promise<boolean> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { isActive: true },
  });
  if (!shop?.isActive) return false;

  const state = await getQuotaState(shopId);
  if (!state) return false;
  if (state.cap === null) return true; // unlimited tier
  return state.used < state.cap;
}

/**
 * Count one loyalty order toward the monthly quota. Idempotent per order via
 * the supplied `orderId`: if any PointTransaction or StoreCreditLedger row for
 * this order already exists *before this call recorded one*, the caller is
 * responsible for only invoking this the first time the order interacts with
 * Royal. To keep the count "at most once per order per period" we guard on a
 * marker: the first earn/redeem for an order increments; subsequent events for
 * the same order do not. Callers pass `alreadyCounted` true to skip.
 *
 * Applies the lazy rollover first so an order in a new month starts at 1.
 */
export async function recordLoyaltyOrder(
  shopId: string,
  alreadyCounted: boolean,
): Promise<void> {
  if (alreadyCounted) return;
  // Ensure rollover is applied (and counter zeroed) before incrementing.
  await getQuotaState(shopId);
  await prisma.shop.update({
    where: { id: shopId },
    data: { monthlyLoyaltyOrderCount: { increment: 1 } },
  });
}

/**
 * Has this order already been counted toward the loyalty-order quota this
 * period? An order counts once: the first time it produces an EARN/REDEEM
 * PointTransaction OR a StoreCreditLedger row. We treat the existence of any
 * prior Royal row for the order (before the current event) as "counted".
 */
export async function orderAlreadyCounted(
  shopId: string,
  orderId: string,
): Promise<boolean> {
  if (!orderId) return true; // no order id => never count (cannot dedup safely)
  const [pt, scl] = await Promise.all([
    prisma.pointTransaction.findFirst({
      where: { shopId, orderId, type: { in: ["EARN", "REDEEM"] } },
      select: { id: true },
    }),
    prisma.storeCreditLedger.findFirst({
      where: { shopId, orderId },
      select: { id: true },
    }),
  ]);
  return Boolean(pt || scl);
}
