// Members — Shopify-customers-first list with segment tabs (All / Members /
// Excluded) and a right-side slide-over panel for per-customer details.
//
// Shopify Admin GraphQL is the source of truth for *who exists*; we left-join
// loyalty state (points, txns) from prisma by numeric customer id. Clicking a
// row sets ?member=<id> which the loader detects to additionally fetch detail
// data — rendered as a slide-over so the list stays visible underneath.
import { useEffect, useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useSearchParams,
  useRouteError,
  useSubmit,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getBalance, recordPointTransaction } from "../lib/points.server";
import { canAwardLoyalty } from "../lib/quota.server";
import { useAppNavigate } from "../lib/app-navigate";
import { normalizeCustomerId } from "../lib/gdpr.server";
import { getStoreCreditAccounts } from "../lib/storecredit.server";
import { useSuccessToast } from "../lib/polaris-bindings";

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

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const form = await request.formData();
  const intent = String(form.get("_intent") ?? "");

  if (intent !== "adjust-points") {
    return { ok: false, message: "Unknown action." };
  }
  const memberCustomerId = String(form.get("memberCustomerId") ?? "");
  const points = Number.parseInt(String(form.get("points") ?? ""), 10);
  const reason = String(form.get("reason") ?? "").trim();

  if (!memberCustomerId) {
    return { ok: false, message: "Missing customer id." };
  }
  if (!Number.isFinite(points) || points === 0) {
    return { ok: false, message: "Enter a non-zero number of points." };
  }
  if (!reason) {
    return { ok: false, message: "Reason is required." };
  }

  // Member row is lazy — created on first earn. If the merchant is adjusting
  // points for a customer who hasn't transacted yet, enroll them now so the
  // ADJUST row has a valid memberId. Same shape awardForAction uses on first
  // award.
  const mem = await prisma.member.upsert({
    where: {
      shopId_shopifyCustomerId: {
        shopId: shop.id,
        shopifyCustomerId: memberCustomerId,
      },
    },
    update: {},
    create: {
      shopId: shop.id,
      shopifyCustomerId: memberCustomerId,
      enrolledAt: new Date(),
    },
  });
  if (mem.redactedAt) {
    return {
      ok: false,
      message: "This member's data has been redacted; cannot adjust.",
    };
  }

  await recordPointTransaction({
    shopId: shop.id,
    memberId: mem.id,
    type: "ADJUST",
    points,
    reason: `Manual adjustment: ${reason}`,
  });

  return {
    ok: true,
    message:
      points > 0 ? `Added ${points} points.` : `Deducted ${-points} points.`,
  };
};

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

      // Store credit / cashback — sum the live Shopify account balance(s) for
      // this customer, plus the last N mirrored ledger rows for activity.
      // Both can throw (missing scope, dead token); on failure we fall back
      // to "no info" rather than crashing the whole slide-over.
      let storeCreditBalance = 0;
      let storeCreditCurrency = "USD";
      try {
        const accounts = await getStoreCreditAccounts(
          admin.graphql,
          memberId,
        );
        storeCreditBalance = accounts.reduce((s, a) => s + a.amount, 0);
        storeCreditCurrency = accounts[0]?.currencyCode ?? "USD";
      } catch {
        /* no-op — section just won't show a balance */
      }
      const storeCreditLedger: any[] = await prisma.storeCreditLedger.findMany({
        where: { shopId: shop.id, shopifyCustomerId: memberId },
        orderBy: { createdAt: "desc" },
        take: 25,
      });

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
        storeCredit: {
          balance: storeCreditBalance,
          currency: storeCreditCurrency,
          ledger: storeCreditLedger.map((l) => ({
            id: l.id,
            amount: l.amount,
            direction: l.direction,
            reason: l.reason,
            reconcileState: l.reconcileState,
            createdAt: l.createdAt.toISOString(),
          })),
        },
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
  const navigation = useNavigation();
  const nav = useAppNavigate();
  void nav;

  // Detect whether the user just clicked a row and we're waiting on the
  // loader to bring the next ?member=... detail back. The slide-over mounts
  // immediately on click with a skeleton; the real content swaps in when
  // detail arrives. Without this, the user sees nothing happen for ~500ms
  // after clicking, which feels broken.
  const pendingMemberId = (() => {
    if (navigation.state !== "loading" || !navigation.location) return null;
    const next = new URLSearchParams(navigation.location.search);
    return next.get("member");
  })();
  const showOverlay = Boolean(detail) || Boolean(pendingMemberId);
  const detailLoading = !detail && Boolean(pendingMemberId);

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
        {/* Segment tabs — Polaris chip/filter style (no native s-tabs exists) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
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
                  border: active ? "1px solid #919eab" : "1px solid transparent",
                  background: active ? "#ffffff" : "transparent",
                  color: active ? "#202223" : "#6d7175",
                  fontWeight: active ? 500 : 400,
                  padding: "3px 10px",
                  borderRadius: 4,
                  fontSize: 13,
                  lineHeight: "20px",
                  cursor: "pointer",
                  outline: "none",
                  font: "inherit",
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
                      "data-clickable": "",
                      style: { cursor: "pointer" },
                    } as any)}
                  >
                    <s-table-cell>{r.name}</s-table-cell>
                    <s-table-cell>{r.email}</s-table-cell>
                    <s-table-cell>
                      {/* Every Shopify customer is implicitly a member of the
                          loyalty program — the local Member row is created
                          lazily on first earn. "Excluded" (when implemented)
                          will be the only non-Member state. */}
                      <s-badge tone="success">Member</s-badge>
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

      {showOverlay && (
        <DetailSlideOver
          detail={detail}
          loading={detailLoading}
          quotaOk={quotaOk}
          onClose={closeDetail}
        />
      )}

      {/* Row hover affordance — without this, the table looks static and the
          merchant has no signal the rows are clickable. Targets every row
          inside this page so it only applies on the members list. */}
      <style>{`
        s-table-row {
          transition: background 0.12s ease;
        }
        s-table-row[data-clickable]:hover {
          background: #f6f6f7 !important;
          cursor: pointer;
        }
      `}</style>
    </s-page>
  );
}

