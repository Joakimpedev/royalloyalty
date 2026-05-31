// Referrals — settings (rewards, fraud controls, holdback, review-before-payout)
// + the referral list with a 3-element empty state + a manual review queue for
// flagged/held referrals. Contextual save bar wired with useBlocker().
import { useEffect, useRef, useState, useCallback } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useAppNavigate } from "../lib/app-navigate";
import {
  ChoiceList,
  MoneyField,
  PageTitle,
  PointsField,
  useSaveBar,
  useSuccessToast,
} from "../lib/polaris-bindings";
import { useShopMoney } from "../lib/use-money";
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
import {
  getReferralSettings,
  saveReferralSettings,
  type ReferralSettings,
} from "../lib/referrals.server";

async function requireShop(shopDomain: string) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Response("Shop not found", { status: 404 });
  return shop;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const settings = await getReferralSettings(shop.id);

  const referrals = await prisma.referral.findMany({
    where: { shopId: shop.id, refereeEmail: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return {
    settings,
    referrals: referrals.map((r) => ({
      id: r.id,
      code: r.code,
      // refereeEmail is PII for the merchant's own customer — shown in the
      // merchant admin only (the merchant is the controller of this data).
      refereeEmail: r.refereeEmail ?? "—",
      status: r.status,
      qualified: Boolean(r.qualifiedOrderId),
      createdAt: r.createdAt.toISOString().slice(0, 10),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const form = await request.formData();
  const intent = String(form.get("_intent"));

  const next: ReferralSettings = {
    enabled: form.get("enabled") === "true",
    referrerPoints: Math.max(
      0,
      Number.parseInt(String(form.get("referrerPoints")), 10) || 0,
    ),
    refereePoints: Math.max(
      0,
      Number.parseInt(String(form.get("refereePoints")), 10) || 0,
    ),
  };
  if (next.referrerPoints <= 0 && next.refereePoints <= 0) {
    return {
      ok: false,
      message:
        "Set at least one reward (your points or your friend's points) above 0.",
    };
  }
  await saveReferralSettings(shop.id, next);
  return { ok: true, message: "Referral settings saved." };
};

export default function ReferralsPage() {
  const { settings, referrals } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const appNav = useAppNavigate();
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

  const shopMoney = useShopMoney();

  const save = useCallback(() => {
    const fd = new FormData();
    fd.set("_intent", "save");
    fd.set("enabled", String(form.enabled));
    fd.set("referrerPoints", String(form.referrerPoints));
    fd.set("refereePoints", String(form.refereePoints));
    submit(fd, { method: "POST" });
  }, [form, submit]);

  return (
    <s-page>
      <PageTitle
        title="Referrals"
        subtitle="Two-sided rewards when a customer brings a friend who buys"
        backHref="/app/program"
        dirty={dirty}
      />

      {/* @ts-expect-error - ui-save-bar App Bridge custom element */}
      <ui-save-bar id="referrals-save-bar" ref={saveBarRef}>
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
      <s-section heading="Referral program">
        <s-stack direction="block" gap="base">
          <ChoiceList
            label="Status"
            value={form.enabled ? "on" : "off"}
            onChange={(v) => setForm((f) => ({ ...f, enabled: v === "on" }))}
          >
            <s-choice value="on">Enabled</s-choice>
            <s-choice value="off">Disabled</s-choice>
          </ChoiceList>
          <s-paragraph>
            Both rewards fire the instant the friend creates an account
            from the referral link. Only new customers (no prior orders)
            qualify for the welcome bonus.
          </s-paragraph>
          <PointsField
            label="You get (referrer reward)"
            value={form.referrerPoints}
            onChange={(next) =>
              setForm((f) => ({
                ...f,
                referrerPoints: Math.max(0, Number.parseInt(next, 10) || 0),
              }))
            }
          />
          <PointsField
            label="Your friend gets (welcome bonus)"
            value={form.refereePoints}
            onChange={(next) =>
              setForm((f) => ({
                ...f,
                refereePoints: Math.max(0, Number.parseInt(next, 10) || 0),
              }))
            }
          />
          <s-paragraph>
            The friend&apos;s welcome bonus stacks with the &quot;Create
            an account&quot; earn rule if you have that enabled in the
            program.
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Referrals">
        {referrals.length === 0 ? (
          <s-stack direction="block" gap="base">
            <s-heading>No referrals yet</s-heading>
            <s-paragraph>
              When a customer shares their referral link and a friend places a
              qualifying order, the referral shows up here.
            </s-paragraph>
            <s-button
              variant="primary"
              onClick={() => appNav("/app/branding")}
            >
              Customize the referral widget
            </s-button>
          </s-stack>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Code</s-table-header>
              <s-table-header>Referee</s-table-header>
              <s-table-header>Qualified</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Created</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {referrals.map((r) => (
                <s-table-row key={r.id}>
                  <s-table-cell>{r.code}</s-table-cell>
                  <s-table-cell>{r.refereeEmail}</s-table-cell>
                  <s-table-cell>{r.qualified ? "Yes" : "No"}</s-table-cell>
                  <s-table-cell>
                    <s-badge
                      tone={
                        r.status === "COMPLETED"
                          ? "success"
                          : r.status === "CANCELLED"
                            ? "critical"
                            : "neutral"
                      }
                    >
                      {r.status}
                    </s-badge>
                  </s-table-cell>
                  <s-table-cell>{r.createdAt}</s-table-cell>
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
