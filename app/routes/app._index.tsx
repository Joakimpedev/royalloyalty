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
import { getProgramMetrics } from "../lib/analytics.server";
import { checkAppEmbedEnabled } from "../lib/theme-embed.server";

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

  // Upsert (not findUnique): a freshly installed store has no Shop row yet and
  // nothing else bootstraps it on the home page, so reading-only dead-ended on
  // "Finishing installation" forever. Mirrors the pattern in app.onboarding.tsx.
  const shop = await prisma.shop.upsert({
    where: { shopDomain: session.shop },
    update: {},
    create: { shopDomain: session.shop },
  });

  const [metrics, suggestions, earnRuleRows, tierCount, rewardCount, embed] =
    await Promise.all([
      getProgramMetrics(shop.id),
      prisma.aiSuggestion.findMany({
        where: { shopId: shop.id, status: "open" },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.earnRule.findMany({
        where: { shopId: shop.id },
        select: { action: true, enabled: true },
      }),
      prisma.tier.count({ where: { shopId: shop.id } }),
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
    metrics,
    steps,
    suggestions: suggestions.map((s) => ({
      id: s.id,
      title: s.title,
      body: s.body,
    })),
    tierCount,
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

  const m = data.metrics!;
  const remaining = data.steps.filter((s) => !s.done);
  const allDone = remaining.length === 0;
  const nav = useAppNavigate();

  return (
    <s-page heading="Royal Loyalty">
      <s-button
        slot="primary-action"
        onClick={() => nav("/app/analytics")}
      >
        View analytics
      </s-button>

      <WelcomeCard />

      {/* Setup guide. Each step renders as a card with full detail + CTA
          and a top-right "Mark as done" / "Done" pill. The whole section
          disappears once every step (auto OR manual) is marked done — the
          dashboard then becomes a normal analytics view. */}
      {!allDone && (
        <s-section heading="Setup guide">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              <s-text tone="subdued">
                {data.steps.length - remaining.length} of {data.steps.length} steps complete
              </s-text>
            </s-paragraph>
            <s-stack direction="block" gap="base">
              {data.steps.map((s) => (
                <SetupStepCard key={s.id} step={s} onCta={() => nav(s.href)} />
              ))}
            </s-stack>
          </s-stack>
        </s-section>
      )}

      <s-section heading="Program health">
        {m.hasActivity ? (
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="large">
              <s-stack direction="block" gap="none">
                <s-text tone="subdued">Members</s-text>
                <s-heading>{m.members.total.toLocaleString()}</s-heading>
              </s-stack>
              <s-stack direction="block" gap="none">
                <s-text tone="subdued">Points issued</s-text>
                <s-heading>{m.points.issued.toLocaleString()}</s-heading>
              </s-stack>
              <s-stack direction="block" gap="none">
                <s-text tone="subdued">Points redeemed</s-text>
                <s-heading>{m.points.redeemed.toLocaleString()}</s-heading>
              </s-stack>
              <s-stack direction="block" gap="none">
                <s-text tone="subdued">Redemption rate</s-text>
                <s-heading>
                  {(m.redemption.rate * 100).toFixed(1)}%
                </s-heading>
              </s-stack>
            </s-stack>
          </s-stack>
        ) : (
          <s-stack direction="block" gap="base">
            <s-heading>No program activity yet</s-heading>
            <s-paragraph>
              Once customers start earning and redeeming, their points,
              redemption rate and revenue impact appear here.
            </s-paragraph>
            <s-button
              onClick={() => nav("/app/program")}
              variant="primary"
            >
              Set up earn rules
            </s-button>
          </s-stack>
        )}
      </s-section>

      <s-section slot="aside" heading="AI suggestions">
        {data.suggestions.length === 0 ? (
          <s-paragraph>
            No suggestions right now. Royal reviews your program data
            periodically and surfaces improvement ideas here — you decide
            whether to apply them.
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {data.suggestions.map((s) => (
              <s-box
                key={s.id}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack direction="block" gap="none">
                  <s-text fontWeight="bold">{s.title}</s-text>
                  <s-text tone="subdued">{s.body}</s-text>
                </s-stack>
              </s-box>
            ))}
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

// One row in the Setup guide. Renders title + detail + primary CTA, plus
// a "Mark as done" / "Done" toggle in the top-right. Done state is the OR
// of auto-detection (e.g. embed enabled, rewards exist) and the merchant's
// manual override stored on Shop.aiConfigSnapshot.setupManualDone.
function SetupStepCard({
  step,
  onCta,
}: {
  step: {
    id: string;
    label: string;
    detail: string;
    cta: string;
    autoDone: boolean;
    manuallyDone: boolean;
    done: boolean;
  };
  onCta: () => void;
}) {
  const fetcher = useFetcher();
  const submitting = fetcher.state !== "idle";
  const toggleManual = () => {
    const fd = new FormData();
    fd.set("_intent", "toggle_setup_step");
    fd.set("stepId", step.id);
    fetcher.submit(fd, { method: "POST", action: "/app" });
  };
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack direction="block" gap="base">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <s-stack direction="inline" gap="base" alignItems="center">
            <s-badge tone={step.done ? "success" : "neutral"}>
              {step.done ? "Done" : "To do"}
            </s-badge>
            <s-text fontWeight="bold">{step.label}</s-text>
          </s-stack>
          {/* Manual override toggle. Auto-done steps don't show this — the
              source of truth is the live check (e.g. embed status). Only
              show the toggle for steps that aren't auto-detected as done,
              OR are currently in the manual-done set (so the merchant can
              un-mark a step they marked done by mistake). */}
          {(!step.autoDone || step.manuallyDone) && (
            <button
              type="button"
              onClick={toggleManual}
              disabled={submitting}
              style={{
                background: "transparent",
                border: "1px solid #c9cccf",
                borderRadius: 999,
                padding: "4px 12px",
                fontSize: 12,
                fontWeight: 500,
                cursor: submitting ? "default" : "pointer",
                color: "#202223",
                whiteSpace: "nowrap",
              }}
            >
              {step.manuallyDone ? "Unmark" : "I've done this"}
            </button>
          )}
        </div>
        <s-paragraph>{step.detail}</s-paragraph>
        <div>
          <s-button onClick={onCta} variant={step.done ? undefined : "primary"}>
            {step.cta}
          </s-button>
        </div>
      </s-stack>
    </s-box>
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
