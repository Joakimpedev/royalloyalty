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
  /** One bucketed value per day in the window, oldest -> newest. Drives
   *  the per-card sparkline. Length matches seriesLabels in the parent
   *  DashboardMetrics. */
  series: number[];
  /** Same shape as `series` but for the prior comparison window, oldest
   *  -> newest. Same length as `series` (prior window mirrors current
   *  duration) so it overlays as the dotted comparison line. */
  previousSeries: number[];
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
  /** One label per bucket — "MMM D" formatted, oldest -> newest. */
  seriesLabels: string[];
  /** Same as seriesLabels but for the prior comparison window. Same
   *  length, oldest -> newest. Used for the comparison row in the
   *  sparkline hover tooltip. */
  compareSeriesLabels: string[];
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
  /** Count of completed Redemption rows in window — what competitors
   *  call 'Rewards claimed'. Each redemption = a real reward action,
   *  more business-meaningful than raw points redeemed. */
  rewardsClaimed: DashboardMetric;
  /** Redeemers divided by earners for the window, expressed as a
   *  fraction (0..1). Smile's flagship engagement metric — answers
   *  'are customers actually using the program?'. Sparkline shows
   *  daily redemption events (trend of redeemer activity over time). */
  redemptionRate: DashboardMetric;
  /** Latest 5 ledger rows with member name/email joined. */
  recentActivity: DashboardActivity[];
  /** Top 5 members by total earned points (lifetime, not windowed). */
  topMembers: DashboardTopMember[];
}

