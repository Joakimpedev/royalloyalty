// Store Credit — cashback rule config + the mirrored ledger with a 3-element
// empty state + a reconciliation drift panel. Contextual save bar + useBlocker().
import { useEffect, useRef, useState, useCallback } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  useLoaderData,
  useActionData,
  useNavigation,
  useSubmit,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useAppNavigate } from "../lib/app-navigate";
import { useMoney } from "../lib/use-money";
import {
  ChoiceList,
  PageTitle,
  PercentField,
  useSaveBar,
  useSuccessToast,
} from "../lib/polaris-bindings";
import {
  getCashbackSettings,
  saveCashbackSettings,
  type CashbackSettings,
} from "../lib/storecredit.server";
import { reconcileShop, driftCount } from "../lib/reconcile.server";

async function requireShop(shopDomain: string) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Response("Shop not found", { status: 404 });
  return shop;
}

// Batch-fetch order names + customer names from Shopify for the ledger so
// the admin sees human-readable "#1042" / "Arve Nordahl" instead of opaque
// numeric IDs. We do this once per page load with two GraphQL queries (one
// for orders, one for customers) keyed on the unique IDs in the ledger
// page, then merge the results into each row.
const ORDERS_BY_ID_QUERY = `#graphql
  query OrdersByIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Order { id name }
    }
  }`;

