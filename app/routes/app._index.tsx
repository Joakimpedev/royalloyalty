// Home — program health snapshot + onboarding checklist slot + AI suggestions
// slot. All data read from Prisma (no placeholders). Phase 3 fills the AI
// suggestion generation and the activation flow; this page already renders
// whatever rows exist so the slots are real, not shells.
import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useRouteError } from "react-router";
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
      done: earnRuleCount > 0,
      href: "/app/program",
    },
    {
      id: "rewards",
      label: "Add rewards to the catalog",
      done: rewardCount > 0,
      href: "/app/rewards",
    },
    {
      id: "tiers",
      label: "Create VIP tiers",
      done: tierCount > 0,
      href: "/app/tiers",
    },
    {
      id: "activate",
      label: "Activate the program",
      done: Boolean(shop.programActivatedAt),
      href: "/app/program",
    },
  ];

  return {
    shopMissing: false as const,
    metrics,
    checklist,
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

  return (
    <s-page heading="Royal Loyalty">
      <s-button slot="primary-action" href="/app/analytics">
        View analytics
      </s-button>

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

      <s-section slot="aside" heading="Onboarding checklist">
        {remaining.length === 0 ? (
          <s-paragraph>
            Setup complete — your loyalty program is fully configured.
          </s-paragraph>
        ) : (
          <s-stack direction="block" gap="base">
            {data.checklist.map((c) => (
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

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
