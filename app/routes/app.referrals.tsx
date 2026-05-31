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
  PageTitle,
  PointsField,
  useSaveBar,
  useSuccessToast,
} from "../lib/polaris-bindings";
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
  payoutReferral,
  type ReferralSettings,
} from "../lib/referrals.server";
import { transitionStatus } from "../lib/status.server";

async function requireShop(shopDomain: string) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Response("Shop not found", { status: 404 });
  return shop;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const settings = await getReferralSettings(shop.id);

  const [referrals, heldForReview] = await Promise.all([
    prisma.referral.findMany({
      where: { shopId: shop.id, refereeEmail: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.referral.findMany({
      where: {
        shopId: shop.id,
        status: "ACTIVE",
        qualifiedOrderId: { not: null },
      },
      orderBy: { statusChangedAt: "asc" },
      take: 50,
    }),
  ]);

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
    heldForReview: heldForReview.map((r) => ({
      id: r.id,
      code: r.code,
      refereeEmail: r.refereeEmail ?? "—",
      since: r.statusChangedAt.toISOString().slice(0, 10),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const form = await request.formData();
  const intent = String(form.get("_intent"));

  if (intent === "approve") {
    const id = String(form.get("id"));
    const res = await payoutReferral({ shopId: shop.id, referralId: id });
    return res.ok
      ? { ok: true, message: "Referral approved and paid out." }
      : { ok: false, message: `Could not pay out: ${res.reason}.` };
  }
  if (intent === "reject") {
    const id = String(form.get("id"));
    try {
      await transitionStatus("referral", id, "CANCELLED");
      return { ok: true, message: "Referral rejected." };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "Could not reject.",
      };
    }
  }

  const refereeType = String(form.get("refereeDiscountType") ?? "percent_off");
  const next: ReferralSettings = {
    enabled: form.get("enabled") === "true",
    referrerPoints: Math.max(
      0,
      Number.parseInt(String(form.get("referrerPoints")), 10) || 0,
    ),
    refereeDiscountType:
      refereeType === "amount_off" ? "amount_off" : "percent_off",
    refereeDiscountValue: Math.max(
      0,
      Number.parseFloat(String(form.get("refereeDiscountValue"))) || 0,
    ),
    reviewBeforePayout: form.get("reviewBeforePayout") === "true",
    holdbackHours: Math.max(
      0,
      Number.parseInt(String(form.get("holdbackHours")), 10) || 0,
    ),
    sameIpBlocks: form.get("sameIpBlocks") === "true",
  };
  if (next.referrerPoints <= 0 && next.refereeDiscountValue <= 0) {
    return {
      ok: false,
      message:
        "Set at least one reward (your points or your friend's discount) above 0.",
    };
  }
  if (
    next.refereeDiscountType === "percent_off" &&
    next.refereeDiscountValue > 100
  ) {
    return {
      ok: false,
      message: "Friend discount can't exceed 100%.",
    };
  }
  await saveReferralSettings(shop.id, next);
  return { ok: true, message: "Referral settings saved." };
};

export default function ReferralsPage() {
  const { settings, referrals, heldForReview } =
    useLoaderData<typeof loader>();
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

  const save = useCallback(() => {
    const fd = new FormData();
    fd.set("_intent", "save");
    fd.set("enabled", String(form.enabled));
    fd.set("referrerPoints", String(form.referrerPoints));
    fd.set("refereeDiscountType", form.refereeDiscountType);
    fd.set("refereeDiscountValue", String(form.refereeDiscountValue));
    fd.set("reviewBeforePayout", String(form.reviewBeforePayout));
    fd.set("holdbackHours", String(form.holdbackHours));
    fd.set("sameIpBlocks", String(form.sameIpBlocks));
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
            When someone uses your customer&apos;s referral link, Shopify
            auto-applies a discount code at checkout. Once their first
            qualifying order is placed, you award the referrer points.
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
          <s-paragraph>
            Points awarded to the referrer after the friend&apos;s first
            qualifying order (subject to the holdback below).
          </s-paragraph>
          <ChoiceList
            label="Your friend gets (referee discount)"
            value={form.refereeDiscountType}
            onChange={(v) =>
              setForm((f) => ({
                ...f,
                refereeDiscountType:
                  v === "amount_off" ? "amount_off" : "percent_off",
              }))
            }
          >
            <s-choice value="percent_off">Percent off</s-choice>
            <s-choice value="amount_off">Amount off</s-choice>
          </ChoiceList>
          <PointsField
            label={
              form.refereeDiscountType === "percent_off"
                ? "Discount percentage"
                : "Discount amount"
            }
            suffix={form.refereeDiscountType === "percent_off" ? "%" : ""}
            value={form.refereeDiscountValue}
            onChange={(next) =>
              setForm((f) => ({
                ...f,
                refereeDiscountValue: Math.max(
                  0,
                  Number.parseFloat(next) || 0,
                ),
              }))
            }
          />
          <s-paragraph>
            Shopify auto-applies this discount when the friend opens the
            referral link. Stacks with other discounts when both allow it.
          </s-paragraph>
        </s-stack>
      </s-section>

      <s-section heading="Fraud &amp; anti-cheat">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Self-referrals (referee email equals the referrer&apos;s) and
            customers who were already members before the referral are always
            blocked automatically.
          </s-paragraph>
          <ChoiceList
            label="Same-IP referrals"
            value={form.sameIpBlocks ? "block" : "flag"}
            onChange={(v) =>
              setForm((f) => ({ ...f, sameIpBlocks: v === "block" }))
            }
          >
            <s-choice value="block">Block automatically</s-choice>
            <s-choice value="flag">Flag for review</s-choice>
          </ChoiceList>
          <ChoiceList
            label="Payout approval"
            value={form.reviewBeforePayout ? "manual" : "auto"}
            onChange={(v) =>
              setForm((f) => ({ ...f, reviewBeforePayout: v === "manual" }))
            }
          >
            <s-choice value="auto">
              Pay out automatically after the holdback window
            </s-choice>
            <s-choice value="manual">
              Require manual approval for every payout
            </s-choice>
          </ChoiceList>
          <PointsField
            label="Post-order holdback"
            suffix="hours"
            value={form.holdbackHours}
            onChange={(next) =>
              setForm((f) => ({
                ...f,
                holdbackHours: Math.max(0, Number.parseInt(next, 10) || 0),
              }))
            }
          />
        </s-stack>
      </s-section>

      <s-section heading="Pending review">
        {heldForReview.length === 0 ? (
          <s-paragraph>
            No referrals are waiting for approval. Flagged or held referrals
            appear here for you to approve or reject before any points are paid
            out.
          </s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Code</s-table-header>
              <s-table-header>Referee</s-table-header>
              <s-table-header>Held since</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {heldForReview.map((r) => (
                <s-table-row key={r.id}>
                  <s-table-cell>{r.code}</s-table-cell>
                  <s-table-cell>{r.refereeEmail}</s-table-cell>
                  <s-table-cell>{r.since}</s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="base">
                      <s-button
                        variant="primary"
                        onClick={() =>
                          submit(
                            { _intent: "approve", id: r.id },
                            { method: "POST" },
                          )
                        }
                      >
                        Approve
                      </s-button>
                      <s-button
                        tone="critical"
                        onClick={() =>
                          submit(
                            { _intent: "reject", id: r.id },
                            { method: "POST" },
                          )
                        }
                      >
                        Reject
                      </s-button>
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>

      <s-section heading="Referrals">
        {referrals.length === 0 ? (
          <s-stack direction="block" gap="base">
            <s-heading>No referrals yet</s-heading>
            <s-paragraph>
              When a customer shares their referral link and a friend places a
              qualifying order, the referral shows up here with its fraud and
              payout status.
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
