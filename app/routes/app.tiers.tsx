// VIP Tiers — CRUD (form + list with empty state).
// New/edit form carries a contextual save bar wired with useBlocker().
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
import { PageTitle, useSaveBar, useSuccessToast } from "../lib/polaris-bindings";

async function requireShop(shopDomain: string) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Response("Shop not found", { status: 404 });
  return shop;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const tiers = await prisma.tier.findMany({
    where: { shopId: shop.id },
    orderBy: { sortOrder: "asc" },
  });
  return {
    tiers: tiers.map((t) => ({
      id: t.id,
      name: t.name,
      thresholdType: t.thresholdType,
      threshold: t.threshold,
      earnMultiplier: t.earnMultiplier,
      sortOrder: t.sortOrder,
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const form = await request.formData();
  const intent = String(form.get("_intent"));

  if (intent === "delete") {
    const id = String(form.get("id"));
    await prisma.member.updateMany({
      where: { shopId: shop.id, currentTierId: id },
      data: { currentTierId: null },
    });
    await prisma.tier.deleteMany({ where: { id, shopId: shop.id } });
    return { ok: true, message: "Tier deleted." };
  }

  const name = String(form.get("name") ?? "").trim();
  const thresholdType = String(form.get("thresholdType") ?? "points");
  const threshold = Number.parseInt(String(form.get("threshold")), 10);
  const earnMultiplier = Number.parseFloat(String(form.get("earnMultiplier")));
  const sortOrder = Number.parseInt(String(form.get("sortOrder")), 10) || 0;

  if (!name) {
    return { ok: false, message: "Tier name is required." };
  }
  if (!["points", "spend"].includes(thresholdType)) {
    return { ok: false, message: "Threshold type must be points or spend." };
  }
  if (!Number.isFinite(threshold) || threshold < 0) {
    return { ok: false, message: "Threshold must be a non-negative number." };
  }
  if (!Number.isFinite(earnMultiplier) || earnMultiplier <= 0) {
    return { ok: false, message: "Earn multiplier must be greater than 0." };
  }

  const id = form.get("id") ? String(form.get("id")) : null;
  if (id) {
    await prisma.tier.updateMany({
      where: { id, shopId: shop.id },
      data: { name, thresholdType, threshold, earnMultiplier, sortOrder },
    });
    return { ok: true, message: "Tier updated." };
  }
  await prisma.tier.create({
    data: {
      shopId: shop.id,
      name,
      thresholdType,
      threshold,
      earnMultiplier,
      sortOrder,
    },
  });
  return { ok: true, message: "Tier created." };
};

const EMPTY_FORM = {
  id: "",
  name: "",
  thresholdType: "points",
  threshold: 0,
  earnMultiplier: 1,
  sortOrder: 0,
};

export default function TiersPage() {
  const { tiers } = useLoaderData<typeof loader>();
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

  useSaveBar(saveBarRef, dirty);
  useSuccessToast(actionData as { ok?: boolean; message?: string } | undefined);

  // Reset the form once a successful save completes.
  useEffect(() => {
    if (actionData?.ok) {
      setForm(EMPTY_FORM);
      setBaseline(EMPTY_FORM);
    }
  }, [actionData]);

  const edit = (t: (typeof tiers)[number]) => {
    const f = {
      id: t.id,
      name: t.name,
      thresholdType: t.thresholdType,
      threshold: t.threshold,
      earnMultiplier: t.earnMultiplier,
      sortOrder: t.sortOrder,
    };
    setForm(f);
    setBaseline(f);
  };

  const save = useCallback(() => {
    const fd = new FormData();
    fd.set("_intent", form.id ? "update" : "create");
    if (form.id) fd.set("id", form.id);
    fd.set("name", form.name);
    fd.set("thresholdType", form.thresholdType);
    fd.set("threshold", String(form.threshold));
    fd.set("earnMultiplier", String(form.earnMultiplier));
    fd.set("sortOrder", String(form.sortOrder));
    submit(fd, { method: "POST" });
  }, [form, submit]);

  return (
    <s-page>
      <PageTitle
        title="VIP Tiers"
        subtitle="Reward your best customers with status tiers and earn multipliers"
        backHref="/app/program"
        dirty={dirty}
      />

      {/* @ts-expect-error - ui-save-bar App Bridge custom element */}
      <ui-save-bar id="tiers-save-bar" ref={saveBarRef}>
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
          <s-banner tone="critical" heading="Could not save tier">
            <s-paragraph>{actionData.message}</s-paragraph>
          </s-banner>
        </s-section>
      )}
      <s-section heading={form.id ? "Edit tier" : "New tier"}>
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Tier name"
            value={form.name}
            onChange={(e: { target: { value: string } }) =>
              setForm((f) => ({ ...f, name: e.target.value }))
            }
          />
          <s-select
            label="Threshold type"
            value={form.thresholdType}
            onChange={(e: { target: { value: string } }) =>
              setForm((f) => ({ ...f, thresholdType: e.target.value }))
            }
          >
            <s-option value="points">Points balance</s-option>
            <s-option value="spend">Lifetime earned (spend proxy)</s-option>
          </s-select>
          <s-text-field
            label={
              form.thresholdType === "spend"
                ? `Threshold (lifetime earned, ${useShopMoney().currencyCode})`
                : "Threshold (points)"
            }
            type="number"
            value={String(form.threshold)}
            onChange={(e: { target: { value: string } }) =>
              setForm((f) => ({
                ...f,
                threshold: Math.max(0, Number.parseInt(e.target.value, 10) || 0),
              }))
            }
          />
          <s-text-field
            label="Earn multiplier"
            type="number"
            value={String(form.earnMultiplier)}
            onChange={(e: { target: { value: string } }) =>
              setForm((f) => ({
                ...f,
                earnMultiplier: Number.parseFloat(e.target.value) || 1,
              }))
            }
          />
          <s-text-field
            label="Sort order"
            type="number"
            value={String(form.sortOrder)}
            onChange={(e: { target: { value: string } }) =>
              setForm((f) => ({
                ...f,
                sortOrder: Number.parseInt(e.target.value, 10) || 0,
              }))
            }
          />
          <s-stack direction="inline" gap="base">
            <s-button
              variant="primary"
              onClick={save}
              {...(saving ? { loading: "" } : {})}
            >
              {form.id ? "Update tier" : "Create tier"}
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

      <s-section heading="Tiers">
        {tiers.length === 0 ? (
          <s-stack direction="block" gap="base">
            <s-heading>No VIP tiers yet</s-heading>
            <s-paragraph>
              Tiers reward your most loyal customers with accelerated earning.
              Create your first tier above to start segmenting members.
            </s-paragraph>
            <s-button
              variant="primary"
              onClick={() => {
                setForm(EMPTY_FORM);
                setBaseline(EMPTY_FORM);
              }}
            >
              Create your first tier
            </s-button>
          </s-stack>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Name</s-table-header>
              <s-table-header>Threshold</s-table-header>
              <s-table-header>Multiplier</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {tiers.map((t) => (
                <s-table-row key={t.id}>
                  <s-table-cell>{t.name}</s-table-cell>
                  <s-table-cell>
                    {t.thresholdType === "spend"
                      ? `${money(t.threshold)} spent`
                      : `${t.threshold.toLocaleString()} points`}
                  </s-table-cell>
                  <s-table-cell>{t.earnMultiplier}x</s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="base">
                      <s-button onClick={() => edit(t)}>Edit</s-button>
                      <s-button
                        tone="critical"
                        onClick={() =>
                          submit(
                            { _intent: "delete", id: t.id },
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
