// Settings — plan & billing management (ROYAL-LOYALTY-DEVELOPMENT.md Phase 5).
//
// Self-serve upgrade / downgrade / cancel. Prices shown BEFORE subscribe.
// Volume-gate messaging is neutral / informational only — no fear framing, no
// hidden data, NO feature gating (every feature is on every plan; only the
// monthly loyalty-order volume differs). Save bar wired with useBlocker() on
// the one form surface here (the integrations note form is read-only display;
// the plan actions are immediate POSTs, not a dirty form, so the save bar is
// shown only when the contact-email field is edited).
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  useLoaderData,
  useActionData,
  useNavigation,
  useSubmit,
  useBlocker,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  PLANS,
  PLAN_ORDER,
  planDef,
  subscribeToPlan,
  cancelActiveSubscription,
  managedPricingUrl,
  billingTestMode,
} from "../lib/billing.server";
import { getQuotaState } from "../lib/quota.server";

async function requireShop(shopDomain: string) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Response("Shop not found", { status: 404 });
  return shop;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const quota = await getQuotaState(shop.id);

  return {
    shopDomain: shop.shopDomain,
    plan: shop.plan,
    planStatus: shop.planStatus,
    quota: quota
      ? {
          used: quota.used,
          cap: quota.cap,
          remaining: quota.remaining,
          overCap: quota.overCap,
        }
      : { used: 0, cap: planDef(shop.plan).cap, remaining: null, overCap: false },
    plans: PLAN_ORDER.map((t) => ({
      tier: t,
      name: PLANS[t].name,
      priceUsd: PLANS[t].priceUsd,
      cap: PLANS[t].cap,
      trialDays: PLANS[t].trialDays,
      blurb: PLANS[t].blurb,
    })),
    testMode: billingTestMode(),
    contactEmail:
      (shop.aiConfigSnapshot &&
      typeof shop.aiConfigSnapshot === "object" &&
      (shop.aiConfigSnapshot as Record<string, unknown>).supportEmail) ||
      "",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");

  if (intent === "save_contact") {
    const email = String(form.get("supportEmail") ?? "").trim();
    const base =
      shop.aiConfigSnapshot && typeof shop.aiConfigSnapshot === "object"
        ? (shop.aiConfigSnapshot as Record<string, unknown>)
        : {};
    await prisma.shop.update({
      where: { id: shop.id },
      data: { aiConfigSnapshot: { ...base, supportEmail: email } },
    });
    return { ok: true, message: "Support contact saved." };
  }

  if (intent === "subscribe") {
    const tier = String(form.get("tier") ?? "") as keyof typeof PLANS;
    if (!PLANS[tier]) {
      return { ok: false, message: "Unknown plan selected." };
    }
    const url = new URL(request.url);
    const returnUrl = `${url.origin}/app/settings`;

    if (PLANS[tier].priceUsd <= 0) {
      // Downgrade to Free: cancel any active subscription, set plan now.
      await cancelActiveSubscription(admin.graphql);
      await prisma.shop.update({
        where: { id: shop.id },
        data: { plan: "FREE", planStatus: "ACTIVE", subscriptionId: null },
      });
      return {
        ok: true,
        message:
          "You are now on the Free plan. Every feature stays available; only the monthly loyalty-order volume changes.",
      };
    }

    const res = await subscribeToPlan({
      graphql: admin.graphql,
      tier,
      returnUrl,
    });
    if (!res.ok || !res.confirmationUrl) {
      return {
        ok: false,
        message:
          res.error ?? "Could not start the subscription. Please try again.",
      };
    }
    // The merchant must approve the charge on Shopify's hosted page. The plan
    // flips when Shopify fires app_subscriptions/update.
    return { ok: true, redirectTo: res.confirmationUrl };
  }

  if (intent === "cancel") {
    const res = await cancelActiveSubscription(admin.graphql);
    if (!res.ok) {
      return {
        ok: false,
        message:
          res.error ?? "Could not cancel the subscription. Please try again.",
      };
    }
    await prisma.shop.update({
      where: { id: shop.id },
      data: { plan: "FREE", planStatus: "CANCELLED", subscriptionId: null },
    });
    return {
      ok: true,
      message:
        "Subscription cancelled. You remain on the Free plan with every feature available.",
    };
  }

  if (intent === "managed_pricing") {
    // Preferred path: hand off to Shopify-hosted Managed Pricing. appHandle is
    // configured in the Partner Dashboard; SHOPIFY_APP_HANDLE env mirrors it.
    const handle = process.env.SHOPIFY_APP_HANDLE || "royal-loyalty";
    return { ok: true, redirectTo: managedPricingUrl(shop.shopDomain, handle) };
  }

  return { ok: false, message: "Unknown action." };
};

