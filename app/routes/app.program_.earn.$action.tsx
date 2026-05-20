// Per-rule earn editor (BON-simple). One screen per action with just the three
// fields a merchant actually needs to set: numeric point value, status, and
// (for the purchase rule) whether points are awarded per dollar spent or as a
// flat per-order amount. Plus a plain-language read-only Summary card so the
// merchant can sanity-check before saving. Replaces the bulk-form pattern that
// used to live on /app/program.

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
import { useMoney } from "../lib/use-money";

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

const LABELS: Record<ActionName, { title: string; description: string }> = {
  purchase: {
    title: "Place an order",
    description:
      "Points awarded when a customer's order is paid. Can be a flat amount per order or scaled by dollars spent.",
  },
  signup: {
    title: "Create an account",
    description:
      "One-time bonus for a customer who signs up for an account in your store.",
  },
  birthday: {
    title: "Celebrate a birthday",
    description:
      "Awarded once per year on the customer's saved birthday — sent on the day, no manual work.",
  },
  newsletter: {
    title: "Subscribe to newsletter",
    description:
      "Awarded when a customer signs up for marketing emails through your storefront.",
  },
  social: {
    title: "Follow on social",
    description:
      "Awarded when a customer follows or shares your store on their social channels (requires social integration).",
  },
  review: {
    title: "Leave a product review",
    description:
      "Awarded when a customer submits a verified product review (requires a reviews app integration).",
  },
  anniversary: {
    title: "Account anniversary",
    description:
      "Awarded once a year on the anniversary of the customer joining your loyalty program.",
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

export const loader = async ({ params, request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const action = String(params.action ?? "");
  if (!isActionName(action)) throw new Response("Unknown action", { status: 404 });

  const existing = await prisma.earnRule.findFirst({
    where: { shopId: shop.id, action },
  });

  return {
    action,
    rule: {
      points: existing?.points ?? (action === "purchase" ? 1 : 50),
      perDollar: existing?.perDollar ?? action === "purchase",
      enabled: existing?.enabled ?? (action === "purchase" || action === "signup"),
    },
  };
};

type EarnActionResult =
  | { ok: false; message: string }
  | { ok: true; redirectTo: string };

// ⚠ IFRAME AUTH: this action returns redirect-as-data, NOT a server-side
// redirect Response. When react-router follows a server-side redirect from
// an action in the embedded admin, the follow-up request can land WITHOUT
// the session token attached, which logs the merchant out. Returning the
// destination as data lets the component navigate client-side via
// useAppNavigate, which goes through the App Bridge fetch interceptor and
// keeps the session intact.
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
    return { ok: false, message: "Points must be a non-negative whole number." };
  }
  const perDollar = form.get("perDollar") === "on";
  const enabled = form.get("enabled") === "on";

  const existing = await prisma.earnRule.findFirst({
    where: { shopId: shop.id, action: a },
  });
  if (existing) {
    await prisma.earnRule.update({
      where: { id: existing.id },
      data: { points, perDollar, enabled },
    });
  } else {
    await prisma.earnRule.create({
      data: { shopId: shop.id, action: a, points, perDollar, enabled },
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
  const saveBarRef = useRef<HTMLElement | null>(null);

  // Action returns { ok: true, redirectTo } on save — navigate client-side so
  // the iframe (and the session) stays intact.
  useEffect(() => {
    if (actionData?.ok && "redirectTo" in actionData && actionData.redirectTo) {
      appNav(actionData.redirectTo);
    }
  }, [actionData, appNav]);

  const meta = LABELS[actionName as ActionName];
  const [points, setPoints] = useState(rule.points);
  const [perDollar, setPerDollar] = useState(rule.perDollar);
  const [enabled, setEnabled] = useState(rule.enabled);
  const dirty =
    points !== rule.points ||
    perDollar !== rule.perDollar ||
    enabled !== rule.enabled;
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
    fd.set("points", String(points));
    if (perDollar) fd.set("perDollar", "on");
    if (enabled) fd.set("enabled", "on");
    submit(fd, { method: "POST" });
  }, [points, perDollar, enabled, submit]);

  const discard = useCallback(() => {
    setPoints(rule.points);
    setPerDollar(rule.perDollar);
    setEnabled(rule.enabled);
  }, [rule]);

  const summary = (() => {
    if (!enabled) return "This rule is currently inactive — no points awarded.";
    if (actionName === "purchase") {
      return perDollar
        ? `Customers earn ${points} point${points === 1 ? "" : "s"} for every ${money(1)} they spend.`
        : `Customers earn ${points} point${points === 1 ? "" : "s"} for each completed order, regardless of order value.`;
    }
    return `Customers earn ${points} point${points === 1 ? "" : "s"} for ${meta.title.toLowerCase()}.`;
  })();

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

      <s-section heading="Settings">
        <s-paragraph>{meta.description}</s-paragraph>
        <s-stack direction="block" gap="base">
          <s-select
            label="Status"
            value={enabled ? "active" : "inactive"}
            onChange={(e: { target: { value: string } }) =>
              setEnabled(e.target.value === "active")
            }
          >
            <s-option value="active">Active</s-option>
            <s-option value="inactive">Inactive</s-option>
          </s-select>
          <s-text-field
            label="Points"
            type="number"
            value={String(points)}
            onChange={(e: { target: { value: string } }) =>
              setPoints(Math.max(0, Number.parseInt(e.target.value, 10) || 0))
            }
          />
          {actionName === "purchase" && (
            <s-checkbox
              {...(perDollar ? { checked: "" } : {})}
              onChange={(e: { target: { checked: boolean } }) =>
                setPerDollar(e.target.checked)
              }
            >
              Award points per dollar spent (otherwise flat per order)
            </s-checkbox>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Summary">
        <s-paragraph>{summary}</s-paragraph>
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
