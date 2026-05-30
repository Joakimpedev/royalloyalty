// Billing — Shopify Billing API only (no Stripe), volume-gated, NO feature gating.
// ROYAL-LOYALTY-DEVELOPMENT.md Phase 5 + BUILD-BRIEF §6.
//
// ─────────────────────────────────────────────────────────────────────────────
// "LOYALTY ORDER" DEFINITION (must be identical here, in the dev plan, and in
// the Partner Dashboard plan descriptions — Essent-aligned so comparisons hold):
//
//   A "loyalty order" is a single Shopify order that, within the current
//   calendar-month quota period, caused Royal to EARN points/cashback OR
//   REDEEM points/store-credit for a member. An order is counted at most ONCE
//   per quota period regardless of how many earn/redeem events it triggers.
//   Orders that never interacted with Royal (no member, no earn, no redeem) do
//   NOT count. Imported historical orders do NOT count (migration bypasses the
//   award path). Clawbacks/refunds do NOT decrement the count — the order still
//   consumed processing that period.
//
// The running tally is Shop.monthlyLoyaltyOrderCount; it resets when the
// calendar month rolls past Shop.quotaPeriodStart (see quota.server.ts). This
// file owns the PLAN TABLE and the Shopify Billing mutations; quota.server.ts
// owns the count-vs-cap comparison.
// ─────────────────────────────────────────────────────────────────────────────
import type { PlanTier } from "@prisma/client";
import prisma from "../db.server";

export interface PlanDef {
  tier: PlanTier;
  /** Exact name shown to merchants and used as the Shopify subscription line
   * name. Must match the Partner Dashboard managed-pricing plan name verbatim. */
  name: string;
  /** Monthly price in USD. 0 = free plan (no Shopify subscription created). */
  priceUsd: number;
  /** Monthly loyalty-order cap. null = effectively unlimited (Pro). */
  cap: number | null;
  /** Trial days applied when subscribing to this paid plan (0 for FREE). */
  trialDays: number;
  /** Human description for the Settings UI (neutral/informational only). */
  blurb: string;
}

// Prices: entry $10 is LOCKED (DEC-04 / brief §6). Growth $29 / Pro $79 mirror
// live Essent's volume steps (brief §6 "copy whatever Essent is doing").
// Caps: Free 250 / Starter 500 / Growth 2,000 / Pro effectively unlimited.
export const PLANS: Record<PlanTier, PlanDef> = {
  FREE: {
    tier: "FREE",
    name: "Free",
    priceUsd: 0,
    cap: 250,
    trialDays: 0,
    blurb:
      "All features — points, VIP tiers, referrals, store credit, AI setup, branding. Up to 250 loyalty orders per month.",
  },
  STARTER: {
    tier: "STARTER",
    name: "Starter",
    priceUsd: 10,
    cap: 500,
    trialDays: 14,
    blurb:
      "Everything in Free, with room for up to 500 loyalty orders per month.",
  },
  GROWTH: {
    tier: "GROWTH",
    name: "Growth",
    priceUsd: 20,
    cap: 2000,
    trialDays: 14,
    blurb:
      "Everything in Free, with room for up to 2,000 loyalty orders per month.",
  },
  PRO: {
    tier: "PRO",
    name: "Pro",
    priceUsd: 49,
    cap: null,
    trialDays: 14,
    blurb:
      "Everything in Free, with high-volume capacity for 2,000+ loyalty orders per month.",
  },
};

export const PLAN_ORDER: PlanTier[] = ["FREE", "STARTER", "GROWTH", "PRO"];

export function planDef(tier: PlanTier): PlanDef {
  return PLANS[tier];
}

/**
 * Billing test mode. Driven SOLELY by NODE_ENV — NOT hardcoded, NOT behind a
 * commented-out check. Production MUST set NODE_ENV=production explicitly on
 * Railway (Phase 0); if it is unset there, this returns true and NO ONE is
 * billed (the known 2/2 pattern this is written to surface, not hide).
 *
 * NOTE: this is the *environment* signal only. `subscribeToPlan` ORs this
 * with `isDevelopmentStore()` so dev stores always get test charges (Shopify
 * rejects real charges against a dev store) even on a NODE_ENV=production
 * Railway deploy.
 */
export function billingTestMode(): boolean {
  return process.env.NODE_ENV !== "production";
}

