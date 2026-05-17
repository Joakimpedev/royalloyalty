// Append-only point ledger writer — the ONLY way points change.
// Balance is always SUM(points); rows are never mutated or deleted (except shop/redact).
import prisma from "../db.server";
import type { PointTxnType } from "@prisma/client";

export async function recordPointTransaction(params: {
  shopId: string;
  memberId: string;
  type: PointTxnType;
  points: number; // signed: +earn, -redeem, +/-adjust, -clawback, +import
  reason: string;
  orderId?: string;
  reversedForOrderId?: string;
}) {
  return prisma.pointTransaction.create({
    data: {
      shopId: params.shopId,
      memberId: params.memberId,
      type: params.type,
      points: params.points,
      reason: params.reason,
      orderId: params.orderId,
      reversedForOrderId: params.reversedForOrderId,
    },
  });
}

export async function getBalance(shopId: string, memberId: string): Promise<number> {
  const agg = await prisma.pointTransaction.aggregate({
    where: { shopId, memberId },
    _sum: { points: true },
  });
  return agg._sum.points ?? 0;
}

// Idempotency guard: true if this order was already clawed back (prevents
// double-clawback on partial-refund-then-cancel).
export async function alreadyClawedBack(shopId: string, orderId: string): Promise<boolean> {
  const existing = await prisma.pointTransaction.findFirst({
    where: { shopId, reversedForOrderId: orderId, type: "CLAWBACK" },
    select: { id: true },
  });
  return existing !== null;
}
