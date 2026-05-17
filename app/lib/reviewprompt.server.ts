// In-app review prompt (Phase 4, brief §3a — Domain 19/20 HIGH).
//
// Trigger ONLY after the first successful customer redemption, via the App
// Bridge Reviews API (NOT a custom modal/link — a custom review CTA is a
// rejection-class issue). The outcome is persisted to Shop.reviewPromptState
// (DB, never localStorage — re-prompting on device change is a known 2/2
// regression). Once DISMISSED_DONT_ASK or COMPLETED we never prompt again.
import prisma from "../db.server";
import type { ReviewPromptState } from "@prisma/client";

/**
 * Decide whether the embedded admin should fire the App Bridge review prompt on
 * this load. True only when:
 *  - the shop is not in a terminal review state (DISMISSED_DONT_ASK / COMPLETED)
 *  - at least one redemption has reached COMPLETED (first successful redemption)
 *
 * This is read in the app layout loader; the client calls the App Bridge
 * Reviews API when it returns true, then reports the outcome back.
 */
export async function shouldPromptForReview(
  shopId: string,
): Promise<boolean> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { reviewPromptState: true },
  });
  if (!shop) return false;
  if (
    shop.reviewPromptState === "DISMISSED_DONT_ASK" ||
    shop.reviewPromptState === "COMPLETED"
  ) {
    return false;
  }

  const firstSuccess = await prisma.redemption.findFirst({
    where: { shopId, status: "COMPLETED" },
    select: { id: true },
  });
  if (!firstSuccess) return false;

  // NOT_SHOWN or SHOWN (a prior show that was neither completed nor dismissed —
  // App Bridge may have been dismissed transiently; allowed to re-attempt until
  // a terminal outcome is recorded). The App Bridge API itself also rate-limits.
  return true;
}

/**
 * Record the App Bridge review outcome. Maps the App Bridge result to the
 * persisted enum. Idempotent and monotonic — never downgrades a terminal state.
 *
 * App Bridge `shopify.reviews.request()` resolves with `{ success, code }`.
 *  - success true                       -> SHOWN (modal displayed; final
 *                                          completion is reported by Shopify,
 *                                          but we mark SHOWN so we don't spam)
 *  - code "already-reviewed"            -> COMPLETED
 *  - code "annual-limit-reached" / etc. -> SHOWN (try again next window)
 * An explicit user "don't ask again" (our own opt-out control, allowed
 * alongside the native prompt) -> DISMISSED_DONT_ASK.
 */
export async function recordReviewOutcome(
  shopId: string,
  outcome: "shown" | "completed" | "dismissed_dont_ask",
): Promise<void> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { reviewPromptState: true },
  });
  if (!shop) return;
  const current = shop.reviewPromptState;
  // Terminal states are never overwritten.
  if (current === "DISMISSED_DONT_ASK" || current === "COMPLETED") return;

  const next: ReviewPromptState =
    outcome === "completed"
      ? "COMPLETED"
      : outcome === "dismissed_dont_ask"
        ? "DISMISSED_DONT_ASK"
        : "SHOWN";

  await prisma.shop.update({
    where: { id: shopId },
    data: { reviewPromptState: next },
  });
}
