// refunds/create — clawback points + store credit for the refunded order.
//
// Universal webhook contract (webhooks.server.ts / Phase 1):
//   1. authenticate.webhook() HMAC — throws 401 on invalid (never catch-and-200)
//   2. shouldProcess() dedup on X-Shopify-Event-Id
//   3. bounded work, return 200 fast
//   4. no PII in any log line (safeLog: topic + shop domain + note only)
//
// `refunds/create` is the valid refund topic — `orders/refunded` does NOT
// exist; `orders/updated` does not reliably carry the refunds array.
//
// Per-order idempotency: a refund clawback runs ONLY IF the order has not
// already been clawed back (alreadyClawedBack via PointTransaction
// .reversedForOrderId). This guards double-clawback on partial-refund-then-
// cancel (a refund then a cancel for the same order must reverse points once).
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { shouldProcess, safeLog } from "../lib/webhooks.server";
import prisma from "../db.server";
import { recordPointTransaction, alreadyClawedBack } from "../lib/points.server";
import { clawbackStoreCreditForOrder } from "../lib/storecredit.server";

interface RefundsCreatePayload {
  id: number | string;
  order_id: number | string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, admin } = await authenticate.webhook(request);

  const first = await shouldProcess(request, topic);
  if (!first) {
    safeLog(topic, shop, "duplicate delivery ignored");
    return new Response(null, { status: 200 });
  }

  try {
    const body = payload as RefundsCreatePayload;
    const orderId = String(body.order_id ?? "");
    if (!orderId) {
      safeLog(topic, shop, "refund without order_id — nothing to claw back");
      return new Response(null, { status: 200 });
    }

    const shopRow = await prisma.shop.findUnique({
      where: { shopDomain: shop },
      select: { id: true },
    });
    if (!shopRow) {
      safeLog(topic, shop, "shop not found — ack");
      return new Response(null, { status: 200 });
    }

    // Per-order idempotency guard. If this order was already clawed back
    // (by a prior refund or a cancel), do nothing.
    if (await alreadyClawedBack(shopRow.id, orderId)) {
      safeLog(topic, shop, "order already clawed back — skipped");
      return new Response(null, { status: 200 });
    }

    // Reverse the points earned for this order. Sum the positive EARN points
    // tied to the order and write a single CLAWBACK row (negative), stamped
    // reversedForOrderId so the guard above sees it next time.
    const earned = await prisma.pointTransaction.aggregate({
      where: {
        shopId: shopRow.id,
        orderId,
        type: { in: ["EARN", "IMPORT"] },
        points: { gt: 0 },
      },
      _sum: { points: true },
      _max: { memberId: true },
    });
    const earnedPoints = earned._sum.points ?? 0;
    if (earnedPoints > 0) {
      const txn = await prisma.pointTransaction.findFirst({
        where: { shopId: shopRow.id, orderId, type: { in: ["EARN", "IMPORT"] } },
        select: { memberId: true },
      });
      if (txn) {
        await recordPointTransaction({
          shopId: shopRow.id,
          memberId: txn.memberId,
          type: "CLAWBACK",
          points: -earnedPoints,
          reason: `Clawback: refund on order ${orderId}`,
          orderId,
          reversedForOrderId: orderId,
        });
      }
    }

    // Reverse store credit (cashback) granted for this order.
    if (admin) {
      await clawbackStoreCreditForOrder({
        graphql: admin.graphql,
        shopId: shopRow.id,
        orderId,
      });
    }

    safeLog(topic, shop, "refund clawback applied");
  } catch (err) {
    safeLog(topic, shop, "refund processing error");
    throw err; // Shopify retries; dedup row prevents an infinite loop
  }

  return new Response(null, { status: 200 });
};
