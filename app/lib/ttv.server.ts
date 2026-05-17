// Royal Loyalty — time-to-value instrumentation
// (ROYAL-LOYALTY-DEVELOPMENT.md Phase 3 #10 / COMPETITOR-ONBOARDING-RESEARCH §4.8).
//
// We persist two timestamps already on Shop: installedAt (set at install) and
// programActivatedAt (set the moment the merchant clicks "Activate program" in
// onboarding). The install→activate delta is the headline TTV metric — target
// median < 2 minutes (the publicly-visible "X minutes using the app" lever).
//
// This module does NOT add columns (schema is owned elsewhere); it derives the
// delta from the two existing fields and exposes a median helper for internal
// logging/analytics. Test line (Phase 7): the delta is recorded and queryable.

import prisma from "../db.server";

/**
 * Stamp activation time. Idempotent: only the FIRST activation counts, so a
 * re-activation or a retried action never inflates the TTV metric. Called from
 * the onboarding "Activate program" action, inside the same transaction.
 *
 * Accepts a Prisma client or transaction client.
 */
export async function recordActivation(
  tx: { shop: { updateMany: Function } },
  shopId: string,
  at: Date = new Date(),
): Promise<void> {
  // updateMany with programActivatedAt: null guarantees we only write once
  // even under concurrent submits (no read-modify-write race).
  await tx.shop.updateMany({
    where: { id: shopId, programActivatedAt: null },
    data: { programActivatedAt: at },
  });
}

/** Install→activate delta in milliseconds for one shop, or null if not yet activated. */
export async function timeToValueMs(shopId: string): Promise<number | null> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { installedAt: true, programActivatedAt: true },
  });
  if (!shop?.programActivatedAt) return null;
  return shop.programActivatedAt.getTime() - shop.installedAt.getTime();
}

/**
 * Median install→activate time across all activated shops, in milliseconds.
 * Returns null when no shop has activated yet. Used by internal
 * logging/analytics to track the < 2-minute target.
 */
export async function medianTimeToValueMs(): Promise<number | null> {
  const shops = await prisma.shop.findMany({
    where: { programActivatedAt: { not: null } },
    select: { installedAt: true, programActivatedAt: true },
  });
  const deltas = shops
    .map((s) =>
      s.programActivatedAt
        ? s.programActivatedAt.getTime() - s.installedAt.getTime()
        : null,
    )
    .filter((d): d is number => d !== null && d >= 0)
    .sort((a, b) => a - b);

  if (deltas.length === 0) return null;
  const mid = Math.floor(deltas.length / 2);
  return deltas.length % 2 === 0
    ? Math.round((deltas[mid - 1] + deltas[mid]) / 2)
    : deltas[mid];
}

/** Convenience: median TTV formatted for human/log output. */
export async function medianTimeToValueLabel(): Promise<string> {
  const ms = await medianTimeToValueMs();
  if (ms === null) return "no activations yet";
  const totalSeconds = Math.round(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Emit the current median to logs (safe — no PII, store-level only). */
export async function logMedianTimeToValue(): Promise<void> {
  const label = await medianTimeToValueLabel();
  console.log(`[ttv] median install→activate = ${label}`);
}