// ---------------------------------------------------------------------------
// Slide-over panel
// ---------------------------------------------------------------------------

function DetailSlideOver({
  detail,
  loading,
  quotaOk,
  onClose,
}: {
  detail: any | null;
  loading: boolean;
  quotaOk: boolean;
  onClose: () => void;
}) {
  const notFound = detail?.notFound === true;

  // Slide-in animation — start off-screen on first render then flip on the
  // next frame so the transition has something to interpolate to. Closing
  // is handled by the parent unmounting; we don't try to animate out (would
  // need an exit-tracking state machine for marginal payoff).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

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
          opacity: mounted ? 1 : 0,
          transition: "opacity 0.22s ease",
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
          width: 640,
          maxWidth: "100vw",
          background: "#fff",
          zIndex: 401,
          display: "flex",
          flexDirection: "column",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
          overflowY: "auto",
          transform: mounted ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.26s cubic-bezier(0.32, 0.72, 0, 1)",
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
            {notFound
              ? "Customer not found"
              : detail
                ? detail.name
                : "Loading…"}
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
          ) : loading || !detail ? (
            <DetailSkeleton />
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
                    valueNode: <s-badge tone="success">Member</s-badge>,
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

              <AdjustPointsForm
                memberCustomerId={detail.id}
                quotaOk={quotaOk}
              />

              {/* Store credit / cashback — only render when the merchant has
                  either issued any credit OR Shopify shows a live balance.
                  Pre-cashback merchants get a clean slide-over. */}
              {detail.storeCredit &&
                (detail.storeCredit.balance > 0 ||
                  detail.storeCredit.ledger.length > 0) && (
                  <StoreCreditSection sc={detail.storeCredit} />
                )}

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
                      : "This customer hasn't earned any points yet. Points will appear here as soon as an earn rule fires for them."}
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

