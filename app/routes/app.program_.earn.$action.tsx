// Per-rule earn editor — two-column layout matching the Essent reference:
//
//   ← Place an order                             [Discard] [Save]
//      Points awarded for placing an order on your store
//   ┌──────────────────────────────┐  ┌────────────────────┐
//   │ Title                        │  │ Status             │
//   │ [Place an order            ] │  │ ◉ Enabled  ○ Off   │
//   └──────────────────────────────┘  └────────────────────┘
//   ┌──────────────────────────────┐  ┌────────────────────┐
//   │ Earning method               │  │ Summary            │
//   │ ◉ Increments of points       │  │ • Customer earns 8 │
//   │ ○ Fixed amount of points     │  │   points for every │
//   │ Customer gets │ For every    │  │   kr 1 spent       │
//   │ [ 8  points ]│ [ kr 1 ]      │  │ • Awarded for an   │
//   │                              │  │   order            │
//   │ Times a customer can do this │  └────────────────────┘
//   │ [Unlimited]                  │
//   └──────────────────────────────┘
//
// Per-action visibility:
//   purchase  → Earning method radios + "For every amount spent" field
//   others    → "Customer gets" only (fixed flat amount, always)
//
// Persistence:
//   points / perDollar / enabled are real columns on EarnRule (since Phase 1).
//   title and completionLimit live inside the existing `config` JSON column.
//   The Points Icon picker is intentionally cosmetic only for now (one design
//   slot, no real custom-upload yet) — the schema doesn't have anywhere to
//   store an icon image, and adding that goes with a follow-up migration.

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
import { useMoney, useShopMoney } from "../lib/use-money";

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
    description:
      "Awarded once per year on the customer's saved birthday",
    summaryTail: "Awarded once per year on the customer's birthday",
  },
  newsletter: {
    title: "Subscribe to newsletter",
    description:
      "Awarded when a customer signs up for marketing emails through your storefront",
    summaryTail: "Awarded once when the customer subscribes to the newsletter",
  },
  social: {
    title: "Follow on social",
    description:
      "Awarded when a customer follows or shares your store on their social channels",
    summaryTail: "Awarded once per platform per customer",
  },
  review: {
    title: "Leave a product review",
    description:
      "Awarded when a customer submits a verified product review",
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
};

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const action = String(params.action ?? "");
  if (!isActionName(action))
    throw new Response("Unknown action", { status: 404 });

  const existing = await prisma.earnRule.findFirst({
    where: { shopId: shop.id, action },
  });

  const config = (existing?.config ?? null) as ConfigBlob | null;
  const defaultLabel = LABELS[action].title;

  return {
    action,
    rule: {
      title: config?.title ?? defaultLabel,
      points: existing?.points ?? (action === "purchase" ? 1 : 50),
      perDollar: existing?.perDollar ?? action === "purchase",
      enabled:
        existing?.enabled ?? (action === "purchase" || action === "signup"),
      completionLimit:
        config?.completionLimit === undefined ? null : config.completionLimit,
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

  const config: ConfigBlob = { title, completionLimit };

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
  const { action: actionName, rule } = useLoaderData<typeof loader>();
  const actionData = useActionData() as EarnActionResult | undefined;
  const nav = useNavigation();
  const submit = useSubmit();
  const appNav = useAppNavigate();
  const money = useMoney();
  const { currencyCode } = useShopMoney();
  const saveBarRef = useRef<HTMLElement | null>(null);

  // Action returns { ok: true, redirectTo } on save — navigate client-side
  // (see NAVIGATION-AUDIT.md rule #6).
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

  const dirty =
    title !== rule.title ||
    points !== rule.points ||
    perDollar !== rule.perDollar ||
    enabled !== rule.enabled ||
    completionLimit !== rule.completionLimit;
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
    submit(fd, { method: "POST" });
  }, [title, points, perDollar, enabled, completionLimit, submit]);

  const discard = useCallback(() => {
    setTitle(rule.title);
    setPoints(rule.points);
    setPerDollar(rule.perDollar);
    setEnabled(rule.enabled);
    setCompletionLimit(rule.completionLimit);
  }, [rule]);

  // Summary bullets — currency-aware, mirrors Essent's right-column summary.
  const summaryBullets: string[] = [];
  if (!enabled) {
    summaryBullets.push("This rule is currently inactive — no points awarded.");
  } else if (isPurchase && perDollar) {
    summaryBullets.push(
      `Customer earns ${points} point${points === 1 ? "" : "s"} for every ${money(1)} spent`,
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
    summaryBullets.push(`Up to ${completionLimit} time${completionLimit === 1 ? "" : "s"} per customer`);
  }

  return (
    <s-page heading={meta.title}>
      <s-button
        slot="primary-action"
        onClick={() => appNav("/app/program")}
      >
        Back to Program
      </s-button>

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

      <s-paragraph>{meta.description}</s-paragraph>

      {/* Two-column layout (Essent reference): form on the left, side panel
          with Status / Summary / Points Icon on the right. Collapses to a
          single column under ~720px via the auto-fit grid. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: 16,
          marginTop: 12,
          alignItems: "start",
        }}
      >
        {/* ───── Left column ───── */}
        <div style={{ display: "grid", gap: 16 }}>
          <Card heading="Title">
            <s-text-field
              label=""
              value={title}
              onChange={(e: { target: { value: string } }) =>
                setTitle(e.target.value)
              }
            />
          </Card>

          <Card heading={isPurchase ? "Earning method" : "Points awarded"}>
            {isPurchase && (
              <RadioGroup
                value={perDollar ? "increments" : "fixed"}
                onChange={(v) => setPerDollar(v === "increments")}
                options={[
                  {
                    value: "increments",
                    label: "Increments of points (recommended)",
                  },
                  { value: "fixed", label: "Fixed amount of points" },
                ]}
              />
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: isPurchase && perDollar ? "1fr 1fr" : "1fr",
                gap: 12,
                marginTop: 12,
              }}
            >
              <NumberFieldWithSuffix
                label="Customer gets"
                value={points}
                suffix="Points"
                onChange={(n) => setPoints(Math.max(0, n))}
              />
              {isPurchase && perDollar && (
                <NumberFieldWithSuffix
                  label="For every amount spent"
                  value={1}
                  suffix={currencyCode}
                  fixed
                />
              )}
            </div>
            <div style={{ marginTop: 12 }}>
              <s-text-field
                label="Times a customer can complete this action"
                value={completionLimit === null ? "Unlimited" : String(completionLimit)}
                onChange={(e: { target: { value: string } }) => {
                  const v = e.target.value.trim();
                  if (v === "" || v.toLowerCase() === "unlimited") {
                    setCompletionLimit(null);
                    return;
                  }
                  const n = Number.parseInt(v, 10);
                  setCompletionLimit(Number.isFinite(n) && n > 0 ? n : null);
                }}
              />
            </div>
          </Card>
        </div>

        {/* ───── Right column ───── */}
        <div style={{ display: "grid", gap: 16 }}>
          <Card heading="Status">
            <RadioGroup
              value={enabled ? "enabled" : "disabled"}
              onChange={(v) => setEnabled(v === "enabled")}
              options={[
                { value: "enabled", label: "Enabled" },
                { value: "disabled", label: "Disabled" },
              ]}
            />
          </Card>

          <Card heading="Summary">
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                fontSize: 13,
                lineHeight: 1.55,
                color: "#202223",
              }}
            >
              {summaryBullets.map((b, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  {b}
                </li>
              ))}
            </ul>
          </Card>

          <Card heading="Points Icon">
            <RadioGroup
              value="default"
              onChange={() => {}}
              options={[
                { value: "default", label: "Default" },
                { value: "custom", label: "Custom image", disabled: true },
              ]}
            />
            <div
              aria-hidden="true"
              style={{
                marginTop: 10,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 44,
                height: 44,
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: "#fff",
                fontSize: 20,
              }}
            >
              {actionName === "purchase"
                ? "🛍"
                : actionName === "signup"
                  ? "👤"
                  : actionName === "birthday"
                    ? "🎂"
                    : actionName === "newsletter"
                      ? "✉"
                      : actionName === "social"
                        ? "🔗"
                        : actionName === "review"
                          ? "★"
                          : "🎉"}
            </div>
          </Card>
        </div>
      </div>

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

