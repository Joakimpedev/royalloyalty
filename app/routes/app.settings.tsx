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
import { AppLink, useAppNavigate } from "../lib/app-navigate";

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
  const appNav = useAppNavigate();
  const saveBarRef = useRef<HTMLElement | null>(null);

  const [contactEmail, setContactEmail] = useState(
    String(data.contactEmail ?? ""),
  );
  const dirty = contactEmail !== String(data.contactEmail ?? "");
  const busy = nav.state === "submitting";

  // Client-side redirect to Shopify-hosted confirmation / managed pricing.
  //
  // ⚠ IFRAME AUTH: We're in an embedded admin iframe; setting
  // `window.top.location.href = url` force-replaces the iframe's parent and
  // destroys the embedded session, leaving the merchant on a broken auth
  // page. Instead we hand the URL to App Bridge (`window.shopify`), which
  // navigates the parent admin frame while keeping our iframe alive.
  //
  // Two URL shapes flow through here:
  // - `shopify:admin/...` (managed-pricing handoff) — App Bridge's `open()`
  //   handles this directly, same as a plain <a href="shopify:admin/...">.
  // - `https://...myshopify.com/admin/charges/.../confirm_recurring_application_charge`
  //   (subscribeToPlan confirmation URL) — `shopify.redirect.dispatch({
  //   type: 'REMOTE', url, newContext: false })` is the documented App
  //   Bridge v4 path for remote URLs that must take over the parent frame.
  useEffect(() => {
    if (actionData && "redirectTo" in actionData && actionData.redirectTo) {
      const target = actionData.redirectTo as string;
      const sh = (window as unknown as { shopify?: any }).shopify;
      if (sh) {
        if (target.startsWith("shopify:") && typeof sh.open === "function") {
          sh.open(target);
          return;
        }
        if (sh.redirect?.dispatch) {
          sh.redirect.dispatch({
            type: "REMOTE",
            url: target,
            newContext: false,
          });
          return;
        }
        if (typeof sh.open === "function") {
          sh.open(target);
          return;
        }
      }
      // No App Bridge available — we're not embedded (local dev, or App
      // Bridge failed to init). There's no iframe to break, so a plain
      // navigation is safe.
      window.location.href = target;
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
      <s-button slot="primary-action" onClick={() => appNav("/app")}>
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

      {/* Plan picker — Essent+BON archetype: 3 paid cards in a row + Free strip
          below + FAQ accordion. Royal stays volume-only (no feature gating) so
          every card lists the same feature bullets and only the order quota
          differs. The middle tier (Growth) is the "Most popular" highlight. */}
      <s-section heading="Choose a plan">
        <s-paragraph>
          Every plan includes every feature — points, VIP tiers, referrals,
          store credit, AI setup and branding. Plans differ only by how many
          loyalty orders you can process per month.{" "}
          <s-badge tone="info">30-day money-back guarantee</s-badge>
        </s-paragraph>

        <PricingCards
          plans={data.plans}
          currentTier={data.plan}
          busy={busy}
          onSubscribe={(tier) =>
            submit(
              { _intent: "subscribe", tier },
              { method: "POST" },
            )
          }
        />

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

      <BillingFAQ />

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

// ---------------------------------------------------------------------------
// Pricing cards — Essent+BON archetype, Polaris-native styling per the visual
// directive (no pink-magenta highlights, no illustrations, no bold gradients).
// The 3 paid plans render as a horizontal card row with the middle tier
// (Growth) outlined as "Most popular"; Free renders as a full-width strip
// below with the current-plan disabled pill, matching BON's layout.
// ---------------------------------------------------------------------------

type PlanRow = {
  tier: "FREE" | "STARTER" | "GROWTH" | "PRO";
  name: string;
  priceUsd: number;
  cap: number | null;
  trialDays: number;
  blurb: string;
};

function PricingCards({
  plans,
  currentTier,
  busy,
  onSubscribe,
}: {
  plans: PlanRow[];
  currentTier: PlanRow["tier"];
  busy: boolean;
  onSubscribe: (tier: PlanRow["tier"]) => void;
}) {
  const free = plans.find((p) => p.tier === "FREE")!;
  const paid = plans.filter((p) => p.tier !== "FREE");
  const popularTier: PlanRow["tier"] = "GROWTH";

  const sharedFeatures = [
    "All earn rules (orders, signup, birthday, newsletter, social, reviews)",
    "VIP tiers with per-tier earn multipliers",
    "Two-sided referrals with fraud controls",
    "Rewards catalog — discounts, free shipping, free products",
    "Native Shopify store credit & cashback",
    "AI program builder + ongoing optimization suggestions",
    "Branding hub with palette presets & live preview",
  ];

  return (
    <s-stack direction="block" gap="large">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          alignItems: "stretch",
        }}
      >
        {paid.map((p) => {
          const isCurrent = p.tier === currentTier;
          const isPopular = p.tier === popularTier;
          return (
            <div
              key={p.tier}
              style={{
                position: "relative",
                padding: 20,
                border: isPopular
                  ? "2px solid #202223"
                  : "1px solid #e3e5e7",
                borderRadius: 10,
                background: "#fff",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {isPopular && (
                <div
                  style={{
                    position: "absolute",
                    top: -10,
                    left: 16,
                    padding: "2px 10px",
                    background: "#2c6ecb",
                    color: "#fff",
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  Most popular
                </div>
              )}
              <div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    color: "#6d7175",
                  }}
                >
                  {p.name}
                </div>
                <div style={{ marginTop: 8, display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontSize: 14, color: "#6d7175" }}>$</span>
                  <span style={{ fontSize: 36, fontWeight: 700, color: "#202223" }}>
                    {p.priceUsd}
                  </span>
                  <span style={{ fontSize: 14, color: "#6d7175" }}>/month</span>
                </div>
                <div style={{ fontSize: 13, color: "#6d7175", marginTop: 4 }}>
                  {p.cap === null
                    ? "Unlimited loyalty orders"
                    : `Includes ${p.cap.toLocaleString()} loyalty orders / month`}
                </div>
                {p.trialDays > 0 && (
                  <div style={{ fontSize: 12, color: "#6d7175", marginTop: 4 }}>
                    {p.trialDays}-day free trial
                  </div>
                )}
              </div>

              <div style={{ fontSize: 13, fontWeight: 600, color: "#202223" }}>
                Everything in Free, plus more volume.
              </div>

              <div style={{ marginTop: "auto" }}>
                {isCurrent ? (
                  <s-button disabled>Current plan</s-button>
                ) : (
                  <s-button
                    variant={isPopular ? "primary" : "secondary"}
                    onClick={() => onSubscribe(p.tier)}
                    {...(busy ? { loading: "" } : {})}
                  >
                    Choose plan
                  </s-button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Free-tier strip below the paid row (BON pattern). Royal enumerates the
          Free features (Essent pattern) so Free reads as a real product, not a
          teaser. */}
      <div
        style={{
          padding: 20,
          border: "1px solid #e3e5e7",
          borderRadius: 10,
          background: "#fff",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "#6d7175",
              }}
            >
              {free.name}
            </div>
            <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", gap: 4 }}>
              <span style={{ fontSize: 14, color: "#6d7175" }}>$</span>
              <span style={{ fontSize: 32, fontWeight: 700, color: "#202223" }}>
                0
              </span>
              <span style={{ fontSize: 14, color: "#6d7175" }}>/month</span>
            </div>
            <div style={{ fontSize: 13, color: "#6d7175", marginTop: 4 }}>
              Includes {free.cap?.toLocaleString() ?? "250"} loyalty orders / month
            </div>
          </div>
          <div>
            {currentTier === "FREE" ? (
              <s-button disabled>Your current plan</s-button>
            ) : (
              <s-button
                variant="secondary"
                onClick={() => onSubscribe("FREE")}
                {...(busy ? { loading: "" } : {})}
              >
                Switch to Free
              </s-button>
            )}
          </div>
        </div>
        <div
          style={{
            marginTop: 12,
            paddingTop: 12,
            borderTop: "1px solid #f1f2f3",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 6,
          }}
        >
          {sharedFeatures.map((f) => (
            <div key={f} style={{ fontSize: 13, color: "#202223" }}>
              ✓ {f}
            </div>
          ))}
        </div>
      </div>
    </s-stack>
  );
}

// FAQ accordion with grouped sub-headers (BON pattern: General / Payment /
// Customization). Plain HTML details/summary so we don't pull in a third-party
// accordion library.
function BillingFAQ() {
  const groups: { heading: string; items: { q: string; a: string }[] }[] = [
    {
      heading: "General",
      items: [
        {
          q: "Do you offer a free trial?",
          a: "Yes — every paid plan starts with a 14-day free trial. You can cancel any time during the trial without being charged.",
        },
        {
          q: "Is there a free plan?",
          a: "Yes. The Free plan keeps every feature available — points, VIP tiers, referrals, store credit, AI setup and branding — with room for up to 250 loyalty orders per month.",
        },
        {
          q: "Are any features locked to paid plans?",
          a: "No. Royal's pricing model is volume-only. Every feature is available on every plan; the paid tiers exist to handle higher monthly loyalty-order volume.",
        },
        {
          q: "Can I upgrade or downgrade any time?",
          a: "Yes. Switch plans from this page or directly in Shopify admin. Shopify computes proration based on how many days of the current billing cycle you've used.",
        },
        {
          q: "What's a 'loyalty order'?",
          a: "A single Shopify order that earned points or cashback, or redeemed points or store credit, this calendar month. An order counts once regardless of how many loyalty actions it triggers. Orders with no member, no earn and no redeem don't count.",
        },
      ],
    },
    {
      heading: "Payment & billing",
      items: [
        {
          q: "How am I charged?",
          a: "Royal doesn't charge merchants directly. Shopify includes the Royal subscription on your Shopify invoice during your normal Shopify billing cycle. You can review charges in Shopify admin.",
        },
        {
          q: "When am I charged?",
          a: "On the first day of the 30-day billing cycle after your trial ends. Cancel any time before that and you won't be charged.",
        },
        {
          q: "What happens if I exceed my monthly loyalty-order limit?",
          a: "On a paid plan you stay live and the next tier's volume kicks in automatically (no manual upgrade required for one-off spikes). On Free, new orders stop accruing points or cashback until the count resets at the start of next month. No data is lost in either case.",
        },
        {
          q: "Money-back guarantee?",
          a: "Yes — 30 days. If Royal isn't a fit, contact us within 30 days of your first paid charge and we'll refund the most recent month.",
        },
      ],
    },
    {
      heading: "Customization & migration",
      items: [
        {
          q: "Can you build something custom?",
          a: "Yes. Contact us via the support email below; we can scope custom features or a custom plan if your store has specific needs that aren't covered by the standard tiers.",
        },
        {
          q: "Can I migrate from another loyalty app?",
          a: "Yes. Royal can import points balances and members from a CSV export. See Settings → Import once you're on a paid plan, or contact support for hands-on help.",
        },
      ],
    },
  ];

  return (
    <s-section heading="Frequently asked questions">
      <s-paragraph>
        Don't see your answer? <AppLink href="/app/support">Contact support</AppLink> and
        we'll get back to you within one business day.
      </s-paragraph>
      <s-stack direction="block" gap="large">
        {groups.map((g) => (
          <div key={g.heading}>
            <div
              style={{
                fontWeight: 600,
                fontSize: 14,
                color: "#202223",
                marginBottom: 8,
              }}
            >
              {g.heading}
            </div>
            <div
              style={{
                border: "1px solid #e3e5e7",
                borderRadius: 8,
                background: "#fff",
                overflow: "hidden",
              }}
            >
              {g.items.map((item, i) => (
                <details
                  key={item.q}
                  style={{
                    borderTop: i === 0 ? "none" : "1px solid #f1f2f3",
                  }}
                >
                  <summary
                    style={{
                      cursor: "pointer",
                      padding: "12px 16px",
                      listStyle: "none",
                      fontSize: 14,
                      fontWeight: 500,
                      color: "#202223",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span>{item.q}</span>
                    <span aria-hidden="true" style={{ color: "#6d7175" }}>
                      +
                    </span>
                  </summary>
                  <div
                    style={{
                      padding: "0 16px 14px",
                      fontSize: 13,
                      color: "#454f5b",
                      lineHeight: 1.5,
                    }}
                  >
                    {item.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        ))}
      </s-stack>
    </s-section>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
