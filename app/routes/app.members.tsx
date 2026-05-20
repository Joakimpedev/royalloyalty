// Members — Shopify-customers-first list. Shopify Admin GraphQL is the source
// of truth for *who exists*; we only own loyalty state (points, tier, txns).
// This means the list shows the merchant's full customer base on day 1, even
// before anyone has placed an order or otherwise triggered a Member row.
//
// Per-row loyalty data is left-joined from prisma by numeric Shopify customer
// id (Member.shopifyCustomerId is stored without the gid:// prefix — see
// normalizeCustomerId in lib/gdpr.server). Customers with no Member row show
// "Not enrolled" / 0 points.
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
import { normalizeCustomerId } from "../lib/gdpr.server";

const PAGE_SIZE = 50;

const CUSTOMERS_QUERY = `#graphql
  query RoyalLoyaltyCustomers($first: Int!, $after: String, $query: String) {
    customers(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      pageInfo { hasNextPage hasPreviousPage endCursor startCursor }
      nodes {
        id
        displayName
        email
        createdAt
        numberOfOrders
      }
    }
  }
`;

const CUSTOMER_DETAIL_QUERY = `#graphql
  query RoyalLoyaltyCustomerDetail($id: ID!) {
    customer(id: $id) {
      id
      displayName
      email
      phone
      createdAt
      numberOfOrders
      amountSpent { amount currencyCode }
    }
  }
`;

