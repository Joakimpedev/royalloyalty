// customers/redact — GDPR erasure. Anonymise the customer's PII (name -> null,
// email -> "[redacted]"), set Member.redactedAt, KEEP records (ledger integrity
// / financial reconciliation), idempotent (ROYAL-LOYALTY-DEVELOPMENT.md
// Phase 6 — real logic, not a stub).
//
// Universal webhook contract (webhooks.server.ts / Phase 1):
//   1. authenticate.webhook() HMAC — throws 401 on invalid (NEVER catch-and-200)
//   2. shouldProcess() dedup on X-Shopify-Event-Id
//   3. bounded writes, return 200 fast (async-safe; idempotent)
//   4. NO PII in any log line (safeLog: topic + shop domain + note only)
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { shouldProcess, safeLog } from "../lib/webhooks.server";
import { redactCustomer, normalizeCustomerId } from "../lib/gdpr.server";

interface CustomerRedactPayload {
  shop_domain?: string;
  customer?: { id?: number | string; email?: string };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  // 1. HMAC (401 on invalid — not caught).
  const { shop, topic, payload } = await authenticate.webhook(request);

  // 2. Dedup.
  const first = await shouldProcess(request, topic);
  if (!first) {
    safeLog(topic, shop, "duplicate delivery ignored");
    return new Response(null, { status: 200 });
  }

  try {
    const body = payload as CustomerRedactPayload;
    const customerId = normalizeCustomerId(body.customer?.id);

    // Idempotent: members already redacted are skipped inside redactCustomer.
    const { redacted, alreadyRedacted } = await redactCustomer(
      shop,
      customerId,
    );

    // Non-PII counts only.
    safeLog(
      topic,
      shop,
      `customer redact done (redacted=${redacted} alreadyRedacted=${alreadyRedacted})`,
    );
  } catch (err) {
    safeLog(topic, shop, "customer redact processing error");
    throw err; // Shopify retries; dedup row prevents an infinite loop
  }

  return new Response(null, { status: 200 });
};
