// Per-rule earn editor — Polaris-native, two-column page layout.
//
// Layout uses <s-page>'s built-in main + aside columns (same pattern as
// app._index.tsx): regular <s-section> goes in the main column, <s-section
// slot="aside"> goes in the right rail. Polaris owns the responsive
// breakpoints, so the cards don't overlap or escape the page chrome.
//
//   ← Place an order                                    [Discard][Save]
//      Points awarded for placing an order on your store
//
//   ┌── Title ──────────────────────┐    ┌── Status ─────────────┐
//   │ [Place an order             ] │    │ ◉ Enabled  ○ Disabled │
//   └───────────────────────────────┘    └───────────────────────┘
//   ┌── Earning method ─────────────┐    ┌── Summary ────────────┐
//   │ ◉ Increments of points        │    │ • Customer earns ...  │
//   │ ○ Fixed amount of points      │    │ • Awarded for ...     │
//   │ [Points] [for every kr 1 …]   │    └───────────────────────┘
//   │ Times … [Unlimited]           │
//   └───────────────────────────────┘
//
// Per-action visibility:
//   purchase  → Earning method radios + "For every amount spent" field
//   others    → Just "Customer gets X points" (flat, no per-spend axis)
//
// Persistence:
//   points / perDollar / enabled are EarnRule columns.
//   title and completionLimit live in the existing EarnRule.config JSON
//   blob (no schema migration). The previous build's Points-Icon card has
//   been removed: storefront extensions render the rule's label, not a
//   per-rule icon, so the icon was purely admin-side decoration.

import { useEffect, useRef, useState, useCallback } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
  useBlocker,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useAppNavigate } from "../lib/app-navigate";
import { formatMoney } from "../lib/use-money";
import { loadShopMoneyContext } from "../lib/shop-context.server";
import { ChoiceList, BreadcrumbBackLink } from "../lib/polaris-bindings";

const ACTIONS = [
  "purchase",
  "signup",
  "birthday",
  "newsletter",
  "social",
  "review",
  "anniversary",
] as const;
type ActionName = (typeof ACTIONS)[number];

const LABELS: Record<
  ActionName,
  { title: string; description: string; summaryTail: string }
> = {
  purchase: {
    title: "Place an order",
    description: "Points awarded for placing an order on your store",
    summaryTail: "Awarded for placing an order",
  },
  signup: {
    title: "Create an account",
    description:
      "One-time bonus for a customer who signs up for an account in your store",
    summaryTail: "Awarded once when the customer creates an account",
  },
  birthday: {
    title: "Celebrate a birthday",
    description: "Awarded once per year on the customer's saved birthday",
    summaryTail: "Awarded once per year on the customer's birthday",
  },
  newsletter: {
    title: "Subscribe to newsletter",
    description:
      "Awarded when a customer signs up for marketing emails through your storefront",
    summaryTail: "Awarded once when the customer subscribes",
  },
  social: {
    title: "Follow on social",
    description:
      "Awarded when a customer follows or shares your store on their social channels",
    summaryTail: "Awarded once per platform per customer",
  },
  review: {
    title: "Leave a product review",
    description: "Awarded when a customer submits a verified product review",
    summaryTail: "Awarded once per review (requires a reviews integration)",
  },
  anniversary: {
    title: "Account anniversary",
    description:
      "Awarded once a year on the anniversary of joining your loyalty program",
    summaryTail: "Awarded once per year on the join anniversary",
  },
};

function isActionName(v: string): v is ActionName {
  return (ACTIONS as readonly string[]).includes(v);
}

async function requireShop(shopDomain: string) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Response("Shop not found", { status: 404 });
  return shop;
}

type ConfigBlob = {
  title?: string;
  completionLimit?: number | null; // null = unlimited
  /** "X points per Y currency units"; 1 = points-per-1-unit. */
  perAmount?: number;
};

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const action = String(params.action ?? "");
  if (!isActionName(action))
    throw new Response("Unknown action", { status: 404 });

  const existing = await prisma.earnRule.findFirst({
    where: { shopId: shop.id, action },
  });

  const config = (existing?.config ?? null) as ConfigBlob | null;
  const defaultTitle = LABELS[action].title;

  // Fetch the shop's currency directly here too — the parent app.tsx loader
  // also fetches it, but the previous useRouteLoaderData wiring couldn't be
  // trusted to resolve the parent route ID across flatRoutes setups. Reading
  // it in this loader and returning it on `money` removes the dependency.
  const money = await loadShopMoneyContext(admin, session.shop);

  return {
    action,
    money,
    rule: {
      title: config?.title ?? defaultTitle,
      points: existing?.points ?? (action === "purchase" ? 1 : 50),
      perDollar: existing?.perDollar ?? action === "purchase",
      enabled:
        existing?.enabled ?? (action === "purchase" || action === "signup"),
      completionLimit:
        config?.completionLimit === undefined ? null : config.completionLimit,
      perAmount: Math.max(1, config?.perAmount ?? 1),
    },
  };
};

