// Program — earn rules + redemption settings (form page).
// Contextual save bar (ui-save-bar) wired with React Router useBlocker() so
// breadcrumb / link navigation is blocked while there are unsaved edits.
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  useLoaderData,
  useActionData,
  useNavigation,
  useSearchParams,
  useSubmit,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { seedDefaultEarnRules } from "../lib/loyalty.server";
import { useAppNavigate } from "../lib/app-navigate";
import { useSuccessToast } from "../lib/polaris-bindings";
import { useMoney } from "../lib/use-money";

const ACTIONS = [
  "purchase",
  "signup",
  "birthday",
  "newsletter",
  "social",
  "review",
  "anniversary",
] as const;
type ActionName = (typeof ACTIONS)[number];

const LABELS: Record<ActionName, string> = {
  purchase: "Place an order",
  signup: "Create an account",
  birthday: "Celebrate a birthday",
  newsletter: "Subscribe to newsletter",
  social: "Follow on social",
  review: "Leave a product review",
  anniversary: "Account anniversary",
};

async function requireShop(shopDomain: string) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Response("Shop not found", { status: 404 });
  return shop;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);

  const rules = await prisma.earnRule.findMany({
    where: { shopId: shop.id },
  });
  const byAction = new Map(rules.map((r) => [r.action, r]));

  const earnRules = ACTIONS.map((a) => {
    const r = byAction.get(a);
    return {
      action: a,
      points: r?.points ?? (a === "purchase" ? 1 : 50),
      perDollar: r?.perDollar ?? a === "purchase",
      enabled: r?.enabled ?? (a === "purchase" || a === "signup"),
    };
  });

  return {
    earnRules,
    redemption: {
      programActivated: Boolean(shop.programActivatedAt),
    },
  };
};

// Bulk earn-rule saves are gone — each rule is edited at /app/program/earn/:action
// in its own page (Phase 8). The remaining action on this page is the program
// activation toggle.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const form = await request.formData();

  if (form.get("_intent") === "activate") {
    // Activation = merchant consent. Persist the defaults the loader
    // synthesizes as "Active" (Place an order + Create an account) so the
    // storefront and admin always read the same DB-backed truth.
    await prisma.shop.update({
      where: { id: shop.id },
      data: { programActivatedAt: new Date() },
    });
    await seedDefaultEarnRules(shop.id);
    return { ok: true, message: "Program activated." };
  }

  return { ok: false, message: "Unknown action." };
};

