// shop/redact — GDPR shop erasure. Cancel billing FIRST, then deleteMany across
// the EXPLICIT full model list (ROYAL-LOYALTY-DEVELOPMENT.md Phase 6 — real
// logic, not a stub). Async/queued pattern: HMAC + dedup synchronously, then
// run the (bounded, transactional) deletion and ack.
//
// Universal webhook contract (webhooks.server.ts / Phase 1):
//   1. authenticate.webhook() HMAC — throws 401 on invalid (NEVER catch-and-200)
//   2. shouldProcess() dedup on X-Shopify-Event-Id
//   3. bounded transactional deletes, return 200 fast (idempotent)
//   4. NO PII in any log line (safeLog: topic + shop domain + note only)
//
// shop/redact fires ~48h after uninstall. The session/token may be gone, so
// billing cancellation is best-effort via the offline session if one still
// exists — but the subscription is normally already cancelled by the
// app/uninstalled handler (cross-file wiring; see orchestrator notes).
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { shouldProcess, safeLog } from "../lib/webhooks.server";
import { redactShop } from "../lib/gdpr.server";
import { cancelActiveSubscription } from "../lib/billing.server";
import { withFreshToken } from "../lib/token.server";

interface ShopRedactPayload {
  shop_domain?: string;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  // 1. HMAC (401 on invalid — not caught).
  const { shop, topic } = await authenticate.webhook(request);

  // 2. Dedup.
  const first = await shouldProcess(request, topic);
  if (!first) {
    safeLog(topic, shop, "duplicate delivery ignored");
    return new Response(null, { status: 200 });
  }

  try {
    // Cancel billing FIRST (best-effort). If the offline session still exists
    // we cancel any lingering active subscription so no charge outlives the
    // data. Normally already cancelled by app/uninstalled — this is the
    // belt-and-braces path required by Phase 6.
    try {
      await withFreshToken(shop, async (admin) => {
        await cancelActiveSubscription(admin.graphql);
        return null;
      });
    } catch {
      // No usable session/token (expected ~48h post-uninstall). The
      // subscription was cancelled at uninstall; proceed to data deletion.
      safeLog(topic, shop, "billing cancel skipped (no active session)");
    }

    // Delete EVERY model for the shop (explicit enumerated list in redactShop,
    // verified against prisma/schema.prisma). Idempotent.
    const existed = await redactShop(shop);
    safeLog(
      topic,
      shop,
      existed ? "shop data fully deleted" : "shop already absent — ack",
    );
  } catch (err) {
    safeLog(topic, shop, "shop redact processing error");
    throw err; // Shopify retries; dedup row prevents an infinite loop
  }

  return new Response(null, { status: 200 });
};