type EarnActionResult =
  | { ok: false; message: string }
  | { ok: true; redirectTo: string };

// ⚠ IFRAME AUTH: redirect-as-data, NOT server-side redirect. See
// app/lib/NAVIGATION-AUDIT.md rule #6.
export const action = async ({
  params,
  request,
}: ActionFunctionArgs): Promise<EarnActionResult> => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const a = String(params.action ?? "");
  if (!isActionName(a)) throw new Response("Unknown action", { status: 404 });

  const form = await request.formData();
  const points = Number.parseInt(String(form.get("points")), 10);
  if (!Number.isFinite(points) || points < 0) {
    return {
      ok: false,
      message: "Points must be a non-negative whole number.",
    };
  }
  const perDollar = form.get("perDollar") === "on";
  const enabled = form.get("enabled") === "on";
  const titleRaw = String(form.get("title") ?? "").trim();
  const title = titleRaw.slice(0, 80) || LABELS[a].title;
  const limitRaw = String(form.get("completionLimit") ?? "").trim();
  const completionLimit =
    limitRaw === "" || limitRaw.toLowerCase() === "unlimited"
      ? null
      : Math.max(1, Number.parseInt(limitRaw, 10) || 0) || null;
  const perAmount = Math.max(
    1,
    Number.parseInt(String(form.get("perAmount") ?? "1"), 10) || 1,
  );

  const config: ConfigBlob = { title, completionLimit, perAmount };

  const existing = await prisma.earnRule.findFirst({
    where: { shopId: shop.id, action: a },
  });
  if (existing) {
    await prisma.earnRule.update({
      where: { id: existing.id },
      data: { points, perDollar, enabled, config: config as object },
    });
  } else {
    await prisma.earnRule.create({
      data: {
        shopId: shop.id,
        action: a,
        points,
        perDollar,
        enabled,
        config: config as object,
      },
    });
  }

  const url = new URL(request.url);
  const inChain = url.searchParams.get("onboarding") === "1";
  return {
    ok: true,
    redirectTo: inChain ? "/app/program?onboarding=1" : "/app/program",
  };
};

