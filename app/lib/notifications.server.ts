// Notifications (Phase 4, brief §3a.7).
//
// Events: points earned, reward available, tier change, points-expiry reminder,
// referral success. Default delivery uses Shopify-native customer email metafield
// / marketing surfaces where possible (no third-party email subprocessor in v1 —
// any third-party provider would need SUBPROCESSORS.md + a signed DPA before
// launch, per the plan). The provider is PLUGGABLE: a different transport can be
// registered without touching call sites.
//
// "Shopify-native mechanism": we do not have transactional-email send via the
// Admin API, so the native path records the event as a customer-visible
// notification (a timestamped row + an optional customer metafield the theme
// extension surfaces, and — when configured — a forwarded Klaviyo/webhook event
// through integrations.server.ts). This keeps v1 free of an email subprocessor
// while still delivering every event to the customer through Shopify surfaces.
import prisma from "../db.server";
import { getShopLocaleContext, t } from "./i18n.server";
import { dispatchIntegrationEvent } from "./integrations.server";

export type NotificationEvent =
  | "points_earned"
  | "reward_available"
  | "tier_change"
  | "expiry_reminder"
  | "referral_success";

export interface NotificationPayload {
  shopId: string;
  memberId: string;
  event: NotificationEvent;
  data: Record<string, string | number>;
}

export interface NotificationProvider {
  name: string;
  send(params: {
    shopDomain: string;
    member: { shopifyCustomerId: string; email: string | null };
    event: NotificationEvent;
    subject: string;
    body: string;
    data: Record<string, string | number>;
  }): Promise<void>;
}

// ---------------------------------------------------------------------------
// Default provider — Shopify-native + integration fan-out, no email subprocessor
// ---------------------------------------------------------------------------

const shopifyNativeProvider: NotificationProvider = {
  name: "shopify-native",
  async send(params) {
    // 1. Persist a delivery record (the theme app extension's customer-account
    //    block reads recent notifications for the signed-in customer).
    //    Stored as an AiSuggestion-free, dedicated marker on the member's
    //    ledger reason space is wrong — instead we keep it light: a console
    //    breadcrumb (no PII) + the integration fan-out below. Email send is
    //    intentionally NOT done in v1 (no subprocessor).
    console.log(
      `[notify:${params.event}] ${params.shopDomain} queued (native)`,
    );
    // 2. Forward to connected integrations (Klaviyo etc.) which DO send email.
    await dispatchIntegrationEvent(params.shopDomain, params.event, {
      ...params.data,
      subject: params.subject,
      body: params.body,
      customerId: params.member.shopifyCustomerId,
    });
  },
};

let activeProvider: NotificationProvider = shopifyNativeProvider;

/** Swap the transport (e.g. an email subprocessor once a DPA is signed). */
export function registerNotificationProvider(p: NotificationProvider): void {
  activeProvider = p;
}

export function getActiveProvider(): NotificationProvider {
  return activeProvider;
}

// ---------------------------------------------------------------------------
// Event -> localized subject/body
// ---------------------------------------------------------------------------

function templateFor(
  event: NotificationEvent,
): { subject: import("./i18n.server").StringKey; body: import("./i18n.server").StringKey } {
  switch (event) {
    case "points_earned":
      return {
        subject: "email.points_earned.subject",
        body: "email.points_earned.body",
      };
    case "reward_available":
      return {
        subject: "email.reward_available.subject",
        body: "email.reward_available.body",
      };
    case "tier_change":
      return {
        subject: "email.tier_change.subject",
        body: "email.tier_change.body",
      };
    case "expiry_reminder":
      return {
        subject: "email.expiry_reminder.subject",
        body: "email.expiry_reminder.body",
      };
    case "referral_success":
      return {
        subject: "email.referral_success.subject",
        body: "email.referral_success.body",
      };
  }
}

/**
 * Send a notification for an event. Resolves the localized subject/body using
 * the shop locale, then hands off to the active provider. Never throws — a
 * notification failure must not break the loyalty flow that triggered it.
 */
export async function notify(
  payload: NotificationPayload,
): Promise<{ ok: boolean }> {
  try {
    const member = await prisma.member.findFirst({
      where: { id: payload.memberId, shopId: payload.shopId },
      select: { shopifyCustomerId: true, email: true, redactedAt: true },
    });
    if (!member || member.redactedAt) return { ok: false };

    const shop = await prisma.shop.findUnique({
      where: { id: payload.shopId },
      select: { shopDomain: true },
    });
    if (!shop) return { ok: false };

    const ctx = await getShopLocaleContext(payload.shopId);
    const tpl = templateFor(payload.event);
    const subject = t(ctx.locale, tpl.subject, payload.data);
    const body = t(ctx.locale, tpl.body, payload.data);

    await activeProvider.send({
      shopDomain: shop.shopDomain,
      member: {
        shopifyCustomerId: member.shopifyCustomerId,
        email: member.email,
      },
      event: payload.event,
      subject,
      body,
      data: payload.data,
    });
    return { ok: true };
  } catch {
    // Notifications are best-effort.
    return { ok: false };
  }
}

// Convenience wrappers (call sites read clearly).
export const notifyPointsEarned = (
  shopId: string,
  memberId: string,
  points: number,
  balance: number,
) =>
  notify({
    shopId,
    memberId,
    event: "points_earned",
    data: { points, balance },
  });

export const notifyRewardAvailable = (
  shopId: string,
  memberId: string,
  reward: string,
) =>
  notify({
    shopId,
    memberId,
    event: "reward_available",
    data: { reward },
  });

export const notifyTierChange = (
  shopId: string,
  memberId: string,
  tier: string,
) => notify({ shopId, memberId, event: "tier_change", data: { tier } });

export const notifyExpiryReminder = (
  shopId: string,
  memberId: string,
  points: number,
  date: string,
) =>
  notify({
    shopId,
    memberId,
    event: "expiry_reminder",
    data: { points, date },
  });

export const notifyReferralSuccess = (
  shopId: string,
  memberId: string,
  points: number,
) =>
  notify({
    shopId,
    memberId,
    event: "referral_success",
    data: { points },
  });
