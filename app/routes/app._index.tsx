// Home — program health snapshot + onboarding checklist slot + AI suggestions
// slot. All data read from Prisma (no placeholders). Phase 3 fills the AI
// suggestion generation and the activation flow; this page already renders
// whatever rows exist so the slots are real, not shells.
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  useFetcher,
  useLoaderData,
  useRouteError,
  useSearchParams,
} from "react-router";
import { useAppNavigate } from "../lib/app-navigate";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { checkAppEmbedEnabled } from "../lib/theme-embed.server";
import { getDashboardMetrics } from "../lib/dashboard.server";

const RANGES = {
  "30d": { label: "Last 30 days", days: 30 },
  "90d": { label: "Last 90 days", days: 90 },
  ytd: { label: "Year to date", days: 365 }, // approx, fine for v1
} as const;
type RangeKey = keyof typeof RANGES;
function asRange(v: string | null): RangeKey {
  return v === "90d" || v === "ytd" ? v : "30d";
}

// Mirror the defaults declared in app/routes/app.program.tsx so the home
// page counts an unsaved-but-default-enabled earn rule the same way the
// program editor displays it. Otherwise the home tile reports "0
// configured" while the program page shows 2 visible defaults — confusing.
const EARN_ACTION_DEFAULTS: Record<string, boolean> = {
  purchase: true,
  signup: true,
  birthday: false,
  newsletter: false,
  social: false,
  review: false,
  anniversary: false,
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const range = asRange(url.searchParams.get("range"));
  const windowMs = RANGES[range].days * 24 * 60 * 60 * 1000;

  // Upsert (not findUnique): a freshly installed store has no Shop row yet and
  // nothing else bootstraps it on the home page, so reading-only dead-ended on
  // "Finishing installation" forever. Mirrors the pattern in app.onboarding.tsx.
  const shop = await prisma.shop.upsert({
    where: { shopDomain: session.shop },
    update: {},
    create: { shopDomain: session.shop },
  });

  const [dashboard, earnRuleRows, rewardCount, embed] =
    await Promise.all([
      getDashboardMetrics(shop.id, windowMs),
      prisma.earnRule.findMany({
        where: { shopId: shop.id },
        select: { action: true, enabled: true },
      }),
      prisma.reward.count({ where: { shopId: shop.id, enabled: true } }),
      checkAppEmbedEnabled(admin),
    ]);

  // Effective earn count = explicit DB rows where enabled=true PLUS the
  // default-enabled actions (purchase, signup) that don't have a DB row
  // yet. Mirrors the program page's "show defaults until saved" logic.
  const byAction = new Map(earnRuleRows.map((r) => [r.action, r.enabled]));
  const earnRuleCount = Object.keys(EARN_ACTION_DEFAULTS).reduce(
    (sum, action) => {
      const fromDb = byAction.get(action);
      const enabled =
        fromDb === undefined ? EARN_ACTION_DEFAULTS[action] : fromDb;
      return enabled ? sum + 1 : sum;
    },
    0,
  );

  // Manual "I've done this" overrides stored on the Shop row's JSON snapshot.
  // Lets the merchant mark a step done when our auto-detection can't see it
  // (e.g. embed enabled on a theme our scope doesn't read), and survives
  // across loads.
  const snap = (shop.aiConfigSnapshot ?? null) as Record<string, unknown> | null;
  const manuallyDone = Array.isArray(snap?.setupManualDone)
    ? (snap.setupManualDone as string[])
    : [];

  // Order matters — activation is the LAST step so the merchant gets earn
  // rules + rewards + storefront in place before flipping the program on.
  const steps = [
    {
      id: "earn",
      label: "Set up earn rules",
      detail:
        "Decide how many points customers get for placing an order, signing up and other actions. You can tune the numbers any time.",
      cta: "Open earn rules",
      autoDone: earnRuleCount > 0,
      href: "/app/program",
    },
    {
      id: "rewards",
      label: "Add rewards to the catalog",
      detail:
        "Pick what customers can redeem points for — discount codes, free shipping, free products or store credit.",
      cta: "Open rewards",
      autoDone: rewardCount > 0,
      href: "/app/rewards",
    },
    {
      id: "embed",
      label: "Enable the storefront widget",
      detail:
        "Turn on the Royal Loyalty app embed in your theme editor so shoppers can see the floating launcher, cart redeem widget and loyalty page.",
      cta: "Open theme editor",
      autoDone: embed.enabled === true,
      href: "shopify:admin/themes/current/editor?context=apps",
    },
    {
      id: "activate",
      label: "Activate the program",
      detail:
        "Flip the program on so new orders start awarding points and cashback to your customers.",
      cta: shop.programActivatedAt ? "Open program" : "Activate program",
      autoDone: Boolean(shop.programActivatedAt),
      href: "/app/program",
    },
  ].map((s) => ({
    ...s,
    manuallyDone: manuallyDone.includes(s.id),
    done: s.autoDone || manuallyDone.includes(s.id),
  }));

  return {
    shopMissing: false as const,
    range,
    steps,
    dashboard,
    programActivated: Boolean(shop.programActivatedAt),
    embedEnabled: embed.enabled,
    plan: shop.plan ?? "FREE",
    monthlyLoyaltyOrderCount: shop.monthlyLoyaltyOrderCount ?? 0,
    currencyCode: shop.currencyCode ?? "USD",
    shopDomain: shop.shopDomain,
  };
};

