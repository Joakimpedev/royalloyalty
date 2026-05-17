// Program analytics (Phase 2, brief §3a.11).
//
// Every metric is sourced from the append-only point ledger + the Redemption /
// Referral / Member / Tier tables. No mutation, read-only aggregations only.
// `revenueInfluenced` is derived from earn-on-purchase rows: orders that earned
// loyalty points, scaled back through the active per-$ purchase rule (the same
// rule the engine used to award them) — this avoids an extra `orders` scope
// call for the dashboard while staying ledger-true. Exact spend reconciliation
// is the Phase 4 `orders` job; the field is labelled "influenced (estimated)".
import prisma from "../db.server";

export interface ProgramMetrics {
  hasActivity: boolean;
  members: {
    total: number;
    enrolledLast30d: number;
  };
  points: {
    issued: number; // sum of positive EARN/IMPORT/ADJUST
    redeemed: number; // absolute sum of REDEEM
    outstanding: number; // net balance across all members
  };
  redemption: {
    total: number; // COMPLETED redemptions
    rate: number; // completed redemptions / members (0..1)
  };
  revenueInfluencedEstimated: number; // see header note
  referrals: {
    total: number;
    completed: number;
    conversionRate: number; // completed / total (0..1)
  };
  tierDistribution: Array<{
    tierId: string | null;
    tierName: string;
    members: number;
  }>;
  roi: {
    pointsLiabilityValue: number; // outstanding points valued at redeem rate
    redeemedValue: number; // points redeemed valued at redeem rate
    revenueInfluencedEstimated: number;
    // simple ratio: estimated influenced revenue / value handed back
    ratio: number | null;
  };
}

/**
 * Pull the full metrics bundle for a shop. Returns `hasActivity: false` for a
 * brand-new store (no members, no ledger) so the UI can show its empty state.
 */
export async function getProgramMetrics(shopId: string): Promise<ProgramMetrics> {
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalMembers,
    enrolledLast30d,
    issuedAgg,
    redeemedAgg,
    netAgg,
    completedRedemptions,
    totalReferrals,
    completedReferrals,
    tiers,
    tierGroups,
    untieredCount,
    earnPurchaseRule,
    earnedOnPurchaseAgg,
  ] = await Promise.all([
    prisma.member.count({ where: { shopId } }),
    prisma.member.count({ where: { shopId, enrolledAt: { gte: since30 } } }),
    prisma.pointTransaction.aggregate({
      where: { shopId, points: { gt: 0 } },
      _sum: { points: true },
    }),
    prisma.pointTransaction.aggregate({
      where: { shopId, type: "REDEEM" },
      _sum: { points: true },
    }),
    prisma.pointTransaction.aggregate({
      where: { shopId },
      _sum: { points: true },
    }),
    prisma.redemption.count({ where: { shopId, status: "COMPLETED" } }),
    prisma.referral.count({ where: { shopId } }),
    prisma.referral.count({ where: { shopId, status: "COMPLETED" } }),
    prisma.tier.findMany({ where: { shopId }, orderBy: { sortOrder: "asc" } }),
    prisma.member.groupBy({
      by: ["currentTierId"],
      where: { shopId, currentTierId: { not: null } },
      _count: { _all: true },
    }),
    prisma.member.count({ where: { shopId, currentTierId: null } }),
    prisma.earnRule.findFirst({
      where: { shopId, action: "purchase", enabled: true },
    }),
    prisma.pointTransaction.aggregate({
      where: { shopId, type: "EARN", orderId: { not: null } },
      _sum: { points: true },
    }),
  ]);

  const issued = issuedAgg._sum.points ?? 0;
  const redeemedRaw = redeemedAgg._sum.points ?? 0; // negative
  const redeemed = Math.abs(redeemedRaw);
  const outstanding = netAgg._sum.points ?? 0;

  const hasActivity = totalMembers > 0 || issued > 0 || redeemed > 0;

  // Redemption rate: completed redemptions per member.
  const redemptionRate =
    totalMembers > 0 ? completedRedemptions / totalMembers : 0;

  // Referral conversion.
  const referralConversion =
    totalReferrals > 0 ? completedReferrals / totalReferrals : 0;

  // Tier distribution including the implicit "no tier" bucket.
  const tierNameById = new Map(tiers.map((t) => [t.id, t.name]));
  const tierDistribution: ProgramMetrics["tierDistribution"] = tierGroups.map(
    (g) => ({
      tierId: g.currentTierId,
      tierName: g.currentTierId
        ? tierNameById.get(g.currentTierId) ?? "Unknown"
        : "No tier",
      members: g._count._all,
    }),
  );
  if (untieredCount > 0) {
    tierDistribution.push({
      tierId: null,
      tierName: "No tier",
      members: untieredCount,
    });
  }

  // Estimated influenced revenue: invert the active per-$ purchase rule on the
  // points earned from orders. If the rule is flat (not per-$), we cannot infer
  // revenue from points alone — report 0 (the Phase 4 orders job fills this in).
  let revenueInfluencedEstimated = 0;
  const earnedOnPurchase = earnedOnPurchaseAgg._sum.points ?? 0;
  if (
    earnPurchaseRule &&
    earnPurchaseRule.perDollar &&
    earnPurchaseRule.points > 0 &&
    earnedOnPurchase > 0
  ) {
    revenueInfluencedEstimated = earnedOnPurchase / earnPurchaseRule.points;
  }

  // ROI: value points at the best available redeem rate. Use the cheapest
  // amount_off reward's points->currency ratio as the redemption value of a
  // point; fall back to 0.01 currency/point if no amount reward exists.
  const valuePerPoint = await estimateValuePerPoint(shopId);
  const pointsLiabilityValue = outstanding * valuePerPoint;
  const redeemedValue = redeemed * valuePerPoint;
  const roiRatio =
    redeemedValue > 0 ? revenueInfluencedEstimated / redeemedValue : null;

  return {
    hasActivity,
    members: { total: totalMembers, enrolledLast30d },
    points: { issued, redeemed, outstanding },
    redemption: { total: completedRedemptions, rate: redemptionRate },
    revenueInfluencedEstimated,
    referrals: {
      total: totalReferrals,
      completed: completedReferrals,
      conversionRate: referralConversion,
    },
    tierDistribution,
    roi: {
      pointsLiabilityValue,
      redeemedValue,
      revenueInfluencedEstimated,
      ratio: roiRatio,
    },
  };
}

/**
 * Estimate the currency value of one point from the reward catalog: the lowest
 * value/pointsCost ratio across amount_off rewards. Fallback 0.01.
 */
async function estimateValuePerPoint(shopId: string): Promise<number> {
  const rewards = await prisma.reward.findMany({
    where: { shopId, type: "amount_off", enabled: true },
    select: { value: true, pointsCost: true },
  });
  let best: number | null = null;
  for (const r of rewards) {
    if (r.value && r.value > 0 && r.pointsCost > 0) {
      const ratio = r.value / r.pointsCost;
      if (best === null || ratio < best) best = ratio;
    }
  }
  return best ?? 0.01;
}
