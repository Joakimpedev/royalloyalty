// Analytics — metrics dashboard (empty state for a new store).
// All metrics from analytics.server.ts (ledger-sourced, read-only).
import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getProgramMetrics } from "../lib/analytics.server";
import { useAppNavigate } from "../lib/app-navigate";
import { useMoney } from "../lib/use-money";

async function requireShop(shopDomain: string) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Response("Shop not found", { status: 404 });
  return shop;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const metrics = await getProgramMetrics(shop.id);
  return { metrics };
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <s-stack direction="block" gap="none">
      <s-text tone="subdued">{label}</s-text>
      <s-heading>{value}</s-heading>
    </s-stack>
  );
}

export default function AnalyticsPage() {
  const { metrics: m } = useLoaderData<typeof loader>();
  const nav = useAppNavigate();
  const money = useMoney();

  if (!m.hasActivity) {
    return (
      <s-page heading="Analytics">
        <s-button
          slot="primary-action"
          onClick={() => nav("/app/program")}
        >
          Set up earn rules
        </s-button>
        <s-section heading="No data to report yet">
          <s-stack direction="block" gap="base">
            <s-heading>Your analytics will appear here</s-heading>
            <s-paragraph>
              Once members start earning and redeeming points, you will see
              members, points issued and redeemed, redemption rate, influenced
              revenue, referral performance and a ROI summary on this page.
            </s-paragraph>
            <s-button
              variant="primary"
              onClick={() => nav("/app/program")}
            >
              Configure your program
            </s-button>
          </s-stack>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Analytics">

      <s-section heading="Members & points">
        <s-stack direction="inline" gap="large">
          <Stat label="Total members" value={m.members.total.toLocaleString()} />
          <Stat
            label="New (30d)"
            value={m.members.enrolledLast30d.toLocaleString()}
          />
          <Stat
            label="Points issued"
            value={m.points.issued.toLocaleString()}
          />
          <Stat
            label="Points redeemed"
            value={m.points.redeemed.toLocaleString()}
          />
          <Stat
            label="Outstanding points"
            value={m.points.outstanding.toLocaleString()}
          />
        </s-stack>
      </s-section>

      <s-section heading="Engagement">
        <s-stack direction="inline" gap="large">
          <Stat
            label="Completed redemptions"
            value={m.redemption.total.toLocaleString()}
          />
          <Stat
            label="Redemption rate"
            value={`${(m.redemption.rate * 100).toFixed(1)}%`}
          />
          <Stat
            label="Referrals"
            value={`${m.referrals.completed}/${m.referrals.total}`}
          />
          <Stat
            label="Referral conversion"
            value={`${(m.referrals.conversionRate * 100).toFixed(1)}%`}
          />
        </s-stack>
      </s-section>

      <s-section heading="Revenue & ROI">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" gap="large">
            <Stat
              label="Revenue influenced (estimated)"
              value={money(m.revenueInfluencedEstimated)}
            />
            <Stat
              label="Points liability (value)"
              value={money(m.roi.pointsLiabilityValue)}
            />
            <Stat
              label="Redeemed value"
              value={money(m.roi.redeemedValue)}
            />
            <Stat
              label="ROI ratio"
              value={
                m.roi.ratio === null ? "—" : `${m.roi.ratio.toFixed(2)}x`
              }
            />
          </s-stack>
          <s-paragraph>
            <s-text tone="subdued">
              Revenue influenced is estimated from points earned on orders under
              the active per-dollar rule. Exact order-level reconciliation runs
              as a background job.
            </s-text>
          </s-paragraph>
        </s-stack>
      </s-section>

      {/* Tier distribution section hidden — tier feature exists in the
          backend but is not yet user-facing. Re-enable when tier UX is
          complete. */}
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
