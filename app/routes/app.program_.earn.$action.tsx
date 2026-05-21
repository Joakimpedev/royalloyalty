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
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useAppNavigate } from "../lib/app-navigate";
import { formatMoney } from "../lib/use-money";
import { loadShopMoneyContext } from "../lib/shop-context.server";
import { ChoiceList, PageTitle, useSaveBar } from "../lib/polaris-bindings";

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
  /** Only used when action === "social". Each entry becomes a "Follow"
   *  button on the storefront with its own handle / label / points. */
  platforms?: SocialPlatform[];
};

export type SocialPlatformId =
  | "instagram"
  | "tiktok"
  | "x"
  | "facebook"
  | "youtube";

export interface SocialPlatform {
  id: SocialPlatformId;
  handle: string;
  label: string;
  points: number;
  enabled: boolean;
}

export const SOCIAL_PLATFORM_META: Record<
  SocialPlatformId,
  { name: string; handlePrefix: string; urlFor: (handle: string) => string }
> = {
  instagram: {
    name: "Instagram",
    handlePrefix: "@",
    urlFor: (h) => `https://instagram.com/${h.replace(/^@/, "")}`,
  },
  tiktok: {
    name: "TikTok",
    handlePrefix: "@",
    urlFor: (h) => `https://tiktok.com/@${h.replace(/^@/, "")}`,
  },
  x: {
    name: "X (Twitter)",
    handlePrefix: "@",
    urlFor: (h) => `https://x.com/${h.replace(/^@/, "")}`,
  },
  facebook: {
    name: "Facebook",
    handlePrefix: "",
    urlFor: (h) => `https://facebook.com/${h.replace(/^@/, "")}`,
  },
  youtube: {
    name: "YouTube",
    handlePrefix: "@",
    urlFor: (h) => `https://youtube.com/${h.startsWith("@") ? h : `@${h}`}`,
  },
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
      platforms: config?.platforms ?? [],
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

  // Social rule carries a JSON list of platforms (handle / label / points
  // / enabled) instead of using `points` on the row itself. We parse and
  // sanitize the payload here so the storefront and proxy can trust the
  // shape they read back.
  if (a === "social") {
    const raw = String(form.get("platforms") ?? "[]");
    try {
      const parsed = JSON.parse(raw) as Array<Partial<SocialPlatform>>;
      const allowed: SocialPlatformId[] = [
        "instagram",
        "tiktok",
        "x",
        "facebook",
        "youtube",
      ];
      config.platforms = parsed
        .filter(
          (p): p is SocialPlatform =>
            !!p &&
            typeof p === "object" &&
            allowed.includes(p.id as SocialPlatformId),
        )
        .map((p) => ({
          id: p.id as SocialPlatformId,
          handle: String(p.handle ?? "").slice(0, 60).trim(),
          label: String(p.label ?? "Follow").slice(0, 30).trim() || "Follow",
          points: Math.max(0, Number(p.points) || 0),
          enabled: !!p.enabled,
        }));
    } catch {
      config.platforms = [];
    }
  }

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

function SocialPlatformsEditor({
  value,
  onChange,
}: {
  value: SocialPlatform[];
  onChange: (next: SocialPlatform[]) => void;
}) {
  const PLATFORM_IDS: SocialPlatformId[] = [
    "instagram",
    "tiktok",
    "x",
    "facebook",
    "youtube",
  ];
  const used = new Set(value.map((p) => p.id));
  const addable = PLATFORM_IDS.filter((id) => !used.has(id));

  const add = (id: SocialPlatformId) =>
    onChange([
      ...value,
      { id, handle: "", label: "Follow", points: 125, enabled: true },
    ]);
  const update = (id: SocialPlatformId, patch: Partial<SocialPlatform>) =>
    onChange(value.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const remove = (id: SocialPlatformId) =>
    onChange(value.filter((p) => p.id !== id));

  return (
    // @ts-expect-error - s-stack custom element JSX types
    <s-stack direction="block" gap="base">
      {value.length === 0 && (
        // @ts-expect-error - s-paragraph custom element JSX types
        <s-paragraph>
          {/* @ts-expect-error - s-text custom element JSX types */}
          <s-text tone="subdued">
            No social platforms yet. Pick one below to start awarding points
            when customers follow you.
          </s-text>
          {/* @ts-expect-error - s-paragraph custom element JSX types */}
        </s-paragraph>
      )}

      {value.map((p) => {
        const meta = SOCIAL_PLATFORM_META[p.id];
        return (
          <div
            key={p.id}
            style={{
              border: "1px solid #e1e3e5",
              borderRadius: 8,
              padding: 12,
              background: "#fff",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}
            >
              <strong>{meta.name}</strong>
              <button
                type="button"
                onClick={() => remove(p.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#6d7175",
                  cursor: "pointer",
                  fontSize: 12,
                  textDecoration: "underline",
                }}
              >
                Remove
              </button>
            </div>
            {/* @ts-expect-error - s-stack custom element JSX types */}
            <s-stack direction="block" gap="small-200">
              {/* @ts-expect-error - s-text-field custom element JSX types */}
              <s-text-field
                label={`${meta.name} handle`}
                value={p.handle}
                placeholder={meta.handlePrefix + "yourbrand"}
                onChange={(e: any) =>
                  update(p.id, { handle: String(e.target.value ?? "") })
                }
              />
              {/* @ts-expect-error - s-text-field custom element JSX types */}
              <s-text-field
                label="Link label"
                value={p.label}
                onChange={(e: any) =>
                  update(p.id, { label: String(e.target.value ?? "") })
                }
              />
              <div style={{ maxWidth: 280, width: "100%" }}>
                {/* @ts-expect-error - s-number-field custom element JSX types */}
                <s-number-field
                  label="Points earned"
                  suffix="points"
                  min={0}
                  value={String(p.points)}
                  onChange={(e: any) =>
                    update(p.id, {
                      points: Math.max(
                        0,
                        Number.parseInt(String(e.target.value), 10) || 0,
                      ),
                    })
                  }
                />
              </div>
              {/* @ts-expect-error - s-stack custom element JSX types */}
              <s-checkbox
                label="Enabled"
                checked={p.enabled ? true : undefined}
                onChange={(e: any) =>
                  update(p.id, { enabled: !!e.target.checked })
                }
              />
              {/* @ts-expect-error - s-stack custom element JSX types */}
            </s-stack>
          </div>
        );
      })}

      {addable.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 4,
          }}
        >
          {addable.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => add(id)}
              style={{
                background: "transparent",
                border: "1px solid #c9cccf",
                borderRadius: 999,
                padding: "4px 12px",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              + {SOCIAL_PLATFORM_META[id].name}
            </button>
          ))}
        </div>
      )}
      {/* @ts-expect-error - s-stack custom element JSX types */}
    </s-stack>
  );
}

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
  const [platforms, setPlatforms] = useState<SocialPlatform[]>(rule.platforms);

  const isSocial = actionName === "social";

  const dirty =
    title !== rule.title ||
    points !== rule.points ||
    perDollar !== rule.perDollar ||
    enabled !== rule.enabled ||
    completionLimit !== rule.completionLimit ||
    perAmount !== rule.perAmount ||
    JSON.stringify(platforms) !== JSON.stringify(rule.platforms);
  const saving = nav.state === "submitting";

  // Native <ui-save-bar> drives the unsaved-changes warning; useSaveBar
  // also hides the bar on unmount so it doesn't linger after a back nav.
  useSaveBar(saveBarRef, dirty);

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
    if (isSocial) fd.set("platforms", JSON.stringify(platforms));
    submit(fd, { method: "POST" });
  }, [
    title,
    points,
    perDollar,
    enabled,
    completionLimit,
    perAmount,
    isSocial,
    platforms,
    submit,
  ]);

  const discard = useCallback(() => {
    setTitle(rule.title);
    setPoints(rule.points);
    setPerDollar(rule.perDollar);
    setEnabled(rule.enabled);
    setCompletionLimit(rule.completionLimit);
    setPerAmount(rule.perAmount);
    setPlatforms(rule.platforms);
  }, [rule]);

  // Summary bullets — currency-aware, mirrors Essent's right-column summary.
  const summaryBullets: string[] = [];
  if (!enabled) {
    summaryBullets.push(
      "This rule is currently inactive — no points awarded.",
    );
  } else if (isSocial) {
    const activePlats = platforms.filter((p) => p.enabled && p.handle.trim());
    if (activePlats.length === 0) {
      summaryBullets.push("No active social platforms configured yet.");
    } else {
      activePlats.forEach((p) => {
        summaryBullets.push(
          `Customer earns ${p.points} point${p.points === 1 ? "" : "s"} for following you on ${SOCIAL_PLATFORM_META[p.id].name}`,
        );
      });
    }
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
    <s-page>
      {/* Body-level page title: back arrow + bold heading + subtitle inline
          at the top of the iframe content (Essent reference pattern). The
          chrome bar above is left without a heading on sub-pages so the
          merchant sees a single, prominent in-body title. */}
      <PageTitle
        title={meta.title}
        subtitle={meta.description}
        backHref="/app/program"
        dirty={dirty}
      />

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

      {/* ───── Main column ───── */}

      <s-section heading="Title">
        <s-text-field
          label="Title"
          value={title}
          onChange={(e: any) => setTitle(String(e.target.value ?? ""))}
        />
      </s-section>

      {isSocial ? (
        <s-section heading="Social platforms">
          <SocialPlatformsEditor value={platforms} onChange={setPlatforms} />
        </s-section>
      ) : (
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

          {/* Number fields stack vertically and are capped at ~280px wide
              — a 14-digit points value is already absurd; letting the
              field span the whole card visually invited bogus huge
              values. */}
          <div style={{ maxWidth: 280, width: "100%" }}>
            <s-number-field
              label="Customer gets"
              suffix="points"
              min={0}
              value={String(points)}
              onChange={(e: any) =>
                setPoints(
                  Math.max(
                    0,
                    Number.parseInt(String(e.target.value), 10) || 0,
                  ),
                )
              }
            />
          </div>
          {isPurchase && perDollar && (
            <div style={{ maxWidth: 280, width: "100%" }}>
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
            </div>
          )}

          {/* Completion limit: radio for Unlimited vs Fixed amount. When
              "Fixed amount" is picked the number field auto-pops in with a
              default of 1 (the most common case). Switching back to
              Unlimited sets the stored value to null. */}
          <ChoiceList
            label="Times a customer can complete this action"
            value={completionLimit === null ? "unlimited" : "fixed"}
            onChange={(v) =>
              setCompletionLimit(v === "unlimited" ? null : completionLimit ?? 1)
            }
          >
            <s-choice value="unlimited">Unlimited</s-choice>
            <s-choice value="fixed">Fixed amount</s-choice>
          </ChoiceList>
          {completionLimit !== null && (
            <div style={{ maxWidth: 280, width: "100%" }}>
              <s-number-field
                label="Limit"
                suffix="times"
                min={1}
                value={String(completionLimit)}
                onChange={(e: any) => {
                  const n = Number.parseInt(String(e.target.value), 10);
                  setCompletionLimit(Number.isFinite(n) && n > 0 ? n : 1);
                }}
              />
            </div>
          )}
        </s-stack>
      </s-section>
      )}

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

    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