// Toggle the manual "I've done this" override for a setup step. Posted by
// the small fetcher form on each step card; the loader re-reads on the
// resulting revalidate so the UI reflects the toggle without a full nav.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  if (form.get("_intent") !== "toggle_setup_step") {
    return { ok: false } as const;
  }
  const stepId = String(form.get("stepId") ?? "").trim();
  if (!stepId) return { ok: false } as const;

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    select: { id: true, aiConfigSnapshot: true },
  });
  if (!shop) return { ok: false } as const;

  const base =
    shop.aiConfigSnapshot && typeof shop.aiConfigSnapshot === "object"
      ? (shop.aiConfigSnapshot as Record<string, unknown>)
      : {};
  const current = Array.isArray(base.setupManualDone)
    ? (base.setupManualDone as string[])
    : [];
  const next = current.includes(stepId)
    ? current.filter((s) => s !== stepId)
    : [...current, stepId];
  await prisma.shop.update({
    where: { id: shop.id },
    data: { aiConfigSnapshot: { ...base, setupManualDone: next } },
  });
  return { ok: true } as const;
};

export default function Home() {
  const data = useLoaderData<typeof loader>();

  if (data.shopMissing) {
    return (
      <s-page heading="Royal Loyalty">
        <s-section heading="Finishing installation">
          <s-paragraph>
            We are still finalizing this store&apos;s setup. Reload in a moment
            to see your program health.
          </s-paragraph>
        </s-section>
      </s-page>
    );
  }

  const remaining = data.steps.filter((s) => !s.done);
  const allDone = remaining.length === 0;
  const nav = useAppNavigate();
  const d = data.dashboard;

  return (
    <s-page heading="Royal Loyalty">
      <s-button
        slot="primary-action"
        onClick={() => nav("/app/analytics")}
      >
        View analytics
      </s-button>

      <WelcomeCard />

      {/* Status chips — plain row directly on the page background, not in
          a boxed section. Presail-style: just a small bar of pills. */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          margin: "0 0 16px",
        }}
      >
        <StatusChip
          tone={data.embedEnabled === true ? "success" : "neutral"}
          label={
            data.embedEnabled === true
              ? "App embed enabled"
              : data.embedEnabled === false
                ? "App embed disabled"
                : "App embed status unknown"
          }
        />
        <StatusChip
          tone={data.programActivated ? "success" : "neutral"}
          label={data.programActivated ? "Loyalty live" : "Loyalty inactive"}
        />
        <StatusChip tone="neutral" label={`${data.plan} plan`} />
      </div>

      {/* Plan summary moves to the TOP, right after the chips — Presail
          puts plan usage above performance so the merchant sees their
          quota before the metrics. */}
      <PlanSummarySection
        plan={data.plan}
        ordersUsed={data.monthlyLoyaltyOrderCount}
      />

      {/* Compact setup guide — list rows with circle/check, title +
          inline action, line-through on done. Single section card. */}
      {!allDone && (
        <s-section heading={`Setup guide — ${data.steps.length - remaining.length}/${data.steps.length} complete`}>
          <SetupGuideList
            steps={data.steps}
            onCta={(href) => nav(href)}
          />
        </s-section>
      )}

      {/* Performance metrics — Essent / Smile pattern. Date range selector
          sits in the section heading row, not as its own page-level row. */}
      <s-section>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 12,
          }}
        >
          <s-text fontWeight="bold">Performance</s-text>
          <DateRangeSelect value={data.range} />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {d.loyaltyDrivenRevenueEstimated && (
            <MetricCard
              label="Loyalty-driven revenue"
              value={formatCurrency(
                d.loyaltyDrivenRevenueEstimated.current,
                data.currencyCode,
              )}
              delta={d.loyaltyDrivenRevenueEstimated.deltaFraction}
              emptyHint="Order revenue from members earning points — appears once orders ship."
              isEmpty={d.loyaltyDrivenRevenueEstimated.current === 0}
            />
          )}
          <MetricCard
            label="Members added"
            value={d.membersAdded.current.toLocaleString()}
            delta={d.membersAdded.deltaFraction}
            emptyHint="New customers enrolled in the program."
            isEmpty={d.membersAdded.current === 0}
          />
          <MetricCard
            label="Earners"
            value={d.earners.current.toLocaleString()}
            delta={d.earners.deltaFraction}
            emptyHint="Members who earned points in this period."
            isEmpty={d.earners.current === 0}
          />
          <MetricCard
            label="Redeemers"
            value={d.redeemers.current.toLocaleString()}
            delta={d.redeemers.deltaFraction}
            emptyHint="Members who spent points in this period."
            isEmpty={d.redeemers.current === 0}
          />
          <MetricCard
            label="Points issued"
            value={d.pointsIssued.current.toLocaleString()}
            delta={d.pointsIssued.deltaFraction}
            emptyHint="Total points awarded across all activity."
            isEmpty={d.pointsIssued.current === 0}
          />
          <MetricCard
            label="Points redeemed"
            value={d.pointsRedeemed.current.toLocaleString()}
            delta={d.pointsRedeemed.deltaFraction}
            emptyHint="Total points spent on rewards."
            isEmpty={d.pointsRedeemed.current === 0}
          />
          <MetricCard
            label="Referral orders"
            value={d.referralOrders.current.toLocaleString()}
            delta={d.referralOrders.deltaFraction}
            emptyHint="Orders attributed to a referral link in this period."
            isEmpty={d.referralOrders.current === 0}
          />
        </div>
      </s-section>

      {/* Activity tables side by side */}
      <s-section heading="Activity">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: 12,
          }}
        >
          <RecentActivityCard rows={d.recentActivity} />
          <TopMembersCard rows={d.topMembers} />
        </div>
      </s-section>

    </s-page>
  );
}

