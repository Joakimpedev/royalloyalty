// Members — list + detail (empty state required).
// Detail is shown inline when ?member=<id> is present. Read-only page (no form
// save bar). Volume-gated "Adjust points" action is shown DISABLED with a
// neutral upgrade affordance — never hidden, never fear-framed.
import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useSearchParams, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getBalance } from "../lib/points.server";
import { canAwardLoyalty } from "../lib/quota.server";
import { useAppNavigate } from "../lib/app-navigate";

async function requireShop(shopDomain: string) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Response("Shop not found", { status: 404 });
  return shop;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const url = new URL(request.url);
  const memberId = url.searchParams.get("member");

  const quotaOk = await canAwardLoyalty(shop.id);

  const members = await prisma.member.findMany({
    where: { shopId: shop.id },
    orderBy: { enrolledAt: "desc" },
    take: 100,
    include: { currentTier: true },
  });

  // Compute balances in parallel (bounded to the 100 listed).
  const withBalances = await Promise.all(
    members.map(async (mem) => ({
      id: mem.id,
      name: mem.redactedAt ? "[redacted]" : mem.name ?? "—",
      email: mem.redactedAt ? "[redacted]" : mem.email ?? "—",
      tier: mem.currentTier?.name ?? "No tier",
      enrolledAt: mem.enrolledAt.toISOString(),
      balance: await getBalance(shop.id, mem.id),
    })),
  );

  let detail: null | {
    id: string;
    name: string;
    email: string;
    tier: string;
    balance: number;
    transactions: Array<{
      id: string;
      type: string;
      points: number;
      reason: string;
      createdAt: string;
    }>;
  } = null;

  if (memberId) {
    const mem = await prisma.member.findFirst({
      where: { id: memberId, shopId: shop.id },
      include: { currentTier: true },
    });
    if (mem) {
      const txns = await prisma.pointTransaction.findMany({
        where: { shopId: shop.id, memberId: mem.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      detail = {
        id: mem.id,
        name: mem.redactedAt ? "[redacted]" : mem.name ?? "—",
        email: mem.redactedAt ? "[redacted]" : mem.email ?? "—",
        tier: mem.currentTier?.name ?? "No tier",
        balance: await getBalance(shop.id, mem.id),
        transactions: txns.map((t) => ({
          id: t.id,
          type: t.type,
          points: t.points,
          reason: t.reason,
          createdAt: t.createdAt.toISOString(),
        })),
      };
    }
  }

  return { members: withBalances, detail, quotaOk };
};

export default function MembersPage() {
  const { members, detail, quotaOk } = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const nav = useAppNavigate();

  if (detail) {
    return (
      <s-page heading={`Member · ${detail.name}`}>
        <s-button
          slot="primary-action"
          onClick={() => {
            params.delete("member");
            setParams(params);
          }}
        >
          Back to members
        </s-button>

        <s-section heading="Profile">
          <s-stack direction="block" gap="base">
            <s-text>
              <s-text fontWeight="bold">Email:</s-text> {detail.email}
            </s-text>
            <s-text>
              <s-text fontWeight="bold">Tier:</s-text> {detail.tier}
            </s-text>
            <s-text>
              <s-text fontWeight="bold">Points balance:</s-text>{" "}
              {detail.balance.toLocaleString()}
            </s-text>
            <s-stack direction="inline" gap="base">
              {/* Volume-gated action: shown DISABLED with neutral upgrade copy,
                  never hidden, never fear-framed. */}
              <s-button {...(quotaOk ? {} : { disabled: "" })}>
                Adjust points
              </s-button>
              {!quotaOk && (
                <s-text tone="subdued">
                  Upgrade to unlock more monthly loyalty volume.
                </s-text>
              )}
            </s-stack>
          </s-stack>
        </s-section>

        <s-section heading="Point history">
          {detail.transactions.length === 0 ? (
            <s-paragraph>
              No point activity yet for this member.
            </s-paragraph>
          ) : (
            <s-table>
              <s-table-header-row>
                <s-table-header>Date</s-table-header>
                <s-table-header>Type</s-table-header>
                <s-table-header>Points</s-table-header>
                <s-table-header>Reason</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {detail.transactions.map((t) => (
                  <s-table-row key={t.id}>
                    <s-table-cell>
                      {new Date(t.createdAt).toLocaleDateString()}
                    </s-table-cell>
                    <s-table-cell>{t.type}</s-table-cell>
                    <s-table-cell>
                      {t.points > 0 ? `+${t.points}` : t.points}
                    </s-table-cell>
                    <s-table-cell>{t.reason}</s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
          )}
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Members">
      <s-link slot="breadcrumbActions" href="/app">
        Home
      </s-link>

      <s-section heading="All members">
        {members.length === 0 ? (
          <s-stack direction="block" gap="base">
            <s-heading>No members enrolled yet</s-heading>
            <s-paragraph>
              Customers join automatically when they place their first order or
              sign up. Configure earn rules so their first action awards points.
            </s-paragraph>
            <s-button
              variant="primary"
              onClick={() => nav("/app/program")}
            >
              Configure earn rules
            </s-button>
          </s-stack>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Name</s-table-header>
              <s-table-header>Email</s-table-header>
              <s-table-header>Tier</s-table-header>
              <s-table-header>Balance</s-table-header>
              <s-table-header>Enrolled</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {members.map((mem) => (
                <s-table-row key={mem.id}>
                  <s-table-cell>{mem.name}</s-table-cell>
                  <s-table-cell>{mem.email}</s-table-cell>
                  <s-table-cell>{mem.tier}</s-table-cell>
                  <s-table-cell>
                    {mem.balance.toLocaleString()}
                  </s-table-cell>
                  <s-table-cell>
                    {new Date(mem.enrolledAt).toLocaleDateString()}
                  </s-table-cell>
                  <s-table-cell>
                    <s-button
                      onClick={() => {
                        params.set("member", mem.id);
                        setParams(params);
                      }}
                    >
                      View
                    </s-button>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
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
