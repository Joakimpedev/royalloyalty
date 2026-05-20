// Program — earn rules + redemption settings (form page).
// Contextual save bar (ui-save-bar) wired with React Router useBlocker() so
// breadcrumb / link navigation is blocked while there are unsaved edits.
import { useEffect, useRef, useState, useCallback } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  useLoaderData,
  useActionData,
  useNavigation,
  useSearchParams,
  useSubmit,
  useBlocker,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

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

async function requireShop(shopDomain: string) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Response("Shop not found", { status: 404 });
  return shop;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);

  const rules = await prisma.earnRule.findMany({
    where: { shopId: shop.id },
  });
  const byAction = new Map(rules.map((r) => [r.action, r]));

  const earnRules = ACTIONS.map((a) => {
    const r = byAction.get(a);
    return {
      action: a,
      points: r?.points ?? (a === "purchase" ? 1 : 50),
      perDollar: r?.perDollar ?? a === "purchase",
      enabled: r?.enabled ?? (a === "purchase" || a === "signup"),
    };
  });

  return {
    earnRules,
    redemption: {
      programActivated: Boolean(shop.programActivatedAt),
    },
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const form = await request.formData();

  if (form.get("_intent") === "activate") {
    await prisma.shop.update({
      where: { id: shop.id },
      data: { programActivatedAt: new Date() },
    });
    return { ok: true, message: "Program activated." };
  }

  for (const action of ACTIONS) {
    const points = Number.parseInt(String(form.get(`points_${action}`)), 10);
    if (!Number.isFinite(points) || points < 0) {
      return {
        ok: false,
        message: `Points for "${action}" must be a non-negative whole number.`,
      };
    }
    const perDollar = form.get(`perDollar_${action}`) === "on";
    const enabled = form.get(`enabled_${action}`) === "on";

    const existing = await prisma.earnRule.findFirst({
      where: { shopId: shop.id, action },
    });
    if (existing) {
      await prisma.earnRule.update({
        where: { id: existing.id },
        data: { points, perDollar, enabled },
      });
    } else {
      await prisma.earnRule.create({
        data: { shopId: shop.id, action, points, perDollar, enabled },
      });
    }
  }

  return { ok: true, message: "Earn rules saved." };
};

export default function ProgramPage() {
  const { earnRules, redemption } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const [searchParams] = useSearchParams();
  // Onboarding redirect-chain marker (Essent pattern): when the wizard activates
  // a program it sends the merchant here with ?onboarding=1 so this page shows a
  // "Step 1 of 2" banner and a Continue CTA into /app/branding.
  const inOnboardingChain = searchParams.get("onboarding") === "1";
  const saveBarRef = useRef<HTMLElement | null>(null);

  const [rules, setRules] = useState(earnRules);
  const dirty =
    JSON.stringify(rules) !== JSON.stringify(earnRules);
  const saving = nav.state === "submitting";

  // Block link/breadcrumb navigation while there are unsaved edits.
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

  // Show/hide the contextual save bar with dirty state.
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
    for (const r of rules) {
      fd.set(`points_${r.action}`, String(r.points));
      if (r.perDollar) fd.set(`perDollar_${r.action}`, "on");
      if (r.enabled) fd.set(`enabled_${r.action}`, "on");
    }
    submit(fd, { method: "POST" });
  }, [rules, submit]);

  const discard = useCallback(() => {
    setRules(earnRules);
  }, [earnRules]);

  const update = (
    action: ActionName,
    patch: Partial<{ points: number; perDollar: boolean; enabled: boolean }>,
  ) => {
    setRules((prev) =>
      prev.map((r) => (r.action === action ? { ...r, ...patch } : r)),
    );
  };

  return (
    <s-page heading="Program">
      <s-button
        slot="primary-action"
        href={inOnboardingChain ? "/app/branding?onboarding=1" : "/app"}
        variant={inOnboardingChain ? "primary" : undefined}
      >
        {inOnboardingChain ? "Continue to Branding" : "Back to Home"}
      </s-button>

      {inOnboardingChain && (
        <s-section>
          <s-banner tone="info" heading="Step 1 of 2 — Review your earn rules">
            <s-paragraph>
              Your program is activated. Confirm the points each action awards,
              then continue to Branding to pick your widget look.
            </s-paragraph>
          </s-banner>
        </s-section>
      )}

      {/* @ts-expect-error - ui-save-bar is an App Bridge custom element */}
      <ui-save-bar id="program-save-bar" ref={saveBarRef}>
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
      {actionData && actionData.ok && (
        <s-section>
          <s-banner tone="success">
            <s-paragraph>{actionData.message}</s-paragraph>
          </s-banner>
        </s-section>
      )}

      <s-section heading="Earn rules">
        <s-paragraph>
          Configure how customers earn points for each action. Purchase rules
          can award points per dollar spent.
        </s-paragraph>
        <s-stack direction="block" gap="base">
          {rules.map((r) => (
            <s-box
              key={r.action}
              padding="base"
              borderWidth="base"
              borderRadius="base"
            >
              <s-stack direction="block" gap="base">
                <s-stack direction="inline" gap="base">
                  <s-text fontWeight="bold">
                    {r.action.charAt(0).toUpperCase() + r.action.slice(1)}
                  </s-text>
                  <s-checkbox
                    label="Enabled"
                    {...(r.enabled ? { checked: "" } : {})}
                    onChange={(e: { target: { checked: boolean } }) =>
                      update(r.action, { enabled: e.target.checked })
                    }
                  />
                </s-stack>
                <s-text-field
                  label="Points"
                  type="number"
                  value={String(r.points)}
                  onChange={(e: { target: { value: string } }) =>
                    update(r.action, {
                      points: Math.max(
                        0,
                        Number.parseInt(e.target.value, 10) || 0,
                      ),
                    })
                  }
                />
                {r.action === "purchase" && (
                  <s-checkbox
                    label="Award per dollar spent (otherwise flat per order)"
                    {...(r.perDollar ? { checked: "" } : {})}
                    onChange={(e: { target: { checked: boolean } }) =>
                      update(r.action, { perDollar: e.target.checked })
                    }
                  />
                )}
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-section>

      <s-section heading="Redemption & activation">
        <s-paragraph>
          Rewards are configured in the Rewards catalog. Activate the program to
          start awarding points on new orders.
        </s-paragraph>
        {redemption.programActivated ? (
          <s-badge tone="success">Program is active</s-badge>
        ) : (
          <s-button
            variant="primary"
            onClick={() =>
              submit({ _intent: "activate" }, { method: "POST" })
            }
            {...(saving ? { loading: "" } : {})}
          >
            Activate program
          </s-button>
        )}
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