function formatCurrency(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currencyCode || "USD",
    }).format(amount);
  } catch {
    return amount.toFixed(2) + " " + currencyCode;
  }
}

function StatusChip({
  tone,
  label,
}: {
  tone: "success" | "neutral" | "critical";
  label: string;
}) {
  const palette =
    tone === "success"
      ? { bg: "#e3f4e1", fg: "#0d6c2e", dot: "#0e8a3e" }
      : tone === "critical"
        ? { bg: "#fde7e9", fg: "#a51b29", dot: "#d72c0d" }
        : { bg: "#f1f2f3", fg: "#4a4f55", dot: "#8c9196" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: palette.bg,
        color: palette.fg,
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        lineHeight: 1.6,
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: palette.dot,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}

function DateRangeSelect({ value }: { value: RangeKey }) {
  const [params, setParams] = useSearchParams();
  return (
    // @ts-expect-error - s-select custom element JSX types
    <s-select
      label="Date range"
      labelHidden
      value={value}
      onChange={(e: { target: { value: string } }) => {
        const next = new URLSearchParams(params);
        next.set("range", e.target.value);
        setParams(next);
      }}
    >
      {(Object.keys(RANGES) as RangeKey[]).map((k) => (
        // @ts-expect-error - s-option custom element JSX types
        <s-option key={k} value={k}>
          {RANGES[k].label}
        </s-option>
      ))}
      {/* @ts-expect-error - s-select custom element JSX types */}
    </s-select>
  );
}

function MetricCard({
  label,
  value,
  delta,
  emptyHint,
  isEmpty,
}: {
  label: string;
  value: string;
  delta: number | null;
  emptyHint: string;
  isEmpty: boolean;
}) {
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack direction="block" gap="small-200">
        <s-text tone="subdued">{label}</s-text>
        {isEmpty ? (
          <>
            <s-heading>{value}</s-heading>
            <s-text tone="subdued">{emptyHint}</s-text>
          </>
        ) : (
          <s-stack direction="inline" gap="small-200" alignItems="baseline">
            <s-heading>{value}</s-heading>
            {delta !== null && <DeltaPill fraction={delta} />}
          </s-stack>
        )}
      </s-stack>
    </s-box>
  );
}

