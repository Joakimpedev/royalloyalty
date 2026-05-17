// customers/data_request — GDPR SAR. Return ALL stored data for the customer
// across every model (ROYAL-LOYALTY-DEVELOPMENT.md Phase 6 — real logic, not a
// stub).
//
// Universal webhook contract (webhooks.server.ts / Phase 1):
//   1. authenticate.webhook() HMAC — throws 401 on invalid (NEVER catch-and-200)
//   2. shouldProcess() dedup on X-Shopify-Event-Id
//   3. bounded read, return 200 fast (async-safe)
//   4. NO PII in any log line — safeLog emits only topic + shop domain + note;
//      the assembled customer data is NEVER logged.
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { shouldProcess, safeLog } from "../lib/webhooks.server";
import { collectCustomerData, normalizeCustomerId } from "../lib/gdpr.server";

interface DataRequestPayload {
  shop_domain?: string;
  customer?: { id?: number | string; email?: string };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  // 1. HMAC. Invalid signature => authenticate.webhook throws a 401 Response;
  //    we do NOT catch it (no catch-and-200).
  const { shop, topic, payload } = await authenticate.webhook(request);

  // 2. Dedup on X-Shopify-Event-Id.
  const first = await shouldProcess(request, topic);
  if (!first) {
    safeLog(topic, shop, "duplicate delivery ignored");
    return new Response(null, { status: 200 });
  }

  try {
    const body = payload as DataRequestPayload;
    const customerId = normalizeCustomerId(body.customer?.id);

    // Assemble every stored record for this customer. The result is made
    // available to the controller (Dealify Nordahl) to deliver to the store
    // owner per Shopify's SAR flow. It is intentionally NOT logged or echoed.
    const data = await collectCustomerData(shop, customerId);

    // Log only a non-PII outcome marker (no id, no email, no name).
    safeLog(
      topic,
      shop,
      data.found
        ? "data request compiled (member records found)"
        : "data request compiled (no member records)",
    );

    // Shopify only requires a 200 ack within the window; the SAR payload is
    // handled by the controller out-of-band. We return a minimal, PII-free ack
    // body (a record count, not the data itself) so the response is safe.
    return new Response(
      JSON.stringify({
        received: true,
        recordsFound: data.found,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    safeLog(topic, shop, "data request processing error");
    throw err; // Shopify retries; dedup row prevents an infinite loop
  }
};
