// Home dashboard metrics — date-ranged, with prior-period deltas.
//
// Powers the rewritten /app home page (Essent / Smile-style layout). The
// existing getProgramMetrics() in analytics.server.ts is all-time and used
// elsewhere; this helper layers windowed aggregations on top of the same
// tables (PointTransaction, Member, Redemption, Referral) without
// duplicating ROI / tier logic the all-time metrics already cover.

import prisma from "../db.server";

export interface DashboardMetric {
  /** Display value (formatted upstream — this just carries the number). */
  current: number;
  /** Prior-period value for delta computation. */
  previous: number;
  /** Signed change as a fraction (0.1 = +10%). Null if previous was 0. */
  deltaFraction: number | null;
}

export interface DashboardActivity {
  id: string;
  memberName: string | null;
  memberEmail: string | null;
  type: string;
  reason: string;
  points: number;
  date: string; // ISO
}

export interface DashboardTopMember {
  id: string;
  name: string | null;
  email: string | null;
  totalEarned: number;
}

export interface DashboardMetrics {
  /** Sum of order totals for orders that earned loyalty points in the
   *  window, ESTIMATED by reversing the active purchase rule. Honest:
   *  shows null when no purchase rule is configured so we don't lie. */
  loyaltyDrivenRevenueEstimated: DashboardMetric | null;
  /** New members enrolled in window. */
  membersAdded: DashboardMetric;
  /** Distinct members with an EARN transaction in window. */
  earners: DashboardMetric;
  /** Distinct members with a REDEEM transaction in window. */
  redeemers: DashboardMetric;
  /** Sum of points awarded (EARN + positive ADJUST + IMPORT). */
  pointsIssued: DashboardMetric;
  /** Absolute sum of points spent. */
  pointsRedeemed: DashboardMetric;
  /** Count of completed referrals in window. */
  referralOrders: DashboardMetric;
  /** Latest 5 ledger rows with member name/email joined. */
  recentActivity: DashboardActivity[];
  /** Top 5 members by total earned points (lifetime, not windowed). */
  topMembers: DashboardTopMember[];
}