function DeltaPill({ fraction }: { fraction: number }) {
  const positive = fraction >= 0;
  const pct = Math.abs(fraction * 100).toFixed(0);
  return (
    <span
      style={{
        fontSize: 13,
        fontWeight: 600,
        color: positive ? "#0e8a3e" : "#d72c0d",
      }}
    >
      {positive ? "+" : "−"}
      {pct}%
    </span>
  );
}

function RecentActivityCard({
  rows,
}: {
  rows: Array<{
    id: string;
    memberName: string | null;
    memberEmail: string | null;
    type: string;
    reason: string;
    points: number;
    date: string;
  }>;
}) {
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack direction="block" gap="base">
        <s-text fontWeight="bold">Recent activity</s-text>
        {rows.length === 0 ? (
          <s-text tone="subdued">
            No activity yet. Customer earn / redeem / referral events will appear here as they happen.
          </s-text>
        ) : (
          <s-stack direction="block" gap="small-200">
            {rows.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "6px 0",
                  borderBottom: "1px solid #f1f2f3",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>
                    {r.memberName || r.memberEmail || "Anonymous member"}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#6d7175",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.reason}
                  </div>
                </div>
                <div
                  style={{
                    fontWeight: 600,
                    color: r.points >= 0 ? "#0e8a3e" : "#d72c0d",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.points >= 0 ? "+" : ""}
                  {r.points}
                </div>
              </div>
            ))}
          </s-stack>
        )}
      </s-stack>
    </s-box>
  );
}

function TopMembersCard({
  rows,
}: {
  rows: Array<{
    id: string;
    name: string | null;
    email: string | null;
    totalEarned: number;
  }>;
}) {
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack direction="block" gap="base">
        <s-text fontWeight="bold">Most active members</s-text>
        {rows.length === 0 ? (
          <s-text tone="subdued">
            Your top members by lifetime points earned will appear here once orders start awarding.
          </s-text>
        ) : (
          <s-stack direction="block" gap="small-200">
            {rows.map((r) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "6px 0",
                  borderBottom: "1px solid #f1f2f3",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>
                    {r.name || r.email || "Anonymous member"}
                  </div>
                  {r.email && r.name && (
                    <div style={{ fontSize: 12, color: "#6d7175" }}>{r.email}</div>
                  )}
                </div>
                <div style={{ fontWeight: 600 }}>
                  {r.totalEarned.toLocaleString()} pts
                </div>
              </div>
            ))}
          </s-stack>
        )}
      </s-stack>
    </s-box>
  );
}

