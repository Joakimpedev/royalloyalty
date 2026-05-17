// orders/cancelled — clawback points + store credit for the cancelled order.
//
// Universal webhook contract (webhooks.server.ts / Phase 1):
//   1. authenticate.webhook() HMAC — throws 401 on invalid (never catch-and-200)
//   2. shouldProcess() dedup on X-Shopify-Event-Id
//   3. bounded work, return 200 fast
//   4. no PII in any log line (safeLog: topic + shop domain + note only)
//
// Per-order idempotency (shared with refunds/create via reversedForOrderId):
// if the order was already clawed back (e.g. a partial refund happened first,
// then the order was cancelled), this is a no-op — points are reversed once.
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { shouldProcess, safeLog } from "../lib/webhooks.server";
import prisma from "../db.server";
import { recordPointTransaction, alreadyClawedBack } from "../lib/points.server";
import { clawbackStoreCreditForOrder } from "../lib/storecredit.server";

interface OrdersCancelledPayload {
  id: number | string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, admin } = await authenticate.webhook(request);

  const first = await shouldProcess(request, topic);
  if (!first) {
    safeLog(topic, shop, "duplicate delivery ignored");
    return new Response(null, { status: 200 });
  }

  try {
    const body = payload as OrdersCancelledPayload;
    const orderId = String(body.id ?? "");
    if (!orderId) {
      safeLog(topic, shop, "cancel without order id — ack");
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

    // Per-order idempotency: if a refund already clawed this order back, stop.
    if (await alreadyClawedBack(shopRow.id, orderId)) {
      safeLog(topic, shop, "order already clawed back — skipped");
      return new Response(null, { status: 200 });
    }

    const earned = await prisma.pointTransaction.aggregate({
      where: {
        shopId: shopRow.id,
        orderId,
        type: { in: ["EARN", "IMPORT"] },
        points: { gt: 0 },
      },
      _sum: { points: true },
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
          reason: `Clawback: cancellation of order ${orderId}`,
          orderId,
          reversedForOrderId: orderId,
        });
      }
    }

    if (admin) {
      await clawbackStoreCreditForOrder({
        graphql: admin.graphql,
        shopId: shopRow.id,
        orderId,
      });
    }

    safeLog(topic, shop, "cancellation clawback applied");
  } catch (err) {
    safeLog(topic, shop, "cancel processing error");
    throw err;
  }

  return new Response(null, { status: 200 });
};
