// orders/create — earn points + cashback on purchase.
// Universal webhook contract (webhooks.server.ts / Phase 1):
//   1. authenticate.webhook() HMAC — throws 401 on invalid (never catch-and-200)
//   2. shouldProcess() dedup on X-Shopify-Event-Id
//   3. return 200 fast (work runs after the response promise is created; we keep
//      the unit of work small and bounded so the handler stays well under 5s)
//   4. no PII in any log line (safeLog only emits topic + shop domain + note)
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { shouldProcess, safeLog } from "../lib/webhooks.server";
import {
  awardForOrder,
  markRedemptionsUsedByOrder,
} from "../lib/loyalty.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // 1. HMAC. Invalid signature => authenticate.webhook throws a 401 Response.
  const { shop, topic, payload, admin } = await authenticate.webhook(request);

  // 2. Dedup on X-Shopify-Event-Id. Duplicate delivery => ack 200, do nothing.
  const first = await shouldProcess(request, topic);
  if (!first) {
    safeLog(topic, shop, "duplicate delivery ignored");
    return new Response(null, { status: 200 });
  }

  // 3. Compute & award. The work is a bounded set of DB writes + at most one
  //    SUM aggregation — no fan-out, no external calls — so it completes well
  //    within the webhook budget. canAwardLoyalty() is gated inside awardForOrder.
  try {
    const result = await awardForOrder(shop, payload as OrdersCreatePayload, {
      adminGraphql: admin?.graphql,
    });
    safeLog(topic, shop, `order processed (${result.outcome})`);
    // Mark any redemption rows whose code was applied to this order as
    // used, so the customer's active-codes list drops them. Failure here
    // is non-fatal for awarding — log and continue.
    try {
      const used = await markRedemptionsUsedByOrder(
        shop,
        payload as OrdersCreatePayload,
      );
      if (used > 0) safeLog(topic, shop, `redemption codes marked used (${used})`);
    } catch {
      safeLog(topic, shop, "redemption code mark-used failed");
    }

    // Referral payout: if the order's customer email matches an ACTIVE
    // pending referral row (one created when the friend signed up via a
    // referral link), mark it qualified and pay the referrer.
    try {
      const order = payload as OrdersCreatePayload;
      const email = order.customer?.email ?? "";
      if (email) {
        const { default: prisma } = await import("../db.server");
        const { qualifyReferralByEmail } = await import(
          "../lib/referrals.server"
        );
        const shopRow = await prisma.shop.findUnique({
          where: { shopDomain: shop },
          select: { id: true },
        });
        if (shopRow) {
          const res = await qualifyReferralByEmail({
            shopId: shopRow.id,
            refereeEmail: email,
            orderId: String(order.id),
          });
          safeLog(topic, shop, `referral by email: ${res.outcome}`);
        }
      }
    } catch {
      safeLog(topic, shop, "referral qualification failed");
    }
  } catch (err) {
    // Never leak PII. Log the shop + a generic note only.
    safeLog(topic, shop, "order processing error");
    // Re-throw so Shopify retries (transient DB error etc.). The dedup row was
    // already written; on retry shouldProcess returns false and we 200 — so a
    // poisoned event will not loop forever, but a transient one still retries
    // once within the same delivery window. Acceptable per Phase 1 contract.
    throw err;
  }

  // 4. Fast 200.
  return new Response(null, { status: 200 });
};

// Minimal shape of the orders/create REST-style webhook payload we rely on.
// Only the fields used for earn computation are typed; everything else ignored.
export interface OrdersCreatePayload {
  id: number | string;
  name?: string;
  current_total_price?: string;
  total_price?: string;
  subtotal_price?: string;
  currency?: string;
  customer?: {
    id?: number | string;
    email?: string;
    first_name?: string;
    last_name?: string;
  } | null;
  // Each discount applied to the order — Shopify ships `code` for code-based
  // discounts. We match against our Redemption.discountCode to flag used.
  discount_codes?: Array<{ code?: string; amount?: string; type?: string }>;
}
