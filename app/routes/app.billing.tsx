// Billing — plan & subscription management (ROYAL-LOYALTY-DEVELOPMENT.md Phase 5).
//
// This is the page the merchant reaches from the "Billing" nav item. It used to
// live at /app/settings; it was renamed to /app/billing so that /app/settings
// can later host a true settings hub (General / POS / Integrations / Email /
// Tagging). The layout deliberately mirrors Essent's billing screen — the
// closest competitor in visual style — while staying Polaris-native per the
// visual directive (no pink/illustration aesthetic):
//   1. Current-plan banner with a live usage meter vs. the monthly cap.
//   2. Three paid plan cards in a row, each with a green-check feature list and
//      a 14-day-free-trial CTA.
//   3. A full-width Free strip below with the "Current plan" pill.
//   4. A grouped FAQ accordion.
//
// Self-serve upgrade / downgrade. Prices shown BEFORE subscribe. Downgrading
// to Free cancels any active subscription as a side effect of the FREE-tier
// subscribe path, so a separate "Cancel" button is unnecessary.
// Volume-gate messaging is neutral / informational only — no fear framing, no
// hidden data, NO feature gating (every feature is on every plan; only the
// monthly loyalty-order volume differs).
import { useEffect } from "react";
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
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useSuccessToast } from "../lib/polaris-bindings";
import {
  PLANS,
  PLAN_ORDER,
  planDef,
  subscribeToPlan,
  cancelActiveSubscription,
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
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");

  // Only one action surface remains: subscribe to a plan from one of the
  // pricing cards. Downgrading is handled by subscribing to FREE — the FREE
  // branch cancels any active Shopify subscription as a side effect, so a
  // separate "Cancel subscription" button isn't needed.
  if (intent === "subscribe") {
    const tier = String(form.get("tier") ?? "") as keyof typeof PLANS;
    if (!PLANS[tier]) {
      return { ok: false, message: "Unknown plan selected." };
    }
    const url = new URL(request.url);
    const returnUrl = `${url.origin}/app/billing`;

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

  return { ok: false, message: "Unknown action." };
};

export default function BillingPage() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const appNav = useAppNavigate();
  const busy = nav.state === "submitting";
  useSuccessToast(actionData as { ok?: boolean; message?: string } | undefined);

  // Client-side redirect to the Shopify-hosted subscription confirmation page.
  //
  // ⚠ IFRAME AUTH: We're in an embedded admin iframe; setting
  // `window.top.location.href = url` force-replaces the iframe's parent and
  // destroys the embedded session, leaving the merchant on a broken auth
  // page. Instead we hand the URL to App Bridge (`window.shopify`), which
  // navigates the parent admin frame while keeping our iframe alive.
  //
  // The URL is the appSubscriptionCreate confirmation URL of the form
  // `https://<shop>.myshopify.com/admin/charges/.../confirm_recurring_application_charge`.
  // `shopify.redirect.dispatch({ type: 'REMOTE', url, newContext: false })` is
  // the documented App Bridge v4 path for remote URLs that must take over the
  // parent frame.
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

  const currentDef = data.plans.find((p) => p.tier === data.plan)!;
  const usagePct =
    data.quota.cap && data.quota.cap > 0
      ? Math.min(100, Math.round((data.quota.used / data.quota.cap) * 100))
      : null;

  return (
    <s-page heading="Billing" subheading="Manage your subscription and billing details">
      <s-button slot="primary-action" onClick={() => appNav("/app")}>
        Back to Home
      </s-button>

      {actionData && !actionData.ok && (
        <s-section>
          <s-banner tone="critical" heading="Could not complete that action">
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

      {/* 1. Current-plan banner — Essent pattern: "Your plan: Name, $X/month"
          + a usage meter bar + "Monthly order limit: X out of Y". Neutral,
          informational; no fear framing, no hidden data. */}
      <s-section>
        <CurrentPlanBanner
          planName={currentDef.name}
          priceUsd={currentDef.priceUsd}
          status={data.planStatus}
          used={data.quota.used}
          cap={currentDef.cap}
          usagePct={usagePct}
        />

        {data.quota.overCap && (
          <s-banner tone="info" heading="Monthly loyalty-order limit reached">
            <s-paragraph>
              You&apos;ve reached the {currentDef.name} plan&apos;s allowance of{" "}
              {currentDef.cap?.toLocaleString()} loyalty orders this month. New
              orders won&apos;t accrue points or cashback until the count resets
              at the start of next month, or you move to a higher volume plan.
              Every feature stays available and no existing data is affected —
              this is a volume allowance, not a feature limit.
            </s-paragraph>
          </s-banner>
        )}
      </s-section>

      {/* 2 + 3. Plan picker — Essent archetype: 3 paid cards in a row + Free
          strip below. Royal stays volume-only (no feature gating) so every card
          lists the same short feature bullets and only the order quota differs.
          No "Most popular" highlight — all three cards treated equally, as in
          Essent's screenshot. */}
      <s-section>
        <PricingCards
          plans={data.plans}
          currentTier={data.plan}
          busy={busy}
          onSubscribe={(tier) =>
            submit({ _intent: "subscribe", tier }, { method: "POST" })
          }
        />
      </s-section>

      {/* 4. FAQ accordion. */}
      <BillingFAQ />

      {/* Account-management actions — moved to a low-prominence row at the
          bottom of the page (Essent keeps these off the main billing surface
          entirely; we keep them accessible but quiet). */}
    </s-page>
  );
}

// ---------------------------------------------------------------------------
// Styling note: plan prices render in USD ($) regardless of the shop's
// currency. Shopify's Billing API (appSubscriptionCreate) only accepts USD, and
// Shopify itself handles FX conversion to the merchant's payout currency.
// Showing local currency here would be misleading (a NOK shop is still billed
// in USD). All OTHER money in the app goes through useMoney() and renders in the
// shop's actual currency. This page is the one exception.
//
// Colors follow the Polaris palette (subdued grays, #008060 success green for
// check icons, #2c6ecb info blue for the "Most popular" accent) per the visual
// directive — no pink-magenta highlights, illustrations, or bold gradients.
// ---------------------------------------------------------------------------

type PlanRow = {
  tier: "FREE" | "STARTER" | "GROWTH" | "PRO";
  name: string;
  priceUsd: number;
  cap: number | null;
  trialDays: number;
  blurb: string;
};

// Headline features shown on every paid card with an outlined-circle check.
// Royal has no feature gating, so the list is identical across tiers and items
// stay short (matching Essent's 4-bullet rhythm: each item ~3 words).
const CARD_FEATURES = [
  "Everything in Free",
  "Higher monthly volume",
  "Full feature access",
  "Cancel anytime",
];

// Features shown on the Free strip — short, scannable, single-row.
const FREE_FEATURES = [
  "Points & VIP tiers",
  "Referrals & fraud controls",
  "Store credit & cashback",
  "Storefront widget",
];

// Essent's check icon is an outlined green circle with a check stroke inside
// (not a filled badge, not a raw ✓ character). SVG is the only way to match
// that exact treatment — a literal "✓" renders heavy and pixelated.
function Check() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      style={{ flex: "0 0 auto", marginTop: 1 }}
    >
      <circle cx="10" cy="10" r="9" stroke="#008060" strokeWidth="1.5" />
      <path
        d="M6 10.5l2.5 2.5L14 7.5"
        stroke="#008060"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

function CurrentPlanBanner({
  planName,
  priceUsd,
  status,
  used,
  cap,
  usagePct,
}: {
  planName: string;
  priceUsd: number;
  status: string;
  used: number;
  cap: number | null;
  usagePct: number | null;
}) {
  // Essent shows NO status badge on a normal ACTIVE plan. We surface a badge
  // only when the status is non-routine (FROZEN/CANCELLED/EXPIRED) so the
  // banner stays as visually clean as Essent's when nothing is wrong.
  const showStatusBadge = status !== "ACTIVE";

  return (
    <div
      style={{
        padding: 24,
        border: "1px solid #e3e5e7",
        borderRadius: 10,
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 16, color: "#202223" }}>
          Your plan:{" "}
          <strong>
            {planName}, ${priceUsd.toFixed(2)}/month
          </strong>
        </div>
        {showStatusBadge && (
          <s-badge
            tone={
              status === "FROZEN"
                ? "warning"
                : "neutral"
            }
          >
            {status}
          </s-badge>
        )}
      </div>

      {/* Usage meter — Essent uses a thin light-gray bar with a barely-visible
          fill. We match that: 6px height, full-width gray track, neutral fill
          (no color shift at the cap to avoid fear framing). */}
      <div
        style={{
          height: 6,
          borderRadius: 999,
          background: "#f1f2f3",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${usagePct ?? 0}%`,
            background: "#8c9196",
            borderRadius: 999,
            transition: "width 200ms ease",
          }}
        />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 14,
          color: "#202223",
        }}
      >
        <Check />
        <span>
          Monthly order limit:{" "}
          <strong>
            {used.toLocaleString()}
            {cap === null ? " (unlimited)" : ` out of ${cap.toLocaleString()}`}
          </strong>
        </span>
      </div>
    </div>
  );
}

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

  return (
    <s-stack direction="block" gap="large">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: 16,
          alignItems: "stretch",
        }}
      >
        {paid.map((p) => {
          const isCurrent = p.tier === currentTier;
          return (
            <div
              key={p.tier}
              style={{
                position: "relative",
                padding: 28,
                border: "1px solid #e3e5e7",
                borderRadius: 10,
                background: "#fff",
                display: "flex",
                flexDirection: "column",
                gap: 18,
              }}
            >
              {/* Plan name — Essent: large dark normal-case (not small uppercase
                  gray). The sub-line lives directly underneath. */}
              <div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    color: "#202223",
                    lineHeight: 1.2,
                  }}
                >
                  {p.name}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    color: "#6d7175",
                    marginTop: 6,
                    lineHeight: 1.4,
                  }}
                >
                  Up to{" "}
                  <strong style={{ color: "#202223" }}>
                    {p.cap === null
                      ? "Unlimited"
                      : p.cap.toLocaleString()}
                  </strong>{" "}
                  loyalty program orders.
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                <span
                  style={{
                    fontSize: 36,
                    fontWeight: 700,
                    color: "#202223",
                    lineHeight: 1,
                  }}
                >
                  ${p.priceUsd}
                </span>
                <span style={{ fontSize: 14, color: "#6d7175" }}>/month</span>
              </div>

              <div
                style={{ display: "flex", flexDirection: "column", gap: 10 }}
              >
                {CARD_FEATURES.map((f) => (
                  <div
                    key={f}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      fontSize: 14,
                      color: "#202223",
                      lineHeight: 1.4,
                    }}
                  >
                    <Check />
                    <span>{f}</span>
                  </div>
                ))}
              </div>

              {/* CTA — Polaris s-button kept (per design directive), but
                  Polaris's button host is intrinsically inline-sized and
                  refuses to stretch via width/inline-size on its host. The
                  workaround that actually moves pixels: center the button with
                  a flex row, then inflate it by padding its INNER label
                  content. Polaris does respect padding on the s-button's child
                  nodes (the label slot), so wrapping the label text in a span
                  with large horizontal padding pushes the button toward the
                  card edges without breaking the Polaris styling. */}
              <div
                style={{
                  marginTop: "auto",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "stretch",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "center" }}>
                  {isCurrent ? (
                    <s-button disabled size="large">
                      <span
                        style={{
                          display: "inline-block",
                          padding: "6px 48px",
                          fontSize: 15,
                        }}
                      >
                        Current plan
                      </span>
                    </s-button>
                  ) : (
                    <s-button
                      variant="primary"
                      size="large"
                      onClick={() => onSubscribe(p.tier)}
                      {...(busy ? { loading: "" } : {})}
                    >
                      <span
                        style={{
                          display: "inline-block",
                          padding: "6px 48px",
                          fontSize: 15,
                        }}
                      >
                        {p.trialDays > 0
                          ? `Start ${p.trialDays}-day free trial`
                          : "Choose plan"}
                      </span>
                    </s-button>
                  )}
                </div>
                {p.trialDays > 0 && !isCurrent && (
                  <div
                    style={{
                      fontSize: 13,
                      color: "#6d7175",
                      textAlign: "center",
                    }}
                  >
                    Free {p.trialDays}-day trial
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Free-tier strip — Essent layout: header line with the plan name + cap
          + inline "Current plan" pill, then a single horizontal row of feature
          bullets (NOT a grid). Right-aligned action button. */}
      <div
        style={{
          padding: 24,
          border: "1px solid #e3e5e7",
          borderRadius: 10,
          background: "#fff",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 16, color: "#202223" }}>
              <strong>{free.name}</strong> — {free.cap?.toLocaleString() ?? "250"}{" "}
              loyalty program orders.
            </div>
            {currentTier === "FREE" && (
              <s-badge tone="success">Current plan</s-badge>
            )}
          </div>
          <div>
            {currentTier === "FREE" ? (
              <s-button disabled>Current plan</s-button>
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
            marginTop: 16,
            paddingTop: 16,
            borderTop: "1px solid #f1f2f3",
            display: "flex",
            flexWrap: "wrap",
            gap: "10px 28px",
          }}
        >
          {FREE_FEATURES.map((f) => (
            <div
              key={f}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "center",
                fontSize: 14,
                color: "#202223",
              }}
            >
              <Check />
              <span>{f}</span>
            </div>
          ))}
        </div>
      </div>
    </s-stack>
  );
}

// FAQ accordion with grouped sub-headers (General / Payment / Customization).
// Plain HTML details/summary so we don't pull in a third-party accordion lib.
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
        Don&apos;t see your answer?{" "}
        <AppLink href="/app/support">Contact support</AppLink> and we&apos;ll
        get back to you within one business day.
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
                  style={{ borderTop: i === 0 ? "none" : "1px solid #f1f2f3" }}
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
