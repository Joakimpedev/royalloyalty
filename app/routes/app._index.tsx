// Home — program health snapshot + onboarding checklist slot + AI suggestions
// slot. All data read from Prisma (no placeholders). Phase 3 fills the AI
// suggestion generation and the activation flow; this page already renders
// whatever rows exist so the slots are real, not shells.
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useEffect, useState } from "react";
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

// Date range is YYYY-MM-DD inclusive on both ends. Default: last 30 days
// (today inclusive). Parsed defensively so a malformed URL falls back to
// the default range instead of crashing the loader.
function defaultRange(): { from: string; to: string } {
  const to = new Date();
  to.setUTCHours(0, 0, 0, 0);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - 29);
  return { from: ymd(from), to: ymd(to) };
}
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function parseRange(
  fromRaw: string | null,
  toRaw: string | null,
): { from: string; to: string } {
  const def = defaultRange();
  const re = /^\d{4}-\d{2}-\d{2}$/;
  const from = fromRaw && re.test(fromRaw) ? fromRaw : def.from;
  const to = toRaw && re.test(toRaw) ? toRaw : def.to;
  return from <= to ? { from, to } : def;
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
  const range = parseRange(
    url.searchParams.get("from"),
    url.searchParams.get("to"),
  );
  // Treat the to date as inclusive: query up to start-of-day(to + 1).
  const sinceDate = new Date(range.from + "T00:00:00.000Z");
  const untilDate = new Date(range.to + "T00:00:00.000Z");
  untilDate.setUTCDate(untilDate.getUTCDate() + 1);

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
      getDashboardMetrics(shop.id, sinceDate, untilDate),
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
    // (rangeLabels available on dashboard.seriesLabels for tooltips)
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

      {/* Date range picker — its own row above the Performance grid so
          shoppers know it scopes the metrics below. */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          margin: "0 0 8px",
        }}
      >
        <DateRangePicker value={data.range} />
      </div>

      {/* Performance — 2 rows × 3 sparkline KPI cards. Loyalty-driven
          revenue takes slot 1 when a purchase rule is configured;
          otherwise it's replaced by Referral orders so the grid still
          shows 6 distinct metrics. */}
      <s-section heading="Performance">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          {d.loyaltyDrivenRevenueEstimated ? (
            <MetricCard
              label="Loyalty-driven revenue"
              value={formatCurrency(
                d.loyaltyDrivenRevenueEstimated.current,
                data.currencyCode,
              )}
              delta={d.loyaltyDrivenRevenueEstimated.deltaFraction}
              series={d.loyaltyDrivenRevenueEstimated.series}
              seriesLabels={d.seriesLabels}
              formatTooltipValue={(v) => formatCurrency(v, data.currencyCode)}
            />
          ) : (
            <MetricCard
              label="Referral orders"
              value={d.referralOrders.current.toLocaleString()}
              delta={d.referralOrders.deltaFraction}
              series={d.referralOrders.series}
              seriesLabels={d.seriesLabels}
            />
          )}
          <MetricCard
            label="Members added"
            value={d.membersAdded.current.toLocaleString()}
            delta={d.membersAdded.deltaFraction}
            series={d.membersAdded.series}
            seriesLabels={d.seriesLabels}
          />
          <MetricCard
            label="Points issued"
            value={d.pointsIssued.current.toLocaleString()}
            delta={d.pointsIssued.deltaFraction}
            series={d.pointsIssued.series}
            seriesLabels={d.seriesLabels}
          />
          <MetricCard
            label="Points redeemed"
            value={d.pointsRedeemed.current.toLocaleString()}
            delta={d.pointsRedeemed.deltaFraction}
            series={d.pointsRedeemed.series}
            seriesLabels={d.seriesLabels}
          />
          <MetricCard
            label="Earners"
            value={d.earners.current.toLocaleString()}
            delta={d.earners.deltaFraction}
            series={d.earners.series}
            seriesLabels={d.seriesLabels}
          />
          <MetricCard
            label="Redeemers"
            value={d.redeemers.current.toLocaleString()}
            delta={d.redeemers.deltaFraction}
            series={d.redeemers.series}
            seriesLabels={d.seriesLabels}
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

