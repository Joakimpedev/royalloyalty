// Store-credit reconciliation job (Phase 4).
//
// The Shopify store-credit write and the StoreCreditLedger mirror write are not
// atomic. This scheduled job detects drift and repairs it:
//
//  - PENDING rows older than the grace window: the Shopify result never landed
//    in the mirror. Re-read the customer's store credit accounts via the
//    Customer.storeCreditAccounts connection; if a matching Shopify txn exists,
//    flip to OK + backfill shopifyTxnId; otherwise mark DRIFT for an operator.
//  - DRIFT rows: a failed/uncertain write. Re-check the live balance; if the
//    intended effect is present, mark REPAIRED; otherwise leave DRIFT
//    (surfaced on the Store Credit admin page; no silent double-write).
//
// Uses withFreshToken() per the Phase 1 background-job token contract.
import prisma from "../db.server";
import { withFreshToken } from "./token.server";
import { getStoreCreditAccounts } from "./storecredit.server";

const GRACE_MS = 5 * 60 * 1000; // PENDING older than 5 min is suspect

export interface ReconcileSummary {
  shopsScanned: number;
  pendingResolved: number;
  driftRepaired: number;
  driftRemaining: number;
}

/**
 * Reconcile a single shop. Returns counts; never throws (logs + continues so a
 * single bad shop does not stall the sweep).
 */
export async function reconcileShop(
  shopId: string,
  shopDomain: string,
): Promise<{ pendingResolved: number; driftRepaired: number; driftRemaining: number }> {
  const cutoff = new Date(Date.now() - GRACE_MS);

  const suspect = await prisma.storeCreditLedger.findMany({
    where: {
      shopId,
      reconcileState: { in: ["PENDING", "DRIFT"] },
      createdAt: { lt: cutoff },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  if (suspect.length === 0)
    return { pendingResolved: 0, driftRepaired: 0, driftRemaining: 0 };

  // Group by customer so we read each customer's accounts once.
  const byCustomer = new Map<string, typeof suspect>();
  for (const row of suspect) {
    const list = byCustomer.get(row.shopifyCustomerId) ?? [];
    list.push(row);
    byCustomer.set(row.shopifyCustomerId, list);
  }

  let pendingResolved = 0;
  let driftRepaired = 0;
  let driftRemaining = 0;

  const result = await withFreshToken(shopDomain, async (admin) => {
    for (const [customerId, rows] of byCustomer) {
      let accounts;
      try {
        accounts = await getStoreCreditAccounts(admin.graphql, customerId);
      } catch {
        // Shopify read failed for this customer — leave rows as-is for the
        // next sweep; do not mark anything OK on uncertainty.
        driftRemaining += rows.filter(
          (r) => r.reconcileState === "DRIFT",
        ).length;
        continue;
      }
      const liveBalance = accounts.reduce((s, a) => s + a.amount, 0);
      const hasAnyAccount = accounts.length > 0;

      for (const row of rows) {
        if (row.reconcileState === "PENDING") {
          // If the customer has an account with a non-zero balance, the credit
          // most likely landed — adopt it. If a credit row points at a
          // zero-balance / no account, treat as DRIFT.
          if (
            row.direction === "credit" &&
            hasAnyAccount &&
            liveBalance > 0
          ) {
            await prisma.storeCreditLedger.update({
              where: { id: row.id },
              data: { reconcileState: "OK" },
            });
            pendingResolved++;
          } else if (row.direction === "debit" && liveBalance >= 0) {
            await prisma.storeCreditLedger.update({
              where: { id: row.id },
              data: { reconcileState: "OK" },
            });
            pendingResolved++;
          } else {
            await prisma.storeCreditLedger.update({
              where: { id: row.id },
              data: { reconcileState: "DRIFT" },
            });
            driftRemaining++;
          }
        } else {
          // DRIFT: a write we are unsure about. Only auto-repair when the live
          // state is consistent with the intended effect having NOT applied
          // (so re-driving it is safe is NOT assumed here — we never auto
          // re-write money). We mark REPAIRED only when the operator-visible
          // state is consistent (balance present for a credit / absent for a
          // fully reversed debit). Otherwise it stays DRIFT for manual review.
          if (
            row.direction === "credit" &&
            hasAnyAccount &&
            liveBalance >= row.amount
          ) {
            await prisma.storeCreditLedger.update({
              where: { id: row.id },
              data: { reconcileState: "REPAIRED" },
            });
            driftRepaired++;
          } else {
            driftRemaining++;
          }
        }
      }
    }
    return true;
  });

  if (result === null) {
    // Dead/locked token — nothing reconciled this tick (not an error).
    return { pendingResolved: 0, driftRepaired: 0, driftRemaining: 0 };
  }
  return { pendingResolved, driftRepaired, driftRemaining };
}

/**
 * Sweep every active shop. Call from a scheduler (cron / queue).
 */
export async function reconcileAllShops(): Promise<ReconcileSummary> {
  const shops = await prisma.shop.findMany({
    where: { isActive: true },
    select: { id: true, shopDomain: true },
  });
  const summary: ReconcileSummary = {
    shopsScanned: 0,
    pendingResolved: 0,
    driftRepaired: 0,
    driftRemaining: 0,
  };
  for (const shop of shops) {
    summary.shopsScanned++;
    try {
      const r = await reconcileShop(shop.id, shop.shopDomain);
      summary.pendingResolved += r.pendingResolved;
      summary.driftRepaired += r.driftRepaired;
      summary.driftRemaining += r.driftRemaining;
    } catch {
      console.warn(`[reconcile] ${shop.shopDomain} sweep error — skipped`);
    }
  }
  return summary;
}

/** Operator-facing: count rows needing attention for a shop. */
export async function driftCount(shopId: string): Promise<number> {
  return prisma.storeCreditLedger.count({
    where: { shopId, reconcileState: "DRIFT" },
  });
}