export async function getDashboardMetrics(
  shopId: string,
  since: Date,
  until: Date,
): Promise<DashboardMetrics> {
  const windowMs = until.getTime() - since.getTime();
  const priorSince = new Date(since.getTime() - windowMs);

  // Daily bucket list. `until` is exclusive (start-of-day after the picked
  // "to"), so we stop strictly before it — otherwise the last bucket is a
  // phantom always-zero day and the series ends up one longer than the
  // Shopify-sourced customer series the loader splices in, which silently
  // disabled the comparison overlay on the New-customers card.
  const dayKeys: string[] = [];
  const seriesLabels: string[] = [];
  {
    const cursor = startOfDayUtc(since);
    const endDay = startOfDayUtc(until);
    while (cursor < endDay) {
      dayKeys.push(cursor.toISOString().slice(0, 10));
      seriesLabels.push(
        cursor.toLocaleDateString(undefined, {
          timeZone: "UTC",
          month: "short",
          day: "numeric",
        }),
      );
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  // Prior-window day keys — mirrors the current window's duration, ending
  // the day before `since` (which is exclusive here too). Built with the
  // same strictly-before loop as dayKeys so it has the SAME length,
  // letting the comparison series overlay the current sparkline
  // bucket-for-bucket.
  const priorDayKeys: string[] = [];
  const compareSeriesLabels: string[] = [];
  {
    const cursor = startOfDayUtc(priorSince);
    const endDay = startOfDayUtc(since);
    while (cursor < endDay) {
      priorDayKeys.push(cursor.toISOString().slice(0, 10));
      compareSeriesLabels.push(
        cursor.toLocaleDateString(undefined, {
          timeZone: "UTC",
          month: "short",
          day: "numeric",
        }),
      );
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  const [
    purchaseRule,
    cur,
    prev,
    series,
    priorSeries,
    recentRows,
    topRows,
  ] = await Promise.all([
    prisma.earnRule.findFirst({
      where: { shopId, action: "purchase", enabled: true },
      select: { points: true, perDollar: true, config: true },
    }),
    aggregatesFor(shopId, since, until),
    aggregatesFor(shopId, priorSince, since),
    buildSeriesFor(shopId, since, until, dayKeys),
    buildSeriesFor(shopId, priorSince, since, priorDayKeys),
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
  let revenueSeries: number[] | null = null;
  let revenuePrevSeries: number[] | null = null;
  if (purchaseRule?.perDollar && purchaseRule.points > 0) {
    const cfg = (purchaseRule.config ?? null) as { perAmount?: number } | null;
    const perAmount = Math.max(1, cfg?.perAmount ?? 1);
    const ratio = perAmount / purchaseRule.points;
    revenueCur = cur.earnPurchasePoints * ratio;
    revenuePrev = prev.earnPurchasePoints * ratio;
    revenueSeries = series.earnPurchasePointsByDay.map((p) => p * ratio);
    revenuePrevSeries = priorSeries.earnPurchasePointsByDay.map((p) => p * ratio);
  }

  return {
    seriesLabels,
    compareSeriesLabels,
    loyaltyDrivenRevenueEstimated:
      revenueCur !== null
        ? {
            current: revenueCur,
            previous: revenuePrev ?? 0,
            deltaFraction: fractionDelta(revenueCur, revenuePrev ?? 0),
            series: revenueSeries ?? [],
            previousSeries: revenuePrevSeries ?? [],
          }
        : null,
    membersAdded: metric(
      cur.membersAdded,
      prev.membersAdded,
      series.membersAddedByDay,
      priorSeries.membersAddedByDay,
    ),
    earners: metric(
      cur.earners,
      prev.earners,
      series.earnEventsByDay,
      priorSeries.earnEventsByDay,
    ),
    redeemers: metric(
      cur.redeemers,
      prev.redeemers,
      series.redeemEventsByDay,
      priorSeries.redeemEventsByDay,
    ),
    pointsIssued: metric(
      cur.pointsIssued,
      prev.pointsIssued,
      series.pointsIssuedByDay,
      priorSeries.pointsIssuedByDay,
    ),
    pointsRedeemed: metric(
      cur.pointsRedeemed,
      prev.pointsRedeemed,
      series.pointsRedeemedByDay,
      priorSeries.pointsRedeemedByDay,
    ),
    referralOrders: metric(
      cur.referralOrders,
      prev.referralOrders,
      series.referralOrdersByDay,
      priorSeries.referralOrdersByDay,
    ),
    rewardsClaimed: metric(
      cur.rewardsClaimed,
      prev.rewardsClaimed,
      series.rewardsClaimedByDay,
      priorSeries.rewardsClaimedByDay,
    ),
    redemptionRate: {
      // Fraction (0..1). Headline value formatted upstream as %.
      current: cur.earners > 0 ? cur.redeemers / cur.earners : 0,
      previous: prev.earners > 0 ? prev.redeemers / prev.earners : 0,
      deltaFraction: fractionDelta(
        cur.earners > 0 ? cur.redeemers / cur.earners : 0,
        prev.earners > 0 ? prev.redeemers / prev.earners : 0,
      ),
      // Sparkline: daily redemption events. The headline is a ratio
      // (redeemers/earners) which doesn't bucket meaningfully per day,
      // so the trend shows redemption activity over time instead.
      series: series.redeemEventsByDay,
      previousSeries: priorSeries.redeemEventsByDay,
    },
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

function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

interface SeriesBundle {
  pointsIssuedByDay: number[];
  pointsRedeemedByDay: number[];
  earnPurchasePointsByDay: number[];
  earnEventsByDay: number[];
  redeemEventsByDay: number[];
  membersAddedByDay: number[];
  referralOrdersByDay: number[];
  rewardsClaimedByDay: number[];
}

async function buildSeriesFor(
  shopId: string,
  since: Date,
  until: Date,
  dayKeys: string[],
): Promise<SeriesBundle> {
  // Pull only the columns we need to bucket — avoid loading entire rows.
  const [txns, members, referrals, redemptions] = await Promise.all([
    prisma.pointTransaction.findMany({
      where: { shopId, createdAt: { gte: since, lt: until } },
      select: { type: true, points: true, orderId: true, createdAt: true },
    }),
    prisma.member.findMany({
      where: { shopId, enrolledAt: { gte: since, lt: until } },
      select: { enrolledAt: true },
    }),
    prisma.referral.findMany({
      where: {
        shopId,
        status: "COMPLETED",
        createdAt: { gte: since, lt: until },
      },
      select: { createdAt: true },
    }),
    prisma.redemption.findMany({
      where: {
        shopId,
        status: "COMPLETED",
        createdAt: { gte: since, lt: until },
      },
      select: { createdAt: true },
    }),
  ]);

  const idx = new Map(dayKeys.map((k, i) => [k, i]));
  const zeros = () => Array(dayKeys.length).fill(0);
  const out: SeriesBundle = {
    pointsIssuedByDay: zeros(),
    pointsRedeemedByDay: zeros(),
    earnPurchasePointsByDay: zeros(),
    earnEventsByDay: zeros(),
    redeemEventsByDay: zeros(),
    membersAddedByDay: zeros(),
    referralOrdersByDay: zeros(),
    rewardsClaimedByDay: zeros(),
  };

  for (const t of txns) {
    const i = idx.get(t.createdAt.toISOString().slice(0, 10));
    if (i === undefined) continue;
    if (t.points > 0) out.pointsIssuedByDay[i] += t.points;
    if (t.type === "REDEEM") {
      out.pointsRedeemedByDay[i] += Math.abs(t.points);
      out.redeemEventsByDay[i] += 1;
    }
    if (t.type === "EARN") {
      out.earnEventsByDay[i] += 1;
      if (t.orderId) out.earnPurchasePointsByDay[i] += t.points;
    }
  }
  for (const m of members) {
    const i = idx.get(m.enrolledAt.toISOString().slice(0, 10));
    if (i !== undefined) out.membersAddedByDay[i] += 1;
  }
  for (const r of referrals) {
    const i = idx.get(r.createdAt.toISOString().slice(0, 10));
    if (i !== undefined) out.referralOrdersByDay[i] += 1;
  }
  for (const rd of redemptions) {
    const i = idx.get(rd.createdAt.toISOString().slice(0, 10));
    if (i !== undefined) out.rewardsClaimedByDay[i] += 1;
  }
  return out;
}

interface PeriodAggregates {
  membersAdded: number;
  earners: number;
  redeemers: number;
  pointsIssued: number;
  pointsRedeemed: number;
  earnPurchasePoints: number;
  referralOrders: number;
  rewardsClaimed: number;
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
    rewardsClaimed,
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
    prisma.redemption.count({
      where: {
        shopId,
        status: "COMPLETED",
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
    rewardsClaimed,
  };
}

function metric(
  current: number,
  previous: number,
  series: number[],
  previousSeries: number[],
): DashboardMetric {
  return {
    current,
    previous,
    deltaFraction: fractionDelta(current, previous),
    series,
    previousSeries,
  };
}

function fractionDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}