export default function SettingsPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const saveBarRef = useRef<HTMLElement | null>(null);

  const [contactEmail, setContactEmail] = useState(
    String(data.contactEmail ?? ""),
  );
  const dirty = contactEmail !== String(data.contactEmail ?? "");
  const busy = nav.state === "submitting";

  // Client-side redirect to Shopify-hosted confirmation / managed pricing.
  useEffect(() => {
    if (actionData && "redirectTo" in actionData && actionData.redirectTo) {
      const target = actionData.redirectTo as string;
      if (window.top) {
        window.top.location.href = target;
      } else {
        window.location.href = target;
      }
    }
  }, [actionData]);

  // Block link/breadcrumb nav while the contact field has unsaved edits.
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) =>
        dirty && currentLocation.pathname !== nextLocation.pathname,
      [dirty],
    ),
  );
  useEffect(() => {
    if (blocker.state === "blocked" && !dirty) blocker.reset?.();
  }, [blocker, dirty]);

  useEffect(() => {
    const el = saveBarRef.current as
      | (HTMLElement & { show?: () => void; hide?: () => void })
      | null;
    if (!el) return;
    if (dirty) el.show?.();
    else el.hide?.();
  }, [dirty]);

  const saveContact = useCallback(() => {
    submit(
      { _intent: "save_contact", supportEmail: contactEmail },
      { method: "POST" },
    );
  }, [contactEmail, submit]);

  const currentDef = data.plans.find((p) => p.tier === data.plan)!;
  const usagePct =
    data.quota.cap && data.quota.cap > 0
      ? Math.min(100, Math.round((data.quota.used / data.quota.cap) * 100))
      : null;

  return (
    <s-page heading="Settings">
      <s-button slot="primary-action" href="/app">
        Back to Home
      </s-button>

      {/* @ts-expect-error - ui-save-bar is an App Bridge custom element */}
      <ui-save-bar id="settings-save-bar" ref={saveBarRef}>
        <button
          variant="primary"
          onClick={saveContact}
          {...(busy ? { loading: "" } : {})}
        >
          Save
        </button>
        <button onClick={() => setContactEmail(String(data.contactEmail ?? ""))}>
          Discard
        </button>
        {/* @ts-expect-error - ui-save-bar custom element */}
      </ui-save-bar>

      {actionData && !actionData.ok && (
        <s-section>
          <s-banner tone="critical" heading="Could not complete that action">
            <s-paragraph>{actionData.message}</s-paragraph>
          </s-banner>
        </s-section>
      )}
      {actionData && actionData.ok && "message" in actionData && (
        <s-section>
          <s-banner tone="success">
            <s-paragraph>{actionData.message}</s-paragraph>
          </s-banner>
        </s-section>
      )}

      {data.testMode && (
        <s-section>
          <s-banner tone="info" heading="Billing test mode is on">
            <s-paragraph>
              This environment is not running in production, so subscriptions
              are created in Shopify test mode and no real charges are made.
            </s-paragraph>
          </s-banner>
        </s-section>
      )}

      {data.planStatus === "FROZEN" && (
        <s-section>
          <s-banner tone="warning" heading="Subscription paused by Shopify">
            <s-paragraph>
              Shopify has paused this subscription (typically a billing matter
              on the store&apos;s side). Your program keeps running on the Free
              volume allowance until the subscription resumes. No data or
              features are affected.
            </s-paragraph>
          </s-banner>
        </s-section>
      )}

      {/* Usage vs cap — neutral, informational, no fear framing, no hidden data */}
      <s-section heading="Plan & usage">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="large">
            <s-stack direction="block" gap="none">
              <s-text tone="subdued">Current plan</s-text>
              <s-heading>{currentDef.name}</s-heading>
            </s-stack>
            <s-stack direction="block" gap="none">
              <s-text tone="subdued">Loyalty orders this month</s-text>
              <s-heading>
                {data.quota.used.toLocaleString()}
                {currentDef.cap === null
                  ? ""
                  : ` / ${currentDef.cap.toLocaleString()}`}
              </s-heading>
            </s-stack>
            <s-stack direction="block" gap="none">
              <s-text tone="subdued">Status</s-text>
              <s-badge
                tone={
                  data.planStatus === "ACTIVE"
                    ? "success"
                    : data.planStatus === "FROZEN"
                      ? "warning"
                      : "neutral"
                }
              >
                {data.planStatus}
              </s-badge>
            </s-stack>
          </s-stack>

          {usagePct !== null && (
            <s-stack direction="block" gap="none">
              <s-text tone="subdued">
                {usagePct}% of this month&apos;s allowance used.
              </s-text>
              <s-text tone="subdued">
                {data.quota.remaining === null
                  ? "Unlimited loyalty orders on this plan."
                  : `${data.quota.remaining.toLocaleString()} loyalty orders remaining this month.`}
              </s-text>
            </s-stack>
          )}

          {data.quota.overCap && (
            <s-banner tone="info" heading="Monthly loyalty-order limit reached">
              <s-paragraph>
                You&apos;ve reached the {currentDef.name} plan&apos;s allowance
                of {currentDef.cap?.toLocaleString()} loyalty orders this month.
                New orders won&apos;t accrue points or cashback until the count
                resets at the start of next month, or you move to a higher
                volume plan. Every feature stays available and no existing data
                is affected — this is a volume allowance, not a feature limit.
              </s-paragraph>
            </s-banner>
          )}

          <s-paragraph>
            A &quot;loyalty order&quot; is a single order that earned points or
            cashback, or redeemed points or store credit, through Royal this
            calendar month. An order counts once no matter how many loyalty
            actions it triggers. The count resets at the start of each month.
          </s-paragraph>
        </s-stack>
      </s-section>

      {/* Plan picker — prices shown BEFORE subscribe; no feature gating copy */}
      <s-section heading="Choose a plan">
        <s-paragraph>
          Every plan includes every feature — points, VIP tiers, referrals,
          store credit, AI setup and branding. Plans differ only by how many
          loyalty orders you can process per month.
        </s-paragraph>
        <s-stack direction="block" gap="base">
          {data.plans.map((p) => {
            const isCurrent = p.tier === data.plan;
            return (
              <s-box
                key={p.tier}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack direction="block" gap="base">
                  <s-stack direction="inline" gap="base">
                    <s-text fontWeight="bold">{p.name}</s-text>
                    {isCurrent && <s-badge tone="success">Current</s-badge>}
                  </s-stack>
                  <s-text>
                    {p.priceUsd === 0
                      ? "Free"
                      : `$${p.priceUsd}/month`}
                    {p.trialDays > 0 ? ` · ${p.trialDays}-day free trial` : ""}
                  </s-text>
                  <s-text tone="subdued">
                    {p.cap === null
                      ? "High-volume: 2,000+ loyalty orders per month"
                      : `Up to ${p.cap.toLocaleString()} loyalty orders per month`}
                  </s-text>
                  <s-text tone="subdued">{p.blurb}</s-text>
                  {!isCurrent && (
                    <s-button
                      variant={p.priceUsd === 0 ? "secondary" : "primary"}
                      onClick={() =>
                        submit(
                          { _intent: "subscribe", tier: p.tier },
                          { method: "POST" },
                        )
                      }
                      {...(busy ? { loading: "" } : {})}
                    >
                      {p.priceUsd === 0
                        ? "Switch to Free"
                        : `Subscribe — $${p.priceUsd}/mo`}
                    </s-button>
                  )}
                </s-stack>
              </s-box>
            );
          })}
        </s-stack>

        <s-stack direction="inline" gap="base">
          <s-button
            variant="secondary"
            onClick={() =>
              submit({ _intent: "managed_pricing" }, { method: "POST" })
            }
          >
            Manage plan on Shopify
          </s-button>
          {data.plan !== "FREE" && (
            <s-button
              tone="critical"
              onClick={() =>
                submit({ _intent: "cancel" }, { method: "POST" })
              }
              {...(busy ? { loading: "" } : {})}
            >
              Cancel subscription
            </s-button>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Support contact">
        <s-paragraph>
          The email shown to your team for billing and plan questions inside
          Royal.
        </s-paragraph>
        <s-text-field
          label="Support email"
          type="email"
          value={contactEmail}
          onChange={(e: { target: { value: string } }) =>
            setContactEmail(e.target.value)
          }
        />
      </s-section>

      {blocker.state === "blocked" && (
        <s-section>
          <s-banner tone="warning" heading="You have unsaved changes">
            <s-stack direction="inline" gap="base">
              <s-button
                variant="primary"
                onClick={() => blocker.proceed?.()}
              >
                Leave without saving
              </s-button>
              <s-button onClick={() => blocker.reset?.()}>
                Stay on page
              </s-button>
            </s-stack>
          </s-banner>
        </s-section>
      )}
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