async function requireShop(shopDomain: string) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Response("Shop not found", { status: 404 });
  return shop;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const url = new URL(request.url);
  const memberId = url.searchParams.get("member"); // numeric Shopify customer id
  const after = url.searchParams.get("after");
  const q = url.searchParams.get("q")?.trim() || null;

  const quotaOk = await canAwardLoyalty(shop.id);

  // ---- Detail view ------------------------------------------------------
  if (memberId) {
    const gid = `gid://shopify/Customer/${memberId}`;
    const res = await admin.graphql(CUSTOMER_DETAIL_QUERY, {
      variables: { id: gid },
    });
    const json: any = await res.json();
    const customer = json?.data?.customer;
    if (!customer) {
      return {
        kind: "detail" as const,
        notFound: true as const,
        memberId,
        quotaOk,
      };
    }
    const mem = await prisma.member.findFirst({
      where: { shopId: shop.id, shopifyCustomerId: memberId },
      include: { currentTier: true },
    });
    const memAny: any = mem;
    const txns: any[] = memAny
      ? await prisma.pointTransaction.findMany({
          where: { shopId: shop.id, memberId: memAny.id },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : [];
    const balance = memAny ? await getBalance(shop.id, memAny.id) : 0;
    const redacted = !!memAny?.redactedAt;
    return {
      kind: "detail" as const,
      notFound: false as const,
      quotaOk,
      detail: {
        id: memberId,
        name: redacted ? "[redacted]" : customer.displayName ?? "—",
        email: redacted ? "[redacted]" : customer.email ?? "—",
        phone: redacted ? "[redacted]" : customer.phone ?? null,
        createdAt: customer.createdAt as string,
        numberOfOrders: customer.numberOfOrders ?? 0,
        totalSpent: customer.amountSpent?.amount ?? "0",
        currency: customer.amountSpent?.currencyCode ?? "USD",
        enrolled: !!memAny,
        tier: memAny?.currentTier?.name ?? null,
        balance,
        transactions: txns.map((t: any) => ({
          id: t.id,
          type: t.type,
          points: t.points,
          reason: t.reason,
          createdAt: t.createdAt.toISOString(),
        })),
      },
    };
  }

  // ---- List view --------------------------------------------------------
  const res = await admin.graphql(CUSTOMERS_QUERY, {
    variables: { first: PAGE_SIZE, after, query: q },
  });
  const json: any = await res.json();
  const conn = json?.data?.customers;
  const nodes: any[] = conn?.nodes ?? [];

  const numericIds = nodes
    .map((n) => normalizeCustomerId(n.id))
    .filter((s): s is string => !!s);

  const localMembers: any[] = numericIds.length
    ? await prisma.member.findMany({
        where: { shopId: shop.id, shopifyCustomerId: { in: numericIds } },
        include: { currentTier: true },
      })
    : [];
  const memberByCustomerId = new Map<string, any>(
    localMembers.map((m: any) => [m.shopifyCustomerId, m]),
  );

  // Compute balances only for customers that actually have a Member row.
  const balanceEntries = await Promise.all(
    localMembers.map(
      async (m: any) =>
        [m.shopifyCustomerId, await getBalance(shop.id, m.id)] as const,
    ),
  );
  const balanceByCustomerId = new Map(balanceEntries);

  const rows = nodes.map((n) => {
    const cid = normalizeCustomerId(n.id);
    const mem = cid ? memberByCustomerId.get(cid) : undefined;
    const balance = (cid && balanceByCustomerId.get(cid)) || 0;
    const redacted = !!mem?.redactedAt;
    return {
      id: cid ?? "",
      name: redacted ? "[redacted]" : n.displayName ?? "—",
      email: redacted ? "[redacted]" : n.email ?? "—",
      orders: n.numberOfOrders ?? 0,
      createdAt: n.createdAt as string,
      enrolled: !!mem,
      tier: mem?.currentTier?.name ?? null,
      balance,
    };
  });

  return {
    kind: "list" as const,
    rows,
    pageInfo: {
      hasNextPage: !!conn?.pageInfo?.hasNextPage,
      endCursor: conn?.pageInfo?.endCursor ?? null,
    },
    query: q ?? "",
    quotaOk,
  };
};

export default function MembersPage() {
  const data = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const nav = useAppNavigate();

  if (data.kind === "detail") {
    if (data.notFound) {
      return (
        <s-page heading="Member not found">
          <s-button
            slot="primary-action"
            onClick={() => {
              params.delete("member");
              setParams(params);
            }}
          >
            Back to members
          </s-button>
          <s-section>
            <s-paragraph>
              This customer no longer exists in your Shopify store, or you don't
              have access to view them.
            </s-paragraph>
          </s-section>
        </s-page>
      );
    }
    const { detail, quotaOk } = data;
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
            {detail.phone && (
              <s-text>
                <s-text fontWeight="bold">Phone:</s-text> {detail.phone}
              </s-text>
            )}
            <s-text>
              <s-text fontWeight="bold">Customer since:</s-text>{" "}
              {new Date(detail.createdAt).toLocaleDateString()}
            </s-text>
            <s-text>
              <s-text fontWeight="bold">Orders placed:</s-text>{" "}
              {detail.numberOfOrders}
            </s-text>
            <s-text>
              <s-text fontWeight="bold">Total spent:</s-text>{" "}
              {Number(detail.totalSpent).toLocaleString(undefined, {
                style: "currency",
                currency: detail.currency,
              })}
            </s-text>
            <s-text>
              <s-text fontWeight="bold">Loyalty status:</s-text>{" "}
              {detail.enrolled ? "Enrolled" : "Not yet enrolled"}
            </s-text>
            <s-text>
              <s-text fontWeight="bold">Tier:</s-text>{" "}
              {detail.tier ?? "No tier"}
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
              {detail.enrolled
                ? "No point activity yet for this member."
                : "This customer hasn't earned any points yet. They'll be enrolled automatically when an earn rule fires for them."}
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

  const { rows, pageInfo, query } = data;

  return (
    <s-page heading="Members">
      <s-section heading="All customers">
        {rows.length === 0 ? (
          <s-stack direction="block" gap="base">
            <s-heading>
              {query
                ? "No customers match your search"
                : "No customers in your Shopify store yet"}
            </s-heading>
            <s-paragraph>
              {query
                ? "Try a different name or email."
                : "Customers appear here as soon as they sign up or place an order in your Shopify store. Loyalty state (points, tier) is layered on top automatically."}
            </s-paragraph>
            {!query && (
              <s-button
                variant="primary"
                onClick={() => nav("/app/program")}
              >
                Configure earn rules
              </s-button>
            )}
          </s-stack>
        ) : (
          <>
            <s-table>
              <s-table-header-row>
                <s-table-header>Name</s-table-header>
                <s-table-header>Email</s-table-header>
                <s-table-header>Status</s-table-header>
                <s-table-header>Tier</s-table-header>
                <s-table-header>Points</s-table-header>
                <s-table-header>Orders</s-table-header>
                <s-table-header>Customer since</s-table-header>
                <s-table-header>Actions</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {rows.map((r) => (
                  <s-table-row key={r.id}>
                    <s-table-cell>{r.name}</s-table-cell>
                    <s-table-cell>{r.email}</s-table-cell>
                    <s-table-cell>
                      {r.enrolled ? (
                        <s-badge tone="success">Enrolled</s-badge>
                      ) : (
                        <s-badge>Not enrolled</s-badge>
                      )}
                    </s-table-cell>
                    <s-table-cell>{r.tier ?? "—"}</s-table-cell>
                    <s-table-cell>{r.balance.toLocaleString()}</s-table-cell>
                    <s-table-cell>{r.orders}</s-table-cell>
                    <s-table-cell>
                      {new Date(r.createdAt).toLocaleDateString()}
                    </s-table-cell>
                    <s-table-cell>
                      <s-button
                        onClick={() => {
                          params.set("member", r.id);
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
            {pageInfo.hasNextPage && pageInfo.endCursor && (
              <s-stack direction="inline" gap="base">
                <s-button
                  onClick={() => {
                    params.set("after", pageInfo.endCursor!);
                    setParams(params);
                  }}
                >
                  Next page
                </s-button>
              </s-stack>
            )}
          </>
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