export default function EarnRuleEditor() {
  const { action: actionName, rule, money: moneyCtx } =
    useLoaderData<typeof loader>();
  const actionData = useActionData() as EarnActionResult | undefined;
  const nav = useNavigation();
  const submit = useSubmit();
  const appNav = useAppNavigate();
  const currencyCode = moneyCtx.currencyCode;
  const money = (n: number) =>
    formatMoney(n, moneyCtx.currencyCode, moneyCtx.locale);
  const saveBarRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (
      actionData?.ok &&
      "redirectTo" in actionData &&
      actionData.redirectTo
    ) {
      appNav(actionData.redirectTo);
    }
  }, [actionData, appNav]);

  const meta = LABELS[actionName as ActionName];
  const isPurchase = actionName === "purchase";

  const [title, setTitle] = useState(rule.title);
  const [points, setPoints] = useState(rule.points);
  const [perDollar, setPerDollar] = useState(rule.perDollar);
  const [enabled, setEnabled] = useState(rule.enabled);
  const [completionLimit, setCompletionLimit] = useState<number | null>(
    rule.completionLimit,
  );
  const [perAmount, setPerAmount] = useState(rule.perAmount);

  const dirty =
    title !== rule.title ||
    points !== rule.points ||
    perDollar !== rule.perDollar ||
    enabled !== rule.enabled ||
    completionLimit !== rule.completionLimit ||
    perAmount !== rule.perAmount;
  const saving = nav.state === "submitting";

  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }: any) =>
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

  const save = useCallback(() => {
    const fd = new FormData();
    fd.set("title", title);
    fd.set("points", String(points));
    if (perDollar) fd.set("perDollar", "on");
    if (enabled) fd.set("enabled", "on");
    fd.set(
      "completionLimit",
      completionLimit === null ? "unlimited" : String(completionLimit),
    );
    fd.set("perAmount", String(perAmount));
    submit(fd, { method: "POST" });
  }, [title, points, perDollar, enabled, completionLimit, perAmount, submit]);

  const discard = useCallback(() => {
    setTitle(rule.title);
    setPoints(rule.points);
    setPerDollar(rule.perDollar);
    setEnabled(rule.enabled);
    setCompletionLimit(rule.completionLimit);
    setPerAmount(rule.perAmount);
  }, [rule]);

  // Summary bullets — currency-aware, mirrors Essent's right-column summary.
  const summaryBullets: string[] = [];
  if (!enabled) {
    summaryBullets.push(
      "This rule is currently inactive — no points awarded.",
    );
  } else if (isPurchase && perDollar) {
    summaryBullets.push(
      `Customer earns ${points} point${points === 1 ? "" : "s"} for every ${money(perAmount)} spent`,
    );
    summaryBullets.push(meta.summaryTail);
  } else if (isPurchase) {
    summaryBullets.push(
      `Customer earns ${points} point${points === 1 ? "" : "s"} per order, regardless of order value`,
    );
    summaryBullets.push(meta.summaryTail);
  } else {
    summaryBullets.push(
      `Customer earns ${points} point${points === 1 ? "" : "s"}`,
    );
    summaryBullets.push(meta.summaryTail);
  }
  if (completionLimit !== null) {
    summaryBullets.push(
      `Up to ${completionLimit} time${completionLimit === 1 ? "" : "s"} per customer`,
    );
  }

  return (
    <s-page heading={meta.title}>
      {/* `breadcrumbActions` slot puts the back arrow inline with the page
          heading on the LEFT. <BreadcrumbBackLink> intercepts the click
          and routes via App Bridge so the iframe (and session) stays alive. */}
      <BreadcrumbBackLink href="/app/program" label="Program" />

      {/* @ts-expect-error - ui-save-bar App Bridge custom element */}
      <ui-save-bar id="earn-rule-save-bar" ref={saveBarRef}>
        <button
          variant="primary"
          onClick={save}
          {...(saving ? { loading: "" } : {})}
        >
          Save
        </button>
        <button onClick={discard}>Discard</button>
        {/* @ts-expect-error - ui-save-bar custom element */}
      </ui-save-bar>

      {actionData && !actionData.ok && (
        <s-section>
          <s-banner tone="critical" heading="Could not save">
            <s-paragraph>{actionData.message}</s-paragraph>
          </s-banner>
        </s-section>
      )}

      {/* Page subtitle as a leading paragraph above the cards. */}
      <s-section>
        <s-paragraph>{meta.description}</s-paragraph>
      </s-section>

      {/* ───── Main column ───── */}

      <s-section heading="Title">
        <s-text-field
          label="Title"
          value={title}
          onChange={(e: any) => setTitle(String(e.target.value ?? ""))}
        />
      </s-section>

      <s-section heading={isPurchase ? "Earning method" : "Points awarded"}>
        <s-stack direction="block" gap="base">
          {isPurchase && (
            <ChoiceList
              label="Method"
              value={perDollar ? "increments" : "fixed"}
              onChange={(v) => setPerDollar(v === "increments")}
            >
              <s-choice value="increments">
                Increments of points (recommended)
              </s-choice>
              <s-choice value="fixed">Fixed amount of points</s-choice>
            </ChoiceList>
          )}

          <s-stack direction="inline" gap="base">
            <s-number-field
              label="Customer gets"
              suffix="points"
              min={0}
              value={String(points)}
              onChange={(e: any) =>
                setPoints(
                  Math.max(0, Number.parseInt(String(e.target.value), 10) || 0),
                )
              }
            />
            {isPurchase && perDollar && (
              <s-number-field
                label="For every amount spent"
                suffix={currencyCode}
                min={1}
                value={String(perAmount)}
                onChange={(e: any) =>
                  setPerAmount(
                    Math.max(
                      1,
                      Number.parseInt(String(e.target.value), 10) || 1,
                    ),
                  )
                }
              />
            )}
          </s-stack>

          <s-text-field
            label="Times a customer can complete this action"
            value={
              completionLimit === null ? "Unlimited" : String(completionLimit)
            }
            onChange={(e: any) => {
              const v = String(e.target.value ?? "").trim();
              if (v === "" || v.toLowerCase() === "unlimited") {
                setCompletionLimit(null);
                return;
              }
              const n = Number.parseInt(v, 10);
              setCompletionLimit(Number.isFinite(n) && n > 0 ? n : null);
            }}
          />
        </s-stack>
      </s-section>

      {/* ───── Right rail (Polaris page aside) ───── */}

      <s-section slot="aside" heading="Status">
        <ChoiceList
          label="Status"
          value={enabled ? "enabled" : "disabled"}
          onChange={(v) => setEnabled(v === "enabled")}
        >
          <s-choice value="enabled">Enabled</s-choice>
          <s-choice value="disabled">Disabled</s-choice>
        </ChoiceList>
      </s-section>

      <s-section slot="aside" heading="Summary">
        <s-unordered-list>
          {summaryBullets.map((b, i) => (
            <s-list-item key={i}>{b}</s-list-item>
          ))}
        </s-unordered-list>
      </s-section>

      {blocker.state === "blocked" && (
        <s-section>
          <s-banner tone="warning" heading="You have unsaved changes">
            <s-stack direction="inline" gap="base">
              <s-button variant="primary" onClick={() => blocker.proceed?.()}>
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