function PlanSummarySection({
  plan,
  ordersUsed,
}: {
  plan: string;
  ordersUsed: number;
}) {
  // Plan caps copied from app/lib/billing.server.ts PLANS table. Hardcoding
  // them here would couple us to that file; instead the merchant-visible
  // cap is shown as "Unlimited" for Pro.
  const CAPS: Record<string, number | null> = {
    FREE: 250,
    STARTER: 500,
    GROWTH: 2000,
    PRO: null,
  };
  const cap = CAPS[plan] ?? 250;
  const percent = cap ? Math.min(100, (ordersUsed / cap) * 100) : 0;
  const nav = useAppNavigate();
  return (
    <s-section heading="Plan">
      <s-stack direction="block" gap="base">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <s-stack direction="block" gap="none">
            <s-text fontWeight="bold">{plan} plan</s-text>
            <s-text tone="subdued">
              {cap
                ? `${ordersUsed.toLocaleString()} of ${cap.toLocaleString()} loyalty orders this month`
                : `${ordersUsed.toLocaleString()} loyalty orders this month — unlimited`}
            </s-text>
          </s-stack>
          {plan !== "PRO" && (
            <s-button onClick={() => nav("/app/settings")}>Upgrade plan</s-button>
          )}
        </div>
        {cap && (
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
                width: `${percent}%`,
                height: "100%",
                background: percent >= 90 ? "#d72c0d" : "#0e8a3e",
                transition: "width 200ms ease",
              }}
            />
          </div>
        )}
      </s-stack>
    </s-section>
  );
}

// Compact setup guide list. Single column of rows, each: filled-or-empty
// circle + step title (line-through when done) + small inline action
// button. Much tighter than per-step <s-box> cards — Presail-style. The
// "I've done this" / "Unmark" toggle becomes a small text button to the
// right of the primary action so the row doesn't grow vertically.
function SetupGuideList({
  steps,
  onCta,
}: {
  steps: Array<{
    id: string;
    label: string;
    detail: string;
    cta: string;
    autoDone: boolean;
    manuallyDone: boolean;
    done: boolean;
    href: string;
  }>;
  onCta: (href: string) => void;
}) {
  const fetcher = useFetcher();
  const toggleManual = (stepId: string) => {
    const fd = new FormData();
    fd.set("_intent", "toggle_setup_step");
    fd.set("stepId", stepId);
    fetcher.submit(fd, { method: "POST", action: "/app" });
  };
  return (
    <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {steps.map((step, i) => (
        <li
          key={step.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 0",
            borderTop: i === 0 ? "none" : "1px solid #f1f2f3",
            opacity: step.done ? 0.65 : 1,
          }}
        >
          <StepCircle done={step.done} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "#202223",
                textDecoration: step.done ? "line-through" : "none",
              }}
            >
              {step.label}
            </div>
            <div style={{ fontSize: 12, color: "#6d7175", marginTop: 2 }}>
              {step.detail}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {!step.done && (
              <s-button onClick={() => onCta(step.href)}>{step.cta}</s-button>
            )}
            {step.done && (
              <s-button onClick={() => onCta(step.href)}>Open</s-button>
            )}
            {(!step.autoDone || step.manuallyDone) && (
              <button
                type="button"
                onClick={() => toggleManual(step.id)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#6d7175",
                  fontSize: 12,
                  cursor: "pointer",
                  padding: "4px 6px",
                  whiteSpace: "nowrap",
                }}
                title={
                  step.manuallyDone
                    ? "Mark this step as not done"
                    : "Mark this step as done"
                }
              >
                {step.manuallyDone ? "Unmark" : "I've done this"}
              </button>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function StepCircle({ done }: { done: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        width: 20,
        height: 20,
        minWidth: 20,
        borderRadius: "50%",
        border: done ? "none" : "1.5px solid #c9cccf",
        background: done ? "#0e8a3e" : "transparent",
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {done && (
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </div>
  );
}

// One-time celebration shown when the merchant lands here from the onboarding
// chain (Onboarding → Program → Branding → Home?welcomed=1). Theme-app-embed
// activation is the only remaining setup step, so we nudge it inline rather
// than dropping the merchant straight into the theme editor.
function WelcomeCard() {
  const [searchParams] = useSearchParams();
  const nav = useAppNavigate();
  if (searchParams.get("welcomed") !== "1") return null;
  return (
    <s-section>
      <s-banner tone="success" heading="You're all set up">
        <s-paragraph>
          Your program is activated and your branding is saved. One last thing
          to go live: enable the loyalty widget in your Shopify theme editor.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          <s-button
            onClick={() =>
              nav("shopify:admin/themes/current/editor?context=apps")
            }
            variant="primary"
          >
            Open theme editor
          </s-button>
          <s-button onClick={() => nav("/app")}>Dismiss</s-button>
        </s-stack>
      </s-banner>
    </s-section>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
