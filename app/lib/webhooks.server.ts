// Universal webhook contract (ROYAL-LOYALTY-DEVELOPMENT.md Phase 1):
// 1. HMAC via authenticate.webhook() (caller does this; 401 on invalid — never
//    catch-and-200)  2. dedup on X-Shopify-Event-Id  3. enqueue slow work, 200 fast
// 4. no PII in logs. Every webhook route uses processOnce() then returns 200 quick.
import prisma from "../db.server";

/**
 * Returns true if this event should be processed now (first time seen),
 * false if it is a duplicate delivery. Keyed on X-Shopify-Event-Id — the
 * header X-Shopify-Webhook-Id does NOT exist.
 */
export async function shouldProcess(request: Request, topic: string): Promise<boolean> {
  const eventId = request.headers.get("X-Shopify-Event-Id");
  if (!eventId) return true; // be permissive if header absent; handlers stay idempotent
  try {
    await prisma.processedWebhook.create({ data: { eventId, topic } });
    return true;
  } catch {
    // unique violation = already processed
    return false;
  }
}

// Log helper that NEVER emits PII. Use in all webhook/GDPR handlers.
export function safeLog(topic: string, shopDomain: string, note: string) {
  // shopDomain is not PII (it is the store, not a person). No customer email/name/id.
  console.log(`[webhook:${topic}] ${shopDomain} ${note}`);
}