function StoreCreditSection({
  sc,
}: {
  sc: {
    balance: number;
    currency: string;
    ledger: Array<{
      id: string;
      amount: number;
      direction: string;
      reason: string;
      reconcileState: string;
      createdAt: string;
    }>;
  };
}) {
  const money = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: sc.currency });
  return (
    <div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "#202223",
          marginBottom: 10,
        }}
      >
        Store credit / cashback
      </div>
      <div
        style={{
          border: "1px solid #e1e3e5",
          borderRadius: 10,
          padding: 16,
          background: "#fff",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
          }}
        >
          <span style={{ fontSize: 12, color: "#6d7175" }}>
            Live Shopify balance
          </span>
          <strong style={{ fontSize: 16 }}>{money(sc.balance)}</strong>
        </div>
        {sc.ledger.length === 0 ? (
          <s-paragraph>No cashback activity yet.</s-paragraph>
        ) : (
          <div style={{ borderTop: "1px solid #f1f2f3" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                tableLayout: "fixed",
              }}
            >
              <colgroup>
                <col style={{ width: "22%" }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "36%" }} />
                <col style={{ width: "20%" }} />
              </colgroup>
              <thead>
                <tr style={{ background: "#fafbfb" }}>
                  {["Date", "Amount", "Reason", "Sync"].map((h) => (
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
                {sc.ledger.map((l, i) => (
                  <tr
                    key={l.id}
                    style={{
                      borderBottom:
                        i === sc.ledger.length - 1
                          ? "none"
                          : "1px solid #f1f2f3",
                    }}
                  >
                    <td style={tdStyle}>
                      {new Date(l.createdAt).toLocaleDateString()}
                    </td>
                    <td
                      style={{
                        ...tdStyle,
                        color: l.direction === "credit" ? "#008060" : "#202223",
                        fontWeight: 600,
                      }}
                    >
                      {l.direction === "credit" ? "+" : "−"}
                      {money(l.amount)}
                    </td>
                    <td style={tdStyle}>
                      {l.reason
                        .replace(/\s+on order\s+\S+/i, "")
                        .replace(/\s*\[[^\]]+\]\s*$/, "")
                        .trim()}
                    </td>
                    <td style={tdStyle}>
                      <s-badge
                        tone={
                          l.reconcileState === "OK" ||
                          l.reconcileState === "REPAIRED"
                            ? "success"
                            : l.reconcileState === "DRIFT"
                              ? "critical"
                              : "neutral"
                        }
                      >
                        {l.reconcileState}
                      </s-badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Adjust Points — manual ±N credit/debit on a member, recorded as ADJUST in
// the ledger. Form-state is collapsed by default so the slide-over doesn't
// look cluttered; clicking the button reveals the two inputs. Submit
// re-runs the loader so the points history + balance refresh in place.
function AdjustPointsForm({
  memberCustomerId,
  quotaOk,
}: {
  memberCustomerId: string;
  quotaOk: boolean;
}) {
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const nav = useNavigation();
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const submitting = nav.state === "submitting";

  useSuccessToast(actionData);

  // Collapse the form again after a successful submit and clear the inputs
  // so the merchant can adjust another value without re-typing.
  useEffect(() => {
    if (actionData?.ok) {
      setOpen(false);
      setPoints("");
      setReason("");
    }
  }, [actionData?.ok]);

  if (!open) {
    return (
      <s-stack direction="inline" gap="base">
        <s-button
          onClick={() => setOpen(true)}
          {...(quotaOk ? {} : { disabled: "" })}
        >
          Adjust points
        </s-button>
        {!quotaOk && (
          <s-text tone="subdued">
            Upgrade to unlock more monthly loyalty volume.
          </s-text>
        )}
      </s-stack>
    );
  }

  const numericPoints = Number.parseInt(points, 10);
  const valid =
    Number.isFinite(numericPoints) && numericPoints !== 0 && reason.trim();

  return (
    <div
      style={{
        border: "1px solid #e1e3e5",
        borderRadius: 10,
        padding: 16,
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: "#202223" }}>
        Adjust points
      </div>
      <s-text-field
        label="Points (negative to deduct)"
        type="number"
        value={points}
        onChange={(e: { target: { value: string } }) =>
          setPoints(e.target.value)
        }
      />
      <s-text-field
        label="Reason"
        value={reason}
        onChange={(e: { target: { value: string } }) =>
          setReason(e.target.value)
        }
      />
      {actionData && !actionData.ok && (
        <s-banner tone="critical">
          <s-paragraph>{actionData.message}</s-paragraph>
        </s-banner>
      )}
      <s-stack direction="inline" gap="base">
        <s-button
          variant="primary"
          onClick={() => {
            const fd = new FormData();
            fd.set("_intent", "adjust-points");
            fd.set("memberCustomerId", memberCustomerId);
            fd.set("points", String(numericPoints));
            fd.set("reason", reason.trim());
            submit(fd, { method: "POST" });
          }}
          {...(valid && !submitting ? {} : { disabled: "" })}
          {...(submitting ? { loading: "" } : {})}
        >
          Apply adjustment
        </s-button>
        <s-button onClick={() => setOpen(false)}>Cancel</s-button>
      </s-stack>
    </div>
  );
}

// Skeleton blocks rendered while the loader is fetching detail. Stylistically
// matches the real layout (identity card → KPI strip → button row → history
// table) so the layout doesn't jump when content arrives.
function DetailSkeleton() {
  return (
    <s-stack direction="block" gap="large">
      <SkBlock height={160} />
      <SkBlock height={80} />
      <SkBlock height={36} width={140} />
      <SkBlock height={220} />
      <style>{`
        @keyframes royal-skeleton-pulse {
          0% { opacity: 0.55; }
          50% { opacity: 0.9; }
          100% { opacity: 0.55; }
        }
      `}</style>
    </s-stack>
  );
}

function SkBlock({ height, width }: { height: number; width?: number }) {
  return (
    <div
      aria-hidden="true"
      style={{
        height,
        width: width ?? "100%",
        borderRadius: 8,
        background:
          "linear-gradient(90deg, #f1f2f3 0%, #e6e7e8 50%, #f1f2f3 100%)",
        animation: "royal-skeleton-pulse 1.4s ease-in-out infinite",
      }}
    />
  );
}

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