// Polaris-native date range picker. Uses <s-popover> + <s-date-picker
// type="range"> so we get Shopify's first-party calendar overlay,
// keyboard handling and focus trap. Ports the pattern from sibling app
// stitch-bundles. Presets on the left, calendar on the right.
const RANGE_POPOVER_ID = "royal-date-range-popover";
type DateRange = { from: string; to: string };
type Preset = { id: string; label: string; resolve: () => DateRange };
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function todayUtcDate(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
const RANGE_PRESETS: Preset[] = [
  {
    id: "last7",
    label: "Last 7 days",
    resolve: () => {
      const t = todayUtcDate();
      const f = new Date(t);
      f.setUTCDate(f.getUTCDate() - 6);
      return { from: fmtDate(f), to: fmtDate(t) };
    },
  },
  {
    id: "last30",
    label: "Last 30 days",
    resolve: () => {
      const t = todayUtcDate();
      const f = new Date(t);
      f.setUTCDate(f.getUTCDate() - 29);
      return { from: fmtDate(f), to: fmtDate(t) };
    },
  },
  {
    id: "last90",
    label: "Last 90 days",
    resolve: () => {
      const t = todayUtcDate();
      const f = new Date(t);
      f.setUTCDate(f.getUTCDate() - 89);
      return { from: fmtDate(f), to: fmtDate(t) };
    },
  },
  {
    id: "thisMonth",
    label: "This month",
    resolve: () => {
      const t = todayUtcDate();
      return {
        from: fmtDate(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1))),
        to: fmtDate(t),
      };
    },
  },
  {
    id: "lastMonth",
    label: "Last month",
    resolve: () => {
      const t = todayUtcDate();
      const start = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1));
      const end = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0));
      return { from: fmtDate(start), to: fmtDate(end) };
    },
  },
];
function detectActivePreset(range: DateRange): string | null {
  for (const p of RANGE_PRESETS) {
    const r = p.resolve();
    if (r.from === range.from && r.to === range.to) return p.id;
  }
  return null;
}
function displayRange(from: string, to: string): string {
  const f = new Date(from + "T00:00:00Z");
  const t = new Date(to + "T00:00:00Z");
  const sameYear = f.getUTCFullYear() === t.getUTCFullYear();
  const part = (d: Date, year: boolean) =>
    d.toLocaleDateString(undefined, {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
      ...(year ? { year: "numeric" } : {}),
    });
  if (from === to) return part(f, true);
  return `${part(f, !sameYear)} – ${part(t, true)}`;
}

function DateRangePicker({ value }: { value: DateRange }) {
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState<DateRange>(value);
  const [pickerKey, setPickerKey] = useState(0);
  // Sync the draft when the canonical value changes (e.g. external nav).
  useEffect(() => {
    setDraft(value);
    setPickerKey((k) => k + 1);
  }, [value.from, value.to]);
  const applyRange = (next: DateRange) => {
    const params2 = new URLSearchParams(params);
    params2.set("from", next.from);
    params2.set("to", next.to);
    setParams(params2);
  };
  const attachPicker = (el: HTMLElement | null) => {
    if (!el) return;
    const marked = el as HTMLElement & { __royalAttached?: boolean };
    if (marked.__royalAttached) return;
    marked.__royalAttached = true;
    const read = (e: Event) => {
      const t = e.currentTarget as HTMLElement & { value?: string };
      const v = t.value ?? "";
      const [f, ts] = v.split("--");
      if (!f) return;
      const a = f;
      const b = ts || f;
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      setDraft({ from: lo, to: hi });
    };
    el.addEventListener("input", read);
    el.addEventListener("change", read);
  };
  const activeId = detectActivePreset(value);
  return (
    <>
      {/* @ts-expect-error - s-button custom element */}
      <s-button
        commandFor={RANGE_POPOVER_ID}
        icon="calendar"
        onClick={() => {
          setDraft(value);
          setPickerKey((k) => k + 1);
        }}
      >
        {displayRange(value.from, value.to)}
        {/* @ts-expect-error - s-button custom element */}
      </s-button>
      {/* @ts-expect-error - s-popover custom element */}
      <s-popover id={RANGE_POPOVER_ID} inlineSize="600px">
        {/* @ts-expect-error - s-box custom element */}
        <s-box padding="base">
          {/* @ts-expect-error - s-stack custom element */}
          <s-stack direction="inline" gap="base">
            {/* @ts-expect-error - s-stack custom element */}
            <s-stack direction="block" gap="small-200">
              {RANGE_PRESETS.map((p) => (
                // @ts-expect-error - s-button custom element
                <s-button
                  key={p.id}
                  variant={activeId === p.id ? "primary" : "tertiary"}
                  commandFor={RANGE_POPOVER_ID}
                  command="--hide"
                  onClick={() => applyRange(p.resolve())}
                >
                  {p.label}
                  {/* @ts-expect-error - s-button custom element */}
                </s-button>
              ))}
              {/* @ts-expect-error - s-stack custom element */}
            </s-stack>
            {/* @ts-expect-error - s-stack custom element */}
            <s-stack direction="block" gap="base">
              {/* @ts-expect-error - s-date-picker custom element */}
              <s-date-picker
                key={pickerKey}
                ref={attachPicker}
                type="range"
                defaultValue={`${value.from}--${value.to}`}
                view={value.from.slice(0, 7)}
              />
              {/* @ts-expect-error - s-stack custom element */}
              <s-stack direction="inline" gap="small" justifyContent="end">
                {/* @ts-expect-error - s-button custom element */}
                <s-button commandFor={RANGE_POPOVER_ID} command="--hide">
                  Cancel
                  {/* @ts-expect-error - s-button custom element */}
                </s-button>
                {/* @ts-expect-error - s-button custom element */}
                <s-button
                  variant="primary"
                  commandFor={RANGE_POPOVER_ID}
                  command="--hide"
                  onClick={() => applyRange(draft)}
                >
                  Apply
                  {/* @ts-expect-error - s-button custom element */}
                </s-button>
                {/* @ts-expect-error - s-stack custom element */}
              </s-stack>
              {/* @ts-expect-error - s-stack custom element */}
            </s-stack>
            {/* @ts-expect-error - s-stack custom element */}
          </s-stack>
          {/* @ts-expect-error - s-box custom element */}
        </s-box>
        {/* @ts-expect-error - s-popover custom element */}
      </s-popover>
    </>
  );
}

