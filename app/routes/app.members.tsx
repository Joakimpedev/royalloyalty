// Members — Shopify-customers-first list with segment tabs (All / Members /
// Excluded) and a right-side slide-over panel for per-customer details.
//
// Shopify Admin GraphQL is the source of truth for *who exists*; we left-join
// loyalty state (points, txns) from prisma by numeric customer id. Clicking a
// row sets ?member=<id> which the loader detects to additionally fetch detail
// data — rendered as a slide-over so the list stays visible underneath.
import { useEffect } from "react";
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

type Segment = "all" | "members" | "excluded";

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

// NOTE: `phone` is Protected Customer Data (Level 2) and requires Shopify
// approval the app does not have — requesting it 500s the loader. Keep this
// query restricted to Level-1 fields until/unless approval is granted.
const CUSTOMER_DETAIL_QUERY = `#graphql
  query RoyalLoyaltyCustomerDetail($id: ID!) {
    customer(id: $id) {
      id
      displayName
      email
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

interface Row {
  id: string;
  name: string;
  email: string;
  orders: number;
  createdAt: string;
  enrolled: boolean;
  balance: number;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const url = new URL(request.url);
  const memberId = url.searchParams.get("member"); // numeric Shopify customer id
  const after = url.searchParams.get("after");
  const q = url.searchParams.get("q")?.trim() || null;
  const segParam = url.searchParams.get("segment");
  const segment: Segment =
    segParam === "members" || segParam === "excluded" ? segParam : "all";

  const quotaOk = await canAwardLoyalty(shop.id);

  // ---- Detail (slide-over) — only when ?member=... is in the URL --------
  let detail: any = null;
  if (memberId) {
    const gid = `gid://shopify/Customer/${memberId}`;
    const res = await admin.graphql(CUSTOMER_DETAIL_QUERY, {
      variables: { id: gid },
    });
    const json: any = await res.json();
    const customer = json?.data?.customer;
    if (customer) {
      const mem: any = await prisma.member.findFirst({
        where: { shopId: shop.id, shopifyCustomerId: memberId },
      });
      const txns: any[] = mem
        ? await prisma.pointTransaction.findMany({
            where: { shopId: shop.id, memberId: mem.id },
            orderBy: { createdAt: "desc" },
            take: 50,
          })
        : [];
      const balance = mem ? await getBalance(shop.id, mem.id) : 0;
      const redacted = !!mem?.redactedAt;
      detail = {
        id: memberId,
        name: redacted ? "[redacted]" : customer.displayName ?? "—",
        email: redacted ? "[redacted]" : customer.email ?? "—",
        createdAt: customer.createdAt as string,
        numberOfOrders: customer.numberOfOrders ?? 0,
        totalSpent: customer.amountSpent?.amount ?? "0",
        currency: customer.amountSpent?.currencyCode ?? "USD",
        enrolled: !!mem,
        balance,
        transactions: txns.map((t: any) => ({
          id: t.id,
          type: t.type,
          points: t.points,
          reason: t.reason,
          createdAt: t.createdAt.toISOString(),
        })),
      };
    } else {
      detail = { notFound: true, id: memberId };
    }
  }

  // ---- List source — depends on segment ---------------------------------
  let rows: Row[] = [];
  let pageInfo: { hasNextPage: boolean; endCursor: string | null } = {
    hasNextPage: false,
    endCursor: null,
  };

  if (segment === "excluded") {
    // No Member.excludedAt column exists yet — this tab is a placeholder.
    rows = [];
  } else if (segment === "members") {
    // Page Member rows from our DB (only customers with loyalty activity), then
    // fetch their Shopify profiles by id in one batch.
    const offset = Number.parseInt(url.searchParams.get("offset") || "0", 10);
    const members: any[] = await prisma.member.findMany({
      where: { shopId: shop.id, redactedAt: null },
      orderBy: { enrolledAt: "desc" },
      take: PAGE_SIZE + 1,
      skip: offset,
    });
    const hasNext = members.length > PAGE_SIZE;
    const pageMembers = members.slice(0, PAGE_SIZE);

    const ids = pageMembers.map((m) => m.shopifyCustomerId);
    let profilesById = new Map<string, any>();
    if (ids.length) {
      const queryStr = ids.map((id) => `id:${id}`).join(" OR ");
      const res = await admin.graphql(CUSTOMERS_QUERY, {
        variables: { first: ids.length, after: null, query: queryStr },
      });
      const json: any = await res.json();
      const nodes: any[] = json?.data?.customers?.nodes ?? [];
      for (const n of nodes) {
        const cid = normalizeCustomerId(n.id);
        if (cid) profilesById.set(cid, n);
      }
    }

    const balanceEntries = await Promise.all(
      pageMembers.map(
        async (m) =>
          [m.shopifyCustomerId, await getBalance(shop.id, m.id)] as const,
      ),
    );
    const balanceById = new Map(balanceEntries);

    rows = pageMembers.map((m) => {
      const profile = profilesById.get(m.shopifyCustomerId);
      const redacted = !!m.redactedAt;
      return {
        id: m.shopifyCustomerId,
        name: redacted
          ? "[redacted]"
          : profile?.displayName ?? m.name ?? "—",
        email: redacted
          ? "[redacted]"
          : profile?.email ?? m.email ?? "—",
        orders: profile?.numberOfOrders ?? 0,
        createdAt:
          (profile?.createdAt as string) ?? m.enrolledAt.toISOString(),
        enrolled: true,
        balance: balanceById.get(m.shopifyCustomerId) ?? 0,
      };
    });
    pageInfo = {
      hasNextPage: hasNext,
      endCursor: hasNext ? String(offset + PAGE_SIZE) : null,
    };
  } else {
    // All customers — paginate Shopify customer base directly.
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
        })
      : [];
    const memberByCustomerId = new Map<string, any>(
      localMembers.map((m: any) => [m.shopifyCustomerId, m]),
    );

    const balanceEntries = await Promise.all(
      localMembers.map(
        async (m: any) =>
          [m.shopifyCustomerId, await getBalance(shop.id, m.id)] as const,
      ),
    );
    const balanceByCustomerId = new Map(balanceEntries);

    rows = nodes.map((n) => {
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
        balance,
      };
    });
    pageInfo = {
      hasNextPage: !!conn?.pageInfo?.hasNextPage,
      endCursor: conn?.pageInfo?.endCursor ?? null,
    };
  }

  return {
    rows,
    pageInfo,
    segment,
    query: q ?? "",
    quotaOk,
    detail,
  };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MembersPage() {
  const { rows, pageInfo, segment, query, quotaOk, detail } =
    useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const nav = useAppNavigate();
  void nav;

  const openDetail = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("member", id);
    setParams(next);
  };
  const closeDetail = () => {
    const next = new URLSearchParams(params);
    next.delete("member");
    setParams(next);
  };
  const switchSegment = (s: Segment) => {
    const next = new URLSearchParams(params);
    if (s === "all") next.delete("segment");
    else next.set("segment", s);
    next.delete("after");
    next.delete("offset");
    next.delete("member");
    setParams(next);
  };

  // ESC closes the slide-over.
  useEffect(() => {
    if (!detail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDetail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  return (
    <s-page heading="Members">
      <s-section>
        {/* Segment tabs */}
        <div
          style={{
            display: "flex",
            gap: 4,
            padding: "4px",
            background: "#f6f6f7",
            borderRadius: 8,
            width: "fit-content",
            marginBottom: 16,
          }}
        >
          {(["all", "members", "excluded"] as Segment[]).map((s) => {
            const active = s === segment;
            return (
              <button
                key={s}
                type="button"
                onClick={() => switchSegment(s)}
                style={{
                  border: "none",
                  background: active ? "#fff" : "transparent",
                  color: active ? "#202223" : "#6d7175",
                  fontWeight: active ? 600 : 500,
                  padding: "6px 14px",
                  borderRadius: 6,
                  fontSize: 13,
                  cursor: "pointer",
                  boxShadow: active
                    ? "0 1px 2px rgba(0,0,0,0.08)"
                    : "none",
                }}
              >
                {s === "all" ? "All" : s === "members" ? "Members" : "Excluded"}
              </button>
            );
          })}
        </div>

        {rows.length === 0 ? (
          <s-stack direction="block" gap="base">
            <s-heading>
              {segment === "excluded"
                ? "No excluded customers"
                : query
                  ? "No customers match your search"
                  : segment === "members"
                    ? "No enrolled members yet"
                    : "No customers in your Shopify store yet"}
            </s-heading>
            <s-paragraph>
              {segment === "excluded"
                ? "Customers excluded from the loyalty program will appear here. (Exclusion management is coming soon.)"
                : query
                  ? "Try a different name or email."
                  : segment === "members"
                    ? "Members appear here once a customer earns or redeems points for the first time."
                    : "Customers appear here as soon as they sign up or place an order in your Shopify store."}
            </s-paragraph>
          </s-stack>
        ) : (
          <>
            <s-table>
              <s-table-header-row>
                <s-table-header>Name</s-table-header>
                <s-table-header>Email</s-table-header>
                <s-table-header>Status</s-table-header>
                <s-table-header>Points</s-table-header>
                <s-table-header>Orders</s-table-header>
                <s-table-header>Customer since</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {rows.map((r) => (
                  <s-table-row
                    key={r.id}
                    {...({
                      onClick: () => openDetail(r.id),
                      style: { cursor: "pointer" },
                    } as any)}
                  >
                    <s-table-cell>{r.name}</s-table-cell>
                    <s-table-cell>{r.email}</s-table-cell>
                    <s-table-cell>
                      {r.enrolled ? (
                        <s-badge tone="success">Enrolled</s-badge>
                      ) : (
                        <s-badge>Not enrolled</s-badge>
                      )}
                    </s-table-cell>
                    <s-table-cell>{r.balance.toLocaleString()}</s-table-cell>
                    <s-table-cell>{r.orders}</s-table-cell>
                    <s-table-cell>
                      {new Date(r.createdAt).toLocaleDateString()}
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
            {pageInfo.hasNextPage && pageInfo.endCursor && (
              <s-stack direction="inline" gap="base">
                <s-button
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    if (segment === "members") {
                      next.set("offset", pageInfo.endCursor!);
                    } else {
                      next.set("after", pageInfo.endCursor!);
                    }
                    setParams(next);
                  }}
                >
                  Next page
                </s-button>
              </s-stack>
            )}
          </>
        )}
      </s-section>

      {detail && (
        <DetailSlideOver
          detail={detail}
          quotaOk={quotaOk}
          onClose={closeDetail}
        />
      )}
    </s-page>
  );
}

// ---------------------------------------------------------------------------
// Slide-over panel
// ---------------------------------------------------------------------------

function DetailSlideOver({
  detail,
  quotaOk,
  onClose,
}: {
  detail: any;
  quotaOk: boolean;
  onClose: () => void;
}) {
  const notFound = detail.notFound === true;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.35)",
          zIndex: 400,
        }}
      />
      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 520,
          maxWidth: "100vw",
          background: "#fff",
          zIndex: 401,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
          overflowY: "auto",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid #e1e3e5",
            flexShrink: 0,
            position: "sticky",
            top: 0,
            background: "#fff",
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "#202223",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              paddingRight: 12,
            }}
          >
            {notFound ? "Customer not found" : detail.name}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 4,
              color: "#6d7175",
              fontSize: 22,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 20 }}>
          {notFound ? (
            <s-paragraph>
              This customer no longer exists in your Shopify store, or you
              don't have access to view them.
            </s-paragraph>
          ) : (
            <s-stack direction="block" gap="large">
              {/* Identity card */}
              <Card>
                <Row label="Email" value={detail.email} />
                <Row
                  label="Customer since"
                  value={new Date(detail.createdAt).toLocaleDateString()}
                />
                <Row label="Orders placed" value={String(detail.numberOfOrders)} />
                <Row
                  label="Total spent"
                  value={Number(detail.totalSpent).toLocaleString(undefined, {
                    style: "currency",
                    currency: detail.currency,
                  })}
                />
              </Card>

              {/* Loyalty KPIs */}
              <KpiStrip
                items={[
                  {
                    label: "Status",
                    valueNode: detail.enrolled ? (
                      <s-badge tone="success">Enrolled</s-badge>
                    ) : (
                      <s-badge>Not enrolled</s-badge>
                    ),
                  },
                  {
                    label: "Points balance",
                    valueNode: (
                      <strong style={{ fontSize: 18 }}>
                        {detail.balance.toLocaleString()}
                      </strong>
                    ),
                  },
                ]}
              />

              <s-stack direction="inline" gap="base">
                <s-button {...(quotaOk ? {} : { disabled: "" })}>
                  Adjust points
                </s-button>
                {!quotaOk && (
                  <s-text tone="subdued">
                    Upgrade to unlock more monthly loyalty volume.
                  </s-text>
                )}
              </s-stack>

              {/* Point history */}
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#202223",
                    marginBottom: 10,
                  }}
                >
                  Point history
                </div>
                {detail.transactions.length === 0 ? (
                  <s-paragraph>
                    {detail.enrolled
                      ? "No point activity yet for this member."
                      : "This customer hasn't earned any points yet. They'll be enrolled automatically when an earn rule fires for them."}
                  </s-paragraph>
                ) : (
                  <div
                    style={{
                      border: "1px solid #e1e3e5",
                      borderRadius: 8,
                      overflow: "hidden",
                    }}
                  >
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr style={{ background: "#fafbfb" }}>
                          {["Date", "Type", "Points", "Reason"].map((h) => (
                            <th
                              key={h}
                              style={{
                                padding: "8px 12px",
                                fontSize: 11,
                                fontWeight: 600,
                                color: "#6d7175",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                textAlign: "left",
                                borderBottom: "1px solid #e1e3e5",
                              }}
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {detail.transactions.map((t: any, i: number) => (
                          <tr
                            key={t.id}
                            style={{
                              borderBottom:
                                i === detail.transactions.length - 1
                                  ? "none"
                                  : "1px solid #f1f2f3",
                            }}
                          >
                            <td style={tdStyle}>
                              {new Date(t.createdAt).toLocaleDateString()}
                            </td>
                            <td style={tdStyle}>{t.type}</td>
                            <td
                              style={{
                                ...tdStyle,
                                color: t.points > 0 ? "#008060" : "#202223",
                                fontWeight: 600,
                              }}
                            >
                              {t.points > 0 ? `+${t.points}` : t.points}
                            </td>
                            <td style={tdStyle}>{t.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </s-stack>
          )}
        </div>
      </div>
    </>
  );
}

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 13,
  color: "#202223",
  verticalAlign: "top",
};

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        border: "1px solid #e1e3e5",
        borderRadius: 10,
        padding: 16,
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        fontSize: 13,
      }}
    >
      <span style={{ color: "#6d7175" }}>{label}</span>
      <span style={{ color: "#202223", fontWeight: 500, textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}

function KpiStrip({
  items,
}: {
  items: Array<{ label: string; valueNode: React.ReactNode }>;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${items.length}, 1fr)`,
        gap: 12,
      }}
    >
      {items.map((it, i) => (
        <div
          key={i}
          style={{
            border: "1px solid #e1e3e5",
            borderRadius: 10,
            padding: "12px 14px",
            background: "#fafbfb",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#6d7175",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              marginBottom: 6,
            }}
          >
            {it.label}
          </div>
          <div>{it.valueNode}</div>
        </div>
      ))}
    </div>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