export async function getDashboardMetrics(
  shopId: string,
  windowMs: number,
): Promise<DashboardMetrics> {
  const now = new Date();
  const since = new Date(now.getTime() - windowMs);
  const priorSince = new Date(now.getTime() - 2 * windowMs);

  const [
    purchaseRule,
    cur,
    prev,
    recentRows,
    topRows,
  ] = await Promise.all([
    prisma.earnRule.findFirst({
      where: { shopId, action: "purchase", enabled: true },
      select: { points: true, perDollar: true, config: true },
    }),
    aggregatesFor(shopId, since, now),
    aggregatesFor(shopId, priorSince, since),
    prisma.pointTransaction.findMany({
      where: { shopId },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        member: { select: { name: true, email: true } },
      },
    }),
    prisma.pointTransaction.groupBy({
      by: ["memberId"],
      where: { shopId, type: "EARN" },
      _sum: { points: true },
      orderBy: { _sum: { points: "desc" } },
      take: 5,
    }),
  ]);

  const topMemberIds = topRows.map((r) => r.memberId);
  const topMemberRows = topMemberIds.length
    ? await prisma.member.findMany({
        where: { id: { in: topMemberIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const memberById = new Map(topMemberRows.map((m) => [m.id, m]));

  // Loyalty-driven revenue: derive from points earned ON PURCHASE orders
  // by reversing the purchase rule. perAmount lives in the EarnRule.config
  // JSON blob (e.g. {perAmount: 5} means "rule.points per 5 currency").
  let revenueCur: number | null = null;
  let revenuePrev: number | null = null;
  if (purchaseRule?.perDollar && purchaseRule.points > 0) {
    const cfg = (purchaseRule.config ?? null) as { perAmount?: number } | null;
    const perAmount = Math.max(1, cfg?.perAmount ?? 1);
    const ratio = perAmount / purchaseRule.points;
    revenueCur = cur.earnPurchasePoints * ratio;
    revenuePrev = prev.earnPurchasePoints * ratio;
  }

  return {
    loyaltyDrivenRevenueEstimated: revenueCur !== null
      ? {
          current: revenueCur,
          previous: revenuePrev ?? 0,
          deltaFraction: fractionDelta(revenueCur, revenuePrev ?? 0),
        }
      : null,
    membersAdded: metric(cur.membersAdded, prev.membersAdded),
    earners: metric(cur.earners, prev.earners),
    redeemers: metric(cur.redeemers, prev.redeemers),
    pointsIssued: metric(cur.pointsIssued, prev.pointsIssued),
    pointsRedeemed: metric(cur.pointsRedeemed, prev.pointsRedeemed),
    referralOrders: metric(cur.referralOrders, prev.referralOrders),
    recentActivity: recentRows.map((r) => ({
      id: r.id,
      memberName: r.member.name ?? null,
      memberEmail: r.member.email ?? null,
      type: r.type,
      reason: r.reason,
      points: r.points,
      date: r.createdAt.toISOString(),
    })),
    topMembers: topRows.map((r) => {
      const m = memberById.get(r.memberId);
      return {
        id: r.memberId,
        name: m?.name ?? null,
        email: m?.email ?? null,
        totalEarned: r._sum.points ?? 0,
      };
    }),
  };
}

interface PeriodAggregates {
  membersAdded: number;
  earners: number;
  redeemers: number;
  pointsIssued: number;
  pointsRedeemed: number;
  earnPurchasePoints: number;
  referralOrders: number;
}

async function aggregatesFor(
  shopId: string,
  since: Date,
  until: Date,
): Promise<PeriodAggregates> {
  const [
    membersAdded,
    issuedAgg,
    redeemedAgg,
    purchaseAgg,
    earnerGroups,
    redeemerGroups,
    referralOrders,
  ] = await Promise.all([
    prisma.member.count({
      where: { shopId, enrolledAt: { gte: since, lt: until } },
    }),
    prisma.pointTransaction.aggregate({
      where: { shopId, createdAt: { gte: since, lt: until }, points: { gt: 0 } },
      _sum: { points: true },
    }),
    prisma.pointTransaction.aggregate({
      where: { shopId, createdAt: { gte: since, lt: until }, type: "REDEEM" },
      _sum: { points: true },
    }),
    prisma.pointTransaction.aggregate({
      where: {
        shopId,
        createdAt: { gte: since, lt: until },
        type: "EARN",
        orderId: { not: null },
      },
      _sum: { points: true },
    }),
    prisma.pointTransaction.groupBy({
      by: ["memberId"],
      where: {
        shopId,
        createdAt: { gte: since, lt: until },
        type: "EARN",
      },
    }),
    prisma.pointTransaction.groupBy({
      by: ["memberId"],
      where: {
        shopId,
        createdAt: { gte: since, lt: until },
        type: "REDEEM",
      },
    }),
    prisma.referral.count({
      where: {
        shopId,
        status: "COMPLETED",
        // Use the row's createdAt as the "completed in window" proxy. The
        // exact completion timestamp would need a status-change ledger we
        // don't track yet; close enough for v1 dashboard purposes.
        createdAt: { gte: since, lt: until },
      },
    }),
  ]);

  return {
    membersAdded,
    earners: earnerGroups.length,
    redeemers: redeemerGroups.length,
    pointsIssued: issuedAgg._sum.points ?? 0,
    pointsRedeemed: Math.abs(redeemedAgg._sum.points ?? 0),
    earnPurchasePoints: purchaseAgg._sum.points ?? 0,
    referralOrders,
  };
}

function metric(current: number, previous: number): DashboardMetric {
  return { current, previous, deltaFraction: fractionDelta(current, previous) };
}

function fractionDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}