const CUSTOMERS_BY_ID_QUERY = `#graphql
  query CustomersByIds($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Customer { id displayName }
    }
  }`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const settings = await getCashbackSettings(shop.id);

  const [ledger, drift] = await Promise.all([
    prisma.storeCreditLedger.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    driftCount(shop.id),
  ]);

  // Collect the unique order + customer IDs we need to resolve. Cap at the
  // page size to keep the GraphQL request small. Missing IDs simply render
  // as the numeric value, so a failed lookup degrades gracefully.
  const orderIds = Array.from(
    new Set(
      ledger
        .map((l) => l.orderId)
        .filter((id): id is string => !!id && /^\d+$/.test(id)),
    ),
  );
  const customerIds = Array.from(
    new Set(ledger.map((l) => l.shopifyCustomerId).filter(Boolean)),
  );

  const orderNameById = new Map<string, string>();
  const customerNameById = new Map<string, string>();

  if (orderIds.length) {
    try {
      const res = await admin.graphql(ORDERS_BY_ID_QUERY, {
        variables: {
          ids: orderIds.map((id) => `gid://shopify/Order/${id}`),
        },
      });
      const json: any = await res.json();
      const nodes: any[] = json?.data?.nodes ?? [];
      for (const n of nodes) {
        if (!n?.id || !n?.name) continue;
        const numericId = String(n.id).split("/").pop()!;
        orderNameById.set(numericId, n.name);
      }
    } catch {
      /* fall back to numeric IDs */
    }
  }
  if (customerIds.length) {
    try {
      const res = await admin.graphql(CUSTOMERS_BY_ID_QUERY, {
        variables: {
          ids: customerIds.map((id) => `gid://shopify/Customer/${id}`),
        },
      });
      const json: any = await res.json();
      const nodes: any[] = json?.data?.nodes ?? [];
      for (const n of nodes) {
        if (!n?.id || !n?.displayName) continue;
        const numericId = String(n.id).split("/").pop()!;
        customerNameById.set(numericId, n.displayName);
      }
    } catch {
      /* fall back to numeric IDs */
    }
  }

  // Strip the trailing "on order <id> [tag]" boilerplate the engine appends
  // to ledger reasons — the Order column already tells the merchant which
  // order, the tag is internal noise. What remains is the human-meaningful
  // bit ("Cashback 5%", "Store credit reward", "Clawback for order ...").
  function cleanReason(raw: string): string {
    return raw
      .replace(/\s+on order\s+\S+/i, "")
      .replace(/\s*\[[^\]]+\]\s*$/, "")
      .trim();
  }

  return {
    settings,
    drift,
    ledger: ledger.map((l) => ({
      id: l.id,
      amount: l.amount,
      direction: l.direction,
      reason: cleanReason(l.reason),
      orderId: l.orderId ?? null,
      orderName: l.orderId ? orderNameById.get(l.orderId) ?? null : null,
      customerId: l.shopifyCustomerId,
      customerName: customerNameById.get(l.shopifyCustomerId) ?? null,
      state: l.reconcileState,
      createdAt: l.createdAt.toISOString().slice(0, 10),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const form = await request.formData();
  const intent = String(form.get("_intent"));

  if (intent === "reconcile") {
    const res = await reconcileShop(shop.id, shop.shopDomain);
    return {
      ok: true,
      message: `Reconciliation run: ${res.pendingResolved} resolved, ${res.driftRepaired} repaired, ${res.driftRemaining} still need attention.`,
    };
  }

  const next: CashbackSettings = {
    enabled: form.get("enabled") === "true",
    percent: Math.max(
      0,
      Math.min(100, Number.parseFloat(String(form.get("percent"))) || 0),
    ),
  };
  if (next.enabled && next.percent <= 0) {
    return {
      ok: false,
      message: "Cashback percent must be greater than 0 when enabled.",
    };
  }
  await saveCashbackSettings(shop.id, next);
  return { ok: true, message: "Cashback settings saved." };
};

export default function StoreCreditPage() {
  const { settings, ledger, drift } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const appNav = useAppNavigate();
  const money = useMoney();
  const saveBarRef = useRef<HTMLElement | null>(null);

  const [form, setForm] = useState(settings);
  const [baseline, setBaseline] = useState(settings);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const saving = nav.state === "submitting";

  useSaveBar(saveBarRef, dirty);
  useSuccessToast(actionData as { ok?: boolean; message?: string } | undefined);

  useEffect(() => {
    if (actionData?.ok) setBaseline(form);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionData]);

  const save = useCallback(() => {
    const fd = new FormData();
    fd.set("_intent", "save");
    fd.set("enabled", String(form.enabled));
    fd.set("percent", String(form.percent));
    submit(fd, { method: "POST" });
  }, [form, submit]);

  return (
    <s-page>
      <PageTitle
        title="Cashback"
        subtitle="Return a percentage of every order as native Shopify store credit"
        backHref="/app/program"
        dirty={dirty}
      />

      {/* @ts-expect-error - ui-save-bar App Bridge custom element */}
      <ui-save-bar id="storecredit-save-bar" ref={saveBarRef}>
        <button
          variant="primary"
          onClick={save}
          {...(saving ? { loading: "" } : {})}
        >
          Save
        </button>
        <button onClick={() => setForm(baseline)}>Discard</button>
        {/* @ts-expect-error - ui-save-bar custom element */}
      </ui-save-bar>

      {actionData && !actionData.ok && (
        <s-section>
          <s-banner tone="critical" heading="Could not save">
            <s-paragraph>{actionData.message}</s-paragraph>
          </s-banner>
        </s-section>
      )}
      <s-section heading="Cashback">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Cashback returns a percentage of every order total to the customer
            as native Shopify store credit. Shopify holds the balance; Royal
            mirrors every transaction here for history and reconciliation.
          </s-paragraph>
          <ChoiceList
            label="Status"
            value={form.enabled ? "on" : "off"}
            onChange={(v) => setForm((f) => ({ ...f, enabled: v === "on" }))}
          >
            <s-choice value="on">Enabled</s-choice>
            <s-choice value="off">Disabled</s-choice>
          </ChoiceList>
          <PercentField
            label="Cashback percent"
            value={form.percent}
            onChange={(next) =>
              setForm((f) => ({
                ...f,
                percent: Math.max(
                  0,
                  Math.min(100, Number.parseFloat(next) || 0),
                ),
              }))
            }
          />
        </s-stack>
      </s-section>

      {/* Reconciliation surface is only useful when there's drift to repair —
          the background cron quietly handles PENDING-row follow-ups every
          tick. Hiding the section in the happy path keeps the page clean
          and removes a meaningless "Run" button. */}
      {drift > 0 && (
        <s-section heading="Reconciliation">
          <s-stack direction="block" gap="base">
            <s-banner tone="warning" heading="Cashback needs attention">
              <s-paragraph>
                {drift} mirrored transaction(s) are out of sync with Shopify.
                Run reconciliation to repair what can be auto-resolved; the rest
                stay flagged below for manual review.
              </s-paragraph>
            </s-banner>
            <s-button
              onClick={() =>
                submit({ _intent: "reconcile" }, { method: "POST" })
              }
              {...(saving ? { loading: "" } : {})}
            >
              Run reconciliation now
            </s-button>
          </s-stack>
        </s-section>
      )}

      <s-section heading="Cashback ledger">
        {ledger.length === 0 ? (
          <s-stack direction="block" gap="base">
            <s-heading>No cashback activity yet</s-heading>
            <s-paragraph>
              Once cashback is earned or a store-credit reward is redeemed,
              every credit and debit is mirrored here next to its Shopify
              reconciliation status.
            </s-paragraph>
          </s-stack>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Order</s-table-header>
              <s-table-header>Date</s-table-header>
              <s-table-header>Customer</s-table-header>
              <s-table-header>Amount</s-table-header>
              <s-table-header>Reason</s-table-header>
              <s-table-header>Sync</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {ledger.map((l) => (
                <s-table-row key={l.id}>
                  <s-table-cell>
                    {l.orderId ? (
                      <a
                        href={`shopify:admin/orders/${l.orderId}`}
                        style={{ color: "#2C6ECB", textDecoration: "none" }}
                      >
                        {l.orderName ?? `…${l.orderId.slice(-9)}`}
                      </a>
                    ) : (
                      "—"
                    )}
                  </s-table-cell>
                  <s-table-cell>{l.createdAt}</s-table-cell>
                  <s-table-cell>
                    {l.customerId ? (
                      <a
                        href={`shopify:admin/customers/${l.customerId}`}
                        style={{ color: "#2C6ECB", textDecoration: "none" }}
                      >
                        {l.customerName ?? `Customer ${l.customerId}`}
                      </a>
                    ) : (
                      "—"
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    <span
                      style={{
                        color: l.direction === "credit" ? "#008060" : "#202223",
                        fontWeight: 600,
                      }}
                    >
                      {l.direction === "credit" ? "+" : "−"}
                      {money(l.amount)}
                    </span>
                  </s-table-cell>
                  <s-table-cell>{l.reason}</s-table-cell>
                  <s-table-cell>
                    <s-badge
                      tone={
                        l.state === "OK" || l.state === "REPAIRED"
                          ? "success"
                          : l.state === "DRIFT"
                            ? "critical"
                            : "neutral"
                      }
                    >
                      {l.state}
                    </s-badge>
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
