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
import { ChoiceList, PageTitle } from "../lib/polaris-bindings";
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

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
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

  return {
    settings,
    drift,
    ledger: ledger.map((l) => ({
      id: l.id,
      amount: l.amount,
      direction: l.direction,
      reason: l.reason,
      orderId: l.orderId ?? "—",
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

  // Native <ui-save-bar> handles unsaved-changes nav warnings.

  useEffect(() => {
    const el = saveBarRef.current as
      | (HTMLElement & { show?: () => void; hide?: () => void })
      | null;
    if (!el) return;
    if (dirty) el.show?.();
    else el.hide?.();
  }, [dirty]);

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
        title="Store Credit"
        subtitle="Native Shopify store credit issued from the loyalty ledger"
        backHref="/app/program"
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
      {actionData && actionData.ok && (
        <s-section>
          <s-banner tone="success">
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
          <s-text-field
            label="Cashback percent (e.g. 5 for 5%)"
            type="number"
            value={String(form.percent)}
            onChange={(e: { target: { value: string } }) =>
              setForm((f) => ({
                ...f,
                percent: Math.max(
                  0,
                  Math.min(100, Number.parseFloat(e.target.value) || 0),
                ),
              }))
            }
          />
        </s-stack>
      </s-section>

      <s-section heading="Reconciliation">
        <s-stack direction="block" gap="base">
          {drift > 0 ? (
            <s-banner tone="warning" heading="Store credit needs attention">
              <s-paragraph>
                {drift} mirrored transaction(s) are out of sync with Shopify.
                Run reconciliation to repair what can be auto-resolved; the rest
                stay flagged below for manual review.
              </s-paragraph>
            </s-banner>
          ) : (
            <s-paragraph>
              All mirrored store-credit transactions are in sync with Shopify.
            </s-paragraph>
          )}
          <s-button
            onClick={() => submit({ _intent: "reconcile" }, { method: "POST" })}
            {...(saving ? { loading: "" } : {})}
          >
            Run reconciliation now
          </s-button>
        </s-stack>
      </s-section>

      <s-section heading="Store credit ledger">
        {ledger.length === 0 ? (
          <s-stack direction="block" gap="base">
            <s-heading>No store credit activity yet</s-heading>
            <s-paragraph>
              Once cashback is earned or a store-credit reward is redeemed,
              every credit and debit is mirrored here next to its Shopify
              reconciliation status.
            </s-paragraph>
            <s-button
              variant="primary"
              onClick={() =>
                setForm((f) => ({ ...f, enabled: true, percent: f.percent || 5 }))
              }
            >
              Turn on cashback
            </s-button>
          </s-stack>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Date</s-table-header>
              <s-table-header>Direction</s-table-header>
              <s-table-header>Amount</s-table-header>
              <s-table-header>Order</s-table-header>
              <s-table-header>Reason</s-table-header>
              <s-table-header>Sync</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {ledger.map((l) => (
                <s-table-row key={l.id}>
                  <s-table-cell>{l.createdAt}</s-table-cell>
                  <s-table-cell>{l.direction}</s-table-cell>
                  <s-table-cell>{money(l.amount)}</s-table-cell>
                  <s-table-cell>{l.orderId}</s-table-cell>
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