// Polaris-flavoured sparkline. Pure SVG, no chart lib. Always renders
// (even all-zero data shows a flat baseline) so cards have consistent
// vertical rhythm. Hover state: pointer-tracked dot on the line + small
// tooltip showing the bucket label + value at that x. Tooltip stays in
// HTML overlay so it renders crisp at any svg aspect ratio.
function Sparkline({
  values,
  labels,
  height = 44,
  formatValue,
}: {
  values: number[];
  /** One label per bucket, oldest -> newest. */
  labels?: string[];
  height?: number;
  /** Optional value formatter for the tooltip (e.g. money formatter). */
  formatValue?: (v: number) => string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  if (!values.length) return null;
  const w = 100;
  const h = height;
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = w / (values.length - 1 || 1);
  const pts = values.map((v, i) => {
    const x = i * stepX;
    const y = h - ((v - min) / range) * (h - 8) - 4;
    return { x, y };
  });
  const polyline = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const areaPath =
    `M0,${h} L` +
    pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" L") +
    ` L${w.toFixed(2)},${h} Z`;
  const allZero = values.every((v) => v === 0);
  const stroke = "#202223";
  const fill = "#e1e3e5";

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    let nearest = 0;
    let bestDist = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const d = Math.abs(pts[i].x - xPct);
      if (d < bestDist) {
        bestDist = d;
        nearest = i;
      }
    }
    setHovered(nearest);
  };
  const handleLeave = () => setHovered(null);

  const tipLabel = hovered != null && labels ? labels[hovered] : null;
  const tipValue =
    hovered != null
      ? formatValue
        ? formatValue(values[hovered])
        : values[hovered].toLocaleString()
      : null;

  return (
    <div
      style={{ position: "relative", width: "100%", marginTop: 8 }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
    >
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="trend"
        style={{ width: "100%", height, display: "block" }}
      >
        {allZero ? (
          <line
            x1={0}
            x2={w}
            y1={h - 4}
            y2={h - 4}
            stroke={stroke}
            strokeOpacity={0.2}
            strokeWidth={1.2}
            strokeDasharray="2 2"
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          <>
            <path
              d={areaPath}
              fill={fill}
              opacity={0.55}
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              points={polyline}
              fill="none"
              stroke={stroke}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>
      {hovered != null && pts[hovered] && (
        <>
          {/* Hover dot — HTML-positioned so it stays circular regardless
              of the SVG's non-uniform aspect ratio. */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: `${pts[hovered].x}%`,
              top: `${(pts[hovered].y / h) * 100}%`,
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: stroke,
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
              boxShadow: "0 0 0 1.5px #fff",
            }}
          />
          {/* Tooltip */}
          <div
            role="tooltip"
            style={{
              position: "absolute",
              left: `${pts[hovered].x}%`,
              top: -8,
              transform: "translate(-50%, -100%)",
              background: "#1a1c1d",
              color: "#fff",
              padding: "4px 8px",
              borderRadius: 6,
              fontSize: 11,
              lineHeight: 1.3,
              whiteSpace: "nowrap",
              pointerEvents: "none",
              boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
              zIndex: 1,
            }}
          >
            {tipLabel && (
              <div style={{ color: "#a8acaf", fontSize: 10 }}>{tipLabel}</div>
            )}
            <div style={{ fontWeight: 600 }}>{tipValue}</div>
          </div>
        </>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  delta,
  series,
  seriesLabels,
  formatTooltipValue,
}: {
  label: string;
  value: string;
  delta: number | null;
  series: number[];
  seriesLabels: string[];
  /** Tooltip value formatter (e.g. currency). Falls back to .toLocaleString(). */
  formatTooltipValue?: (v: number) => string;
}) {
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack direction="block" gap="small-200">
        <s-text tone="subdued">{label}</s-text>
        <s-stack direction="inline" gap="small-200" alignItems="baseline">
          <s-heading>{value}</s-heading>
          {delta !== null && <DeltaPill fraction={delta} />}
        </s-stack>
        <Sparkline
          values={series}
          labels={seriesLabels}
          formatValue={formatTooltipValue}
        />
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