const SHOP_PLAN_QUERY = `#graphql
  query shopPlan { shop { plan { partnerDevelopment } } }`;

/**
 * Whether the calling shop is a Shopify Partner development store. Shopify
 * rejects real (non-test) AppSubscription charges against dev stores, so we
 * must always set test=true for them regardless of NODE_ENV. Failures fall
 * back to `false` (the safer default — a wrong `true` only means a real
 * charge would have been attempted, which Shopify will reject cleanly).
 */
export async function isDevelopmentStore(
  graphql: GraphqlClient,
): Promise<boolean> {
  try {
    const resp = await graphql(SHOP_PLAN_QUERY);
    const body = await resp.json();
    return body?.data?.shop?.plan?.partnerDevelopment === true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shopify Billing — GraphQL Admin API. Managed Pricing is PREFERRED: the merchant
// is sent to Shopify's hosted plan-selection page and Shopify creates the
// AppSubscription + fires app_subscriptions/update. We still implement the
// programmatic mutations (appSubscriptionCreate / appSubscriptionCancel — named
// exactly) for the self-serve in-app flow and for cancellation, which Managed
// Pricing does not cover from inside the app.
// ─────────────────────────────────────────────────────────────────────────────

type GraphqlClient = (
  query: string,
  options?: { variables?: Record<string, unknown> },
) => Promise<{ json: () => Promise<any> }>;

/**
 * Managed Pricing redirect URL. When the Partner Dashboard has Managed Pricing
 * configured, sending the merchant here lets Shopify handle plan selection,
 * proration, trials and the subscription lifecycle. `appHandle` is the app's
 * handle in the Partner Dashboard.
 *
 * Returns a `shopify:admin/...` URL so App Bridge intercepts the click in the
 * embedded admin and navigates the parent frame WITHOUT destroying our iframe
 * session. The `shopDomain` parameter is kept for backwards compatibility but
 * is no longer used in the URL (App Bridge already knows the store context).
 */
export function managedPricingUrl(_shopDomain: string, appHandle: string): string {
  return `shopify:admin/charges/${appHandle}/pricing_plans`;
}

const APP_SUBSCRIPTION_CREATE = `#graphql
  mutation appSubscriptionCreate(
    $name: String!
    $lineItems: [AppSubscriptionLineItemInput!]!
    $returnUrl: URL!
    $test: Boolean!
    $trialDays: Int
  ) {
    appSubscriptionCreate(
      name: $name
      lineItems: $lineItems
      returnUrl: $returnUrl
      test: $test
      trialDays: $trialDays
      replacementBehavior: STANDARD
    ) {
      appSubscription { id status }
      confirmationUrl
      userErrors { field message }
    }
  }`;

const APP_SUBSCRIPTION_CANCEL = `#graphql
  mutation appSubscriptionCancel($id: ID!) {
    appSubscriptionCancel(id: $id) {
      appSubscription { id status }
      userErrors { field message }
    }
  }`;

const ACTIVE_SUBSCRIPTIONS_QUERY = `#graphql
  query activeSubscriptions {
    currentAppInstallation {
      activeSubscriptions { id name status }
    }
  }`;

export interface SubscribeResult {
  ok: boolean;
  /** Shopify-hosted confirmation page the merchant must approve the charge on. */
  confirmationUrl?: string;
  error?: string;
}

/**
 * Create a recurring app subscription for a paid plan. FREE returns ok without
 * a charge (no subscription line for $0). On success the merchant is redirected
 * to `confirmationUrl`; the actual plan flip happens when Shopify fires
 * app_subscriptions/update (handled in webhooks.app_subscriptions.update.tsx).
 */
export async function subscribeToPlan(params: {
  graphql: GraphqlClient;
  tier: PlanTier;
  returnUrl: string;
}): Promise<SubscribeResult> {
  const def = planDef(params.tier);
  if (def.priceUsd <= 0) {
    // FREE: no Shopify subscription is created for a $0 plan. The caller cancels
    // any existing paid subscription and sets the plan to FREE directly.
    return { ok: true };
  }

  // test=true if either the env is non-production OR the calling shop is a
  // Partner development store (Shopify rejects real charges against dev
  // stores). The dev-store check costs one extra GraphQL round-trip per
  // subscribe — acceptable for a one-time flow.
  const devStore = await isDevelopmentStore(params.graphql);
  const test = billingTestMode() || devStore;

  const resp = await params.graphql(APP_SUBSCRIPTION_CREATE, {
    variables: {
      name: def.name,
      returnUrl: params.returnUrl,
      test,
      trialDays: def.trialDays,
      lineItems: [
        {
          plan: {
            appRecurringPricingDetails: {
              price: { amount: def.priceUsd, currencyCode: "USD" },
              interval: "EVERY_30_DAYS",
            },
          },
        },
      ],
    },
  });
  const body = await resp.json();
  const result = body?.data?.appSubscriptionCreate;
  const errs = result?.userErrors as Array<{ message: string }> | undefined;
  if (errs && errs.length > 0) {
    return { ok: false, error: errs.map((e) => e.message).join("; ") };
  }
  const url = result?.confirmationUrl as string | undefined;
  if (!url) {
    return { ok: false, error: "Shopify did not return a confirmation URL." };
  }
  return { ok: true, confirmationUrl: url };
}

/**
 * Cancel the shop's active app subscription(s). Used for self-serve cancel,
 * downgrade-to-Free, and is also called from the uninstall + shop/redact paths
 * (cross-file wiring — see orchestrator notes). Idempotent: no active
 * subscription => ok with nothing to do.
 */
export async function cancelActiveSubscription(
  graphql: GraphqlClient,
): Promise<{ ok: boolean; cancelled: number; error?: string }> {
  const resp = await graphql(ACTIVE_SUBSCRIPTIONS_QUERY);
  const body = await resp.json();
  const subs: Array<{ id: string; status: string }> =
    body?.data?.currentAppInstallation?.activeSubscriptions ?? [];
  if (subs.length === 0) return { ok: true, cancelled: 0 };

  let cancelled = 0;
  const errors: string[] = [];
  for (const sub of subs) {
    const cResp = await graphql(APP_SUBSCRIPTION_CANCEL, {
      variables: { id: sub.id },
    });
    const cBody = await cResp.json();
    const cResult = cBody?.data?.appSubscriptionCancel;
    const errs = cResult?.userErrors as Array<{ message: string }> | undefined;
    if (errs && errs.length > 0) {
      errors.push(errs.map((e) => e.message).join("; "));
    } else {
      cancelled++;
    }
  }
  return errors.length
    ? { ok: false, cancelled, error: errors.join("; ") }
    : { ok: true, cancelled };
}

/**
 * Resolve a Shopify AppSubscription status string to our PlanStatus enum.
 * ACTIVE restores paid status (incl. a frozen store un-freezing).
 */
export function mapSubscriptionStatus(
  status: string | undefined | null,
): "ACTIVE" | "FROZEN" | "CANCELLED" | "EXPIRED" {
  switch ((status ?? "").toUpperCase()) {
    case "ACTIVE":
    case "ACCEPTED":
      return "ACTIVE";
    case "FROZEN":
      return "FROZEN";
    case "CANCELLED":
    case "DECLINED":
      return "CANCELLED";
    case "EXPIRED":
    default:
      return "EXPIRED";
  }
}

/**
 * Map a Shopify subscription line name back to a PlanTier (the webhook payload
 * carries the name we set in subscribeToPlan). Falls back to FREE if unknown
 * (e.g. a cancelled/expired subscription leaves the shop on Free).
 */
export function tierFromSubscriptionName(name: string | undefined): PlanTier {
  const n = (name ?? "").trim().toLowerCase();
  for (const tier of PLAN_ORDER) {
    if (PLANS[tier].name.toLowerCase() === n) return tier;
  }
  return "FREE";
}

/** Convenience: load the plan + usage snapshot for a shop (Settings UI). */
export async function getBillingSnapshot(shopId: string) {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: {
      plan: true,
      planStatus: true,
      subscriptionId: true,
      monthlyLoyaltyOrderCount: true,
      quotaPeriodStart: true,
    },
  });
  if (!shop) return null;
  const def = planDef(shop.plan);
  return {
    plan: shop.plan,
    planStatus: shop.planStatus,
    subscriptionId: shop.subscriptionId,
    cap: def.cap,
    used: shop.monthlyLoyaltyOrderCount,
    quotaPeriodStart: shop.quotaPeriodStart,
    def,
  };
}
