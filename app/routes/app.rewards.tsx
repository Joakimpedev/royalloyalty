// Rewards — reward catalog CRUD (form + list with empty state).
// Contextual save bar wired with useBlocker().
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
import { useMoney, useShopMoney } from "../lib/use-money";
import { PageTitle } from "../lib/polaris-bindings";

const REWARD_TYPES = [
  "amount_off",
  "percent_off",
  "free_shipping",
  "free_product",
  "store_credit",
] as const;

async function requireShop(shopDomain: string) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Response("Shop not found", { status: 404 });
  return shop;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const rewards = await prisma.reward.findMany({
    where: { shopId: shop.id },
    orderBy: { pointsCost: "asc" },
  });
  return {
    rewards: rewards.map((r) => ({
      id: r.id,
      type: r.type,
      pointsCost: r.pointsCost,
      value: r.value ?? 0,
      productId: r.productId ?? "",
      enabled: r.enabled,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const form = await request.formData();
  const intent = String(form.get("_intent"));

  if (intent === "delete") {
    await prisma.reward.deleteMany({
      where: { id: String(form.get("id")), shopId: shop.id },
    });
    return { ok: true, message: "Reward deleted." };
  }
  if (intent === "toggle") {
    const id = String(form.get("id"));
    const existing = await prisma.reward.findFirst({
      where: { id, shopId: shop.id },
    });
    if (existing) {
      await prisma.reward.update({
        where: { id },
        data: { enabled: !existing.enabled },
      });
    }
    return { ok: true, message: "Reward updated." };
  }

  const type = String(form.get("type") ?? "");
  const pointsCost = Number.parseInt(String(form.get("pointsCost")), 10);
  const value = Number.parseFloat(String(form.get("value")));
  const productId = String(form.get("productId") ?? "").trim();

  if (!REWARD_TYPES.includes(type as (typeof REWARD_TYPES)[number])) {
    return { ok: false, message: "Select a valid reward type." };
  }
  if (!Number.isFinite(pointsCost) || pointsCost <= 0) {
    return { ok: false, message: "Points cost must be greater than 0." };
  }
  const needsValue = type === "amount_off" || type === "percent_off" || type === "store_credit";
  if (needsValue && (!Number.isFinite(value) || value <= 0)) {
    return {
      ok: false,
      message: "This reward type needs a value greater than 0.",
    };
  }
  if (type === "free_product" && !productId) {
    return {
      ok: false,
      message: "Free product rewards require a product ID (gid://shopify/Product/...).",
    };
  }

  const id = form.get("id") ? String(form.get("id")) : null;
  const data = {
    type,
    pointsCost,
    value: needsValue ? value : null,
    productId: type === "free_product" ? productId : null,
  };
  if (id) {
    await prisma.reward.updateMany({
      where: { id, shopId: shop.id },
      data,
    });
    return { ok: true, message: "Reward updated." };
  }
  await prisma.reward.create({
    data: { shopId: shop.id, enabled: true, ...data },
  });
  return { ok: true, message: "Reward created." };
};

const EMPTY_FORM = {
  id: "",
  type: "amount_off",
  pointsCost: 100,
  value: 5,
  productId: "",
};

export default function RewardsPage() {
  const { rewards } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const appNav = useAppNavigate();
  const money = useMoney();
  const saveBarRef = useRef<HTMLElement | null>(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [baseline, setBaseline] = useState(EMPTY_FORM);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const saving = nav.state === "submitting";

  // Native <ui-save-bar> drives unsaved-changes UI + unmount cleanup.

  useEffect(() => {
    if (actionData?.ok) {
      setForm(EMPTY_FORM);
      setBaseline(EMPTY_FORM);
    }
  }, [actionData]);

  const edit = (r: (typeof rewards)[number]) => {
    const f = {
      id: r.id,
      type: r.type,
      pointsCost: r.pointsCost,
      value: r.value,
      productId: r.productId,
    };
    setForm(f);
    setBaseline(f);
  };

  const save = useCallback(() => {
    const fd = new FormData();
    fd.set("_intent", form.id ? "update" : "create");
    if (form.id) fd.set("id", form.id);
    fd.set("type", form.type);
    fd.set("pointsCost", String(form.pointsCost));
    fd.set("value", String(form.value));
    fd.set("productId", form.productId);
    submit(fd, { method: "POST" });
  }, [form, submit]);

  return (
    <s-page>
      <PageTitle
        title="Rewards"
        subtitle="What customers can redeem points for"
        backHref="/app/program"
        dirty={dirty}
      />

      {/* @ts-expect-error - ui-save-bar App Bridge custom element */}
      <ui-save-bar id="rewards-save-bar" open={dirty ? true : undefined}>
        <button
          slot="save"
          onClick={save}
          {...(saving ? { loading: "" } : {})}
        >
          Save
        </button>
        <button slot="discard" onClick={() => setForm(baseline)}>
          Discard
        </button>
        {/* @ts-expect-error - ui-save-bar custom element */}
      </ui-save-bar>

      {actionData && !actionData.ok && (
        <s-section>
          <s-banner tone="critical" heading="Could not save reward">
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

      <s-section heading={form.id ? "Edit reward" : "New reward"}>
        <s-stack direction="block" gap="base">
          <s-select
            label="Reward type"
            value={form.type}
            onChange={(e: { target: { value: string } }) =>
              setForm((f) => ({ ...f, type: e.target.value }))
            }
          >
            <s-option value="amount_off">Amount off</s-option>
            <s-option value="percent_off">Percent off</s-option>
            <s-option value="free_shipping">Free shipping</s-option>
            <s-option value="free_product">Free product</s-option>
            <s-option value="store_credit">Store credit</s-option>
          </s-select>
          <s-text-field
            label="Points cost"
            type="number"
            value={String(form.pointsCost)}
            onChange={(e: { target: { value: string } }) =>
              setForm((f) => ({
                ...f,
                pointsCost: Math.max(
                  1,
                  Number.parseInt(e.target.value, 10) || 1,
                ),
              }))
            }
          />
          {(form.type === "amount_off" ||
            form.type === "percent_off" ||
            form.type === "store_credit") && (
            <s-text-field
              label={
                form.type === "percent_off"
                  ? "Percent (e.g. 10 for 10%)"
                  : `Value (in your store currency, ${useShopMoney().currencyCode})`
              }
              type="number"
              value={String(form.value)}
              onChange={(e: { target: { value: string } }) =>
                setForm((f) => ({
                  ...f,
                  value: Number.parseFloat(e.target.value) || 0,
                }))
              }
            />
          )}
          {form.type === "free_product" && (
            <s-text-field
              label="Product ID (gid://shopify/Product/...)"
              value={form.productId}
              onChange={(e: { target: { value: string } }) =>
                setForm((f) => ({ ...f, productId: e.target.value }))
              }
            />
          )}
          <s-stack direction="inline" gap="base">
            <s-button
              variant="primary"
              onClick={save}
              {...(saving ? { loading: "" } : {})}
            >
              {form.id ? "Update reward" : "Create reward"}
            </s-button>
            {form.id && (
              <s-button
                onClick={() => {
                  setForm(EMPTY_FORM);
                  setBaseline(EMPTY_FORM);
                }}
              >
                Cancel edit
              </s-button>
            )}
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Reward catalog">
        {rewards.length === 0 ? (
          <s-paragraph>
            <s-text tone="subdued">
              No rewards yet — fill out the form above and click{" "}
              <strong>Create reward</strong> to add your first one.
            </s-text>
          </s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Type</s-table-header>
              <s-table-header>Points</s-table-header>
              <s-table-header>Value</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rewards.map((r) => (
                <s-table-row key={r.id}>
                  <s-table-cell>{r.type}</s-table-cell>
                  <s-table-cell>{r.pointsCost}</s-table-cell>
                  <s-table-cell>
                    {r.type === "free_product"
                      ? r.productId || "—"
                      : r.type === "percent_off"
                        ? r.value
                          ? `${r.value}%`
                          : "—"
                        : r.type === "free_shipping"
                          ? "Free shipping"
                          : r.value !== null && r.value !== undefined
                            ? money(r.value)
                            : "—"}
                  </s-table-cell>
                  <s-table-cell>
                    <s-badge tone={r.enabled ? "success" : "neutral"}>
                      {r.enabled ? "Enabled" : "Disabled"}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="base">
                      <s-button onClick={() => edit(r)}>Edit</s-button>
                      <s-button
                        onClick={() =>
                          submit(
                            { _intent: "toggle", id: r.id },
                            { method: "POST" },
                          )
                        }
                      >
                        {r.enabled ? "Disable" : "Enable"}
                      </s-button>
                      <s-button
                        tone="critical"
                        onClick={() =>
                          submit(
                            { _intent: "delete", id: r.id },
                            { method: "POST" },
                          )
                        }
                      >
                        Delete
                      </s-button>
                    </s-stack>
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