export default function ProgramPage() {
  const { earnRules, redemption } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const [searchParams] = useSearchParams();
  // Onboarding redirect-chain marker: the wizard finishes here with
  // ?onboarding=1. Right now the program isn't live yet — the merchant must
  // click the featured Activate CTA below to flip programActivatedAt.
  const inOnboardingChain = searchParams.get("onboarding") === "1";
  const programActivated = redemption.programActivated;

  const rules = earnRules;
  const saving = nav.state === "submitting";
  useSuccessToast(actionData);
  const appNav = useAppNavigate();
  const money = useMoney();

  const activate = () => {
    const fd = new FormData();
    fd.set("_intent", "activate");
    submit(fd, { method: "POST" });
  };

  return (
    <s-page heading="Program">
      {!programActivated && (
        <s-section>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 20,
              padding: "20px 24px",
              borderRadius: 12,
              background:
                "linear-gradient(135deg, #08081A 0%, #0B1228 55%, #131B36 100%)",
              color: "#F7F2E6",
              boxShadow: "0 4px 16px rgba(8, 8, 26, 0.25)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  color: "#F2B821",
                  marginBottom: 6,
                }}
              >
                {inOnboardingChain
                  ? "Last step"
                  : "Your program isn't live yet"}
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  marginBottom: 4,
                }}
              >
                Activate your loyalty program
              </div>
              <div
                style={{
                  fontSize: 13,
                  opacity: 0.8,
                  lineHeight: 1.5,
                  maxWidth: 520,
                }}
              >
                Customers start earning points and redeeming rewards the
                moment you switch it on.
              </div>
            </div>
            <button
              type="button"
              onClick={activate}
              disabled={saving}
              style={{
                appearance: "none",
                border: "none",
                background: "#F2B821",
                color: "#08081A",
                padding: "12px 22px",
                borderRadius: 10,
                fontWeight: 700,
                fontSize: 14,
                cursor: saving ? "not-allowed" : "pointer",
                fontFamily: "inherit",
                flexShrink: 0,
                boxShadow: "0 4px 12px rgba(242, 184, 33, 0.35)",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Activating…" : "Activate program"}
            </button>
          </div>
        </s-section>
      )}

      {programActivated && inOnboardingChain && (
        <s-button
          slot="primary-action"
          onClick={() => appNav("/app?welcomed=1")}
          variant="primary"
        >
          Continue to dashboard
        </s-button>
      )}

      {programActivated && inOnboardingChain && (
        <s-section>
          <s-banner tone="success" heading="Your program is live">
            <s-paragraph>
              Customers can now earn and redeem points on your store. Review the
              earn rules below if you want to tweak them — or continue to your
              dashboard.
            </s-paragraph>
          </s-banner>
        </s-section>
      )}

      {!inOnboardingChain && (
        <s-section heading="Program areas">
          <s-paragraph>
            Earn rules live on this page. Use the cards below to jump to the
            other parts of your program.
          </s-paragraph>
          <ProgramCatalog />
        </s-section>
      )}

      {actionData && !actionData.ok && (
        <s-section>
          <s-banner tone="critical" heading="Could not save">
            <s-paragraph>{actionData.message}</s-paragraph>
          </s-banner>
        </s-section>
      )}
      {/* Earn-rules list (BON-simple). Each row clicks through to the per-rule
          editor at /app/program/earn/:action. No bulk-form editing — one rule
          at a time so the merchant sees its summary in context before saving. */}
      <s-section heading="Earn rules">
        <s-paragraph>
          Click a rule to edit the points awarded and toggle it on or off.
        </s-paragraph>
        <div
          style={{
            border: "1px solid #e3e5e7",
            borderRadius: 8,
            background: "#fff",
            overflow: "hidden",
          }}
        >
          {rules.map((r, i) => (
            <button
              key={r.action}
              type="button"
              onClick={() =>
                appNav(
                  `/app/program/earn/${r.action}${inOnboardingChain ? "?onboarding=1" : ""}`,
                )
              }
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) auto auto",
                gap: 16,
                alignItems: "center",
                padding: "12px 16px",
                borderTop: i === 0 ? "none" : "1px solid #f1f2f3",
                border: 0,
                borderRadius: 0,
                width: "100%",
                textAlign: "left",
                background: "#fff",
                color: "inherit",
                font: "inherit",
                cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 500, color: "#202223" }}>
                {LABELS[r.action]}
              </div>
              <s-badge tone={r.enabled ? "success" : "neutral"}>
                {r.enabled ? "Active" : "Inactive"}
              </s-badge>
              <div style={{ fontSize: 13, color: "#6d7175", minWidth: 90, textAlign: "right" }}>
                {r.points} pts
                {r.action === "purchase" && r.perDollar
                  ? ` / ${money(1)}`
                  : ""}
              </div>
            </button>
          ))}
        </div>
      </s-section>

      <s-section heading="Redemption & activation">
        <s-paragraph>
          Rewards are configured in the Rewards catalog. Activate the program to
          start awarding points on new orders.
        </s-paragraph>
        {redemption.programActivated ? (
          <s-badge tone="success">Program is active</s-badge>
        ) : (
          <s-button
            variant="primary"
            onClick={() =>
              submit({ _intent: "activate" }, { method: "POST" })
            }
            {...(saving ? { loading: "" } : {})}
          >
            Activate program
          </s-button>
        )}
      </s-section>

    </s-page>
  );
}

// Catalog grid that fans out from /app/program to the program-area routes that
// no longer sit in the top-level nav. Plain Polaris-native card grid; no
// illustrations (Essent-style restraint).
function ProgramCatalog() {
  const appNav = useAppNavigate();
  const tiles: { href: string; title: string; description: string }[] = [
    {
      href: "/app/rewards",
      title: "Rewards",
      description:
        "Set how many points customers spend to redeem store credit.",
    },
    {
      href: "/app/referrals",
      title: "Referrals",
      description:
        "Two-sided rewards when a customer brings a friend who buys.",
    },
    {
      href: "/app/tiers",
      title: "VIP tiers",
      description:
        "Promote customers automatically as they earn — each tier multiplies how fast they earn.",
    },
    {
      href: "/app/storecredit",
      title: "Cashback",
      description:
        "Return a percentage of every order as native Shopify store credit.",
    },
    {
      href: "/app/suggestions",
      title: "AI suggestions",
      description:
        "Recommendations Royal generates from your program data — apply or ignore.",
    },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
        gap: 12,
        marginTop: 12,
      }}
    >
      {tiles.map((t) => (
        <button
          key={t.href}
          type="button"
          onClick={() => appNav(t.href)}
          style={{
            display: "block",
            padding: 16,
            border: "1px solid #e3e5e7",
            borderRadius: 8,
            background: "#fff",
            color: "inherit",
            font: "inherit",
            textAlign: "left",
            cursor: "pointer",
            width: "100%",
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{t.title}</div>
          <div style={{ fontSize: 13, color: "#6d7175" }}>{t.description}</div>
        </button>
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
