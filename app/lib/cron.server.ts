// Cron jobs — daily anniversary checker.
//
// Triggered by an external scheduler (Railway cron, GitHub Actions, etc.)
// hitting POST /api/cron/anniversary with the X-Cron-Token header.
//
// Idempotent by design: awardForAction's `oncePerKey="anniversary-{year}"`
// guard means re-running the same day (or running on a leap-year edge)
// won't double-credit a member.

import prisma from "../db.server";
import { awardForAction } from "./loyalty.server";

export interface AnniversaryReport {
  checkedShops: number;
  membersConsidered: number;
  awarded: number;
  skipped: number;
}

export async function runAnniversaryCron(
  now: Date = new Date(),
): Promise<AnniversaryReport> {
  const month = now.getUTCMonth() + 1;
  const day = now.getUTCDate();
  const year = now.getUTCFullYear();
  const oncePerKey = `anniversary-${year}`;

  const report: AnniversaryReport = {
    checkedShops: 0,
    membersConsidered: 0,
    awarded: 0,
    skipped: 0,
  };

  // Iterate active shops; per-shop scan keeps the work bounded and lets us
  // honor each shop's quota / rule independently.
  const shops = await prisma.shop.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  for (const shop of shops) {
    report.checkedShops += 1;

    // Members whose enrollment anniversary (UTC) is today, joined at least
    // one full calendar year ago. PostgreSQL EXTRACT keeps the index-friendly
    // shape simple here even though the result set is small (~ count / 365).
    const members = await prisma.$queryRaw<
      Array<{ id: string }>
    >`
      SELECT id
      FROM "Member"
      WHERE "shopId" = ${shop.id}
        AND "redactedAt" IS NULL
        AND EXTRACT(MONTH FROM "enrolledAt") = ${month}
        AND EXTRACT(DAY FROM "enrolledAt") = ${day}
        AND EXTRACT(YEAR FROM "enrolledAt") < ${year}
    `;

    for (const m of members) {
      report.membersConsidered += 1;
      const res = await awardForAction({
        shopId: shop.id,
        memberId: m.id,
        action: "anniversary",
        oncePerKey,
      });
      if (res.outcome === "awarded") report.awarded += 1;
      else report.skipped += 1;
    }
  }

  return report;
}
