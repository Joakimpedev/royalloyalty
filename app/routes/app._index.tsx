// Home — program health snapshot + onboarding checklist slot + AI suggestions
// slot. All data read from Prisma (no placeholders). Phase 3 fills the AI
// suggestion generation and the activation flow; this page already renders
// whatever rows exist so the slots are real, not shells.
import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useRouteError, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getProgramMetrics } from "../lib/analytics.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  // Upsert (not findUnique): a freshly installed store has no Shop row yet and
  // nothing else bootstraps it on the home page, so reading-only dead-ended on
  // "Finishing installation" forever. Mirrors the pattern in app.onboarding.tsx.
  const shop = await prisma.shop.upsert({
    where: { shopDomain: session.shop },
    update: {},
    create: { shopDomain: session.shop },
  });

  const [metrics, suggestions, earnRuleCount, tierCount, rewardCount] =
    await Promise.all([
      getProgramMetrics(shop.id),
      prisma.aiSuggestion.findMany({
        where: { shopId: shop.id, status: "open" },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.earnRule.count({ where: { shopId: shop.id, enabled: true } }),
      prisma.tier.count({ where: { shopId: shop.id } }),
      prisma.reward.count({ where: { shopId: shop.id, enabled: true } }),
    ]);

  const checklist = [
    {
      id: "earn",
      label: "Set up earn rules",
      detail:
        "Decide how many points customers get for placing an order, signing up and other actions. You can tune the numbers any time.",
      cta: "Open earn rules",
      done: earnRuleCount > 0,
      href: "/app/program",
    },
    {
      id: "rewards",
      label: "Add rewards to the catalog",
      detail:
        "Pick what customers can redeem points for — discount codes, free shipping or free products.",
      cta: "Open rewards",
      done: rewardCount > 0,
      href: "/app/rewards",
    },
    {
      id: "tiers",
      label: "Create VIP tiers",
      detail:
        "Reward your best customers with a tier ladder. Each tier can have its own earn multiplier and perks.",
      cta: "Open tiers",
      done: tierCount > 0,
      href: "/app/tiers",
    },
    {
      id: "activate",
      label: "Activate the program",
      detail:
        "Flip the program on so new orders start awarding points to your customers.",
      cta: "Activate program",
      done: Boolean(shop.programActivatedAt),
      href: "/app/program",
    },
    {
      id: "embed",
      label: "Enable the storefront widget",
      detail:
        "In Shopify admin go to Sales channels > Online store > Themes, then Edit theme > App embeds, and turn on the Royal Loyalty widget so shoppers can see it.",
      cta: "Open theme editor",
      done: false,
      href: "shopify:admin/themes/current/editor?context=apps",
    },
  ];

  return {
    shopMissing: false as const,
    metrics,
    checklist,
    checklistCounts: {
      earn: earnRuleCount,
      tiers: tierCount,
      rewards: rewardCount,
    },
    suggestions: suggestions.map((s) => ({
      id: s.id,
      title: s.title,
      body: s.body,
    })),
    programActivated: Boolean(shop.programActivatedAt),
  };
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
  const remaining = data.checklist.filter((c) => !c.done);
  const activeStep = remaining[0];

  return (
    <s-page heading="Royal Loyalty">
      <s-button slot="primary-action" href="/app/analytics">
        View analytics
      </s-button>

      <WelcomeCard />

      {/* Program-status audit card (BON pattern): three concrete signals so the
          merchant can tell at a glance whether the program is actually visible
          to shoppers, with a one-click remediation button on each. */}
      <s-section heading="Program status">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          <StatusTile
            label="Program activation"
            active={data.programActivated}
            activeText="Active"
            inactiveText="Inactive"
            body={
              data.programActivated
                ? "Orders are awarding points to customers."
                : "Activate the program so new orders start awarding points."
            }
            ctaHref="/app/program"
            ctaLabel={data.programActivated ? "Open program" : "Activate program"}
          />
          <StatusTile
            label="Storefront widget"
            active={null}
            activeText="Check in theme"
            inactiveText="Check in theme"
            body="Open the Shopify theme editor and confirm the Royal Loyalty app embed is turned on."
            ctaHref="shopify:admin/themes/current/editor?context=apps"
            ctaLabel="Open theme editor"
          />
          <StatusTile
            label="Earn rules"
            active={null}
            activeText={`${data.checklistCounts.earn} configured`}
            inactiveText={`${data.checklistCounts.earn} configured`}
            body={
              data.checklistCounts.earn > 0
                ? "Earn rules are configured. Tune values or add more on the Program page."
                : "No earn rules yet. Customers won't accumulate points until at least one is enabled."
            }
            ctaHref="/app/program"
            ctaLabel="Open earn rules"
          />
        </div>
      </s-section>

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
            <s-button href="/app/program" variant="primary">
              Set up earn rules
            </s-button>
          </s-stack>
        )}
      </s-section>

      {/* Setup guide (BON pattern): one expanded active step with verbose copy
          and a deeplink button, every other step collapses to a thin row.
          Reduces visual noise; gives the merchant exactly one obvious next
          action. */}
      <s-section heading="Setup guide">
        <s-paragraph>
          {remaining.length === 0
            ? "Setup complete — your loyalty program is fully configured."
            : `${data.checklist.length - remaining.length} of ${data.checklist.length} steps complete`}
        </s-paragraph>
        {activeStep && (
          <s-box
            padding="base"
            borderWidth="base"
            borderRadius="base"
          >
            <s-stack direction="block" gap="base">
              <s-text fontWeight="bold">{activeStep.label}</s-text>
              <s-paragraph>{activeStep.detail}</s-paragraph>
              <s-button href={activeStep.href} variant="primary">
                {activeStep.cta}
              </s-button>
            </s-stack>
          </s-box>
        )}
        <s-stack direction="block" gap="none">
          {data.checklist
            .filter((c) => c.id !== activeStep?.id)
            .map((c) => (
              <s-stack key={c.id} direction="inline" gap="base">
                <s-badge tone={c.done ? "success" : "neutral"}>
                  {c.done ? "Done" : "To do"}
                </s-badge>
                {c.done ? (
                  <s-text>{c.label}</s-text>
                ) : (
                  <s-link href={c.href}>{c.label}</s-link>
                )}
              </s-stack>
            ))}
        </s-stack>
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

// Three-tile audit card on the home page. `active=true` shows a green badge,
// `false` shows a neutral "Inactive" badge, `null` shows an informational
// neutral badge with the activeText label (used when we can't introspect the
// status server-side without a Shopify Admin GraphQL call).
function StatusTile({
  label,
  active,
  activeText,
  inactiveText,
  body,
  ctaHref,
  ctaLabel,
}: {
  label: string;
  active: boolean | null;
  activeText: string;
  inactiveText: string;
  body: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  const badgeTone: "success" | "neutral" | "critical" =
    active === true ? "success" : active === false ? "critical" : "neutral";
  const badgeText = active === false ? inactiveText : activeText;
  // shopify: URLs are intercepted by App Bridge; no target attribute is needed
  // (or correct) — adding target="_top" would force-replace the iframe origin
  // and destroy the embedded session. Same goes for /app/* in-app routes.
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack direction="block" gap="base">
        <s-stack direction="inline" gap="base">
          <s-text fontWeight="bold">{label}</s-text>
          <s-badge tone={badgeTone}>{badgeText}</s-badge>
        </s-stack>
        <s-paragraph>{body}</s-paragraph>
        <s-button href={ctaHref}>{ctaLabel}</s-button>
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
  if (searchParams.get("welcomed") !== "1") return null;
  return (
    <s-section>
      <s-banner tone="success" heading="You're all set up">
        <s-paragraph>
          Your program is activated and your branding is saved. One last thing
          to go live: enable the loyalty widget in your Shopify theme editor.
        </s-paragraph>
        <s-stack direction="inline" gap="base">
          {/* shopify: URL — App Bridge intercepts and navigates the parent
              admin frame while keeping our iframe (and session) alive.
              NO target attribute; adding target="_top" would force-replace
              the iframe origin and destroy auth. */}
          <s-button
            href="shopify:admin/themes/current/editor?context=apps"
            variant="primary"
          >
            Open theme editor
          </s-button>
          <s-button href="/app">Dismiss</s-button>
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