// ───────────────────────────────────────────────────────────────────────────
// Local presentational helpers — kept inside this file because the two-column
// editor is the only place that needs them. Plain JSX + inline styles match
// the Polaris-native restraint from the visual-style memory.
// ───────────────────────────────────────────────────────────────────────────

function Card({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e3e5e7",
        borderRadius: 10,
        padding: 16,
      }}
    >
      <div
        style={{
          fontWeight: 600,
          fontSize: 14,
          marginBottom: 12,
          color: "#202223",
        }}
      >
        {heading}
      </div>
      {children}
    </div>
  );
}

function RadioGroup({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <label
            key={o.value}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: o.disabled ? "default" : "pointer",
              fontSize: 14,
              color: o.disabled ? "#8c9196" : "#202223",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                border: `1.5px solid ${selected ? "#202223" : "#8c9196"}`,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {selected && (
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#202223",
                  }}
                />
              )}
            </span>
            <input
              type="radio"
              checked={selected}
              disabled={o.disabled}
              onChange={() => !o.disabled && onChange(o.value)}
              style={{
                position: "absolute",
                opacity: 0,
                pointerEvents: "none",
                width: 0,
                height: 0,
              }}
            />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}

function NumberFieldWithSuffix({
  label,
  value,
  suffix,
  onChange,
  fixed,
}: {
  label: string;
  value: number;
  suffix: string;
  onChange?: (n: number) => void;
  fixed?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 13,
          color: "#6d7175",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          border: "1px solid #d1d5db",
          borderRadius: 6,
          background: "#fff",
          overflow: "hidden",
        }}
      >
        <input
          type="number"
          min={0}
          value={value}
          readOnly={fixed}
          onChange={(e) => onChange?.(Number.parseInt(e.target.value, 10) || 0)}
          style={{
            flex: 1,
            border: 0,
            outline: 0,
            padding: "8px 10px",
            fontSize: 14,
            color: "#202223",
            background: "transparent",
            font: "inherit",
          }}
        />
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0 12px",
            background: "#f6f6f7",
            color: "#6d7175",
            fontSize: 13,
            borderLeft: "1px solid #d1d5db",
          }}
        >
          {suffix}
        </span>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
