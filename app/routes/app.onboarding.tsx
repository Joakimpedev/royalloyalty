// Royal Loyalty — onboarding wizard.
//
// 4 stepped screens with a progress bar across the top:
//   1. Welcome + earn rate + signup bonus
//   2. First reward
//   3. Branding (program name, points name, palette, primary/secondary colors)
//   4. Activate — explainer + button to open the theme editor
//
// On Activate we persist Tier/EarnRule/Reward rows, stamp Shop.programActivatedAt
// (TTV), and store the merchant's branding choice into Shop.aiConfigSnapshot.branding
// so /app/branding picks it up. After activation, the loader returns
// activated: true and we redirect through /app/program → /app?welcomed=1.
//
// No AI: every default value comes from app/lib/defaults.ts, currency-scaled
// from a USD baseline using a static FX anchor table. Merchant can edit any
// number on any step.

import { useEffect, useMemo, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useBlocker, useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getDefaultsForCurrency, type ProgramDefaults } from "../lib/defaults";
import { recordActivation } from "../lib/ttv.server";
import { BrandingPalette } from "../components/BrandingPalette";
import ColorPicker from "../components/ColorPicker";
import { WidgetPreview } from "../components/WidgetPreview";
import { AppLink, useAppNavigate } from "../lib/app-navigate";

// ---------------------------------------------------------------------------
// Shape merchant fills in across the wizard
// ---------------------------------------------------------------------------

interface WizardState {
  // Step 1
  unitsPerPoint: number;
  signupPoints: number;
  // Step 2
  firstRewardPoints: number;
  firstRewardValue: number;
  // Step 3
  programName: string;
  pointsName: string;
  primaryColor: string;
  secondaryColor: string;
}

function defaultsToWizard(d: ProgramDefaults): WizardState {
  return {
    unitsPerPoint: d.unitsPerPoint,
    signupPoints: d.signupPoints,
    firstRewardPoints: d.firstRewardPoints,
    firstRewardValue: d.firstRewardValue,
    programName: "Loyalty Rewards",
    pointsName: "Points",
    primaryColor: "#7B2D8E",
    secondaryColor: "#F4E9B8",
  };
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.upsert({
    where: { shopDomain: session.shop },
    update: {},
    create: { shopDomain: session.shop },
    select: {
      id: true,
      currencyCode: true,
      programActivatedAt: true,
      aiConfigSnapshot: true,
    },
  });

  if (shop.programActivatedAt) {
    return {
      activated: true,
      shopDomain: session.shop,
      snapshot: (shop.aiConfigSnapshot as Record<string, unknown>) ?? {},
    } as const;
  }

  const defaults = getDefaultsForCurrency(shop.currencyCode ?? "USD");
  return {
    activated: false,
    shopDomain: session.shop,
    defaults,
  } as const;
};

// ---------------------------------------------------------------------------
// Action — activate (persist) or dismiss checklist
// ---------------------------------------------------------------------------

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    select: { id: true, currencyCode: true, programActivatedAt: true, aiConfigSnapshot: true },
  });
  if (!shop) return { ok: false, error: "Shop not found" };

  if (intent === "dismiss-checklist") {
    const base =
      (shop.aiConfigSnapshot as Record<string, unknown>) ?? {};
    await prisma.shop.update({
      where: { id: shop.id },
      data: {
        aiConfigSnapshot: { ...base, _checklistDismissed: true } as object,
      },
    });
    return { ok: true, dismissed: true };
  }

  if (intent === "activate") {
    if (shop.programActivatedAt) {
      return { ok: false, error: "Program already activated" };
    }
    const payload = form.get("wizard");
    if (typeof payload !== "string") {
      return { ok: false, error: "Missing wizard payload" };
    }
    let w: WizardState;
    try {
      w = JSON.parse(payload);
    } catch {
      return { ok: false, error: "Invalid wizard payload" };
    }

    const defaults = getDefaultsForCurrency(shop.currencyCode ?? "USD");

    // Earn-per-currency-unit. Stored as points-per-dollar; we encode the
    // "1 point per N currency units" by setting points = 1 / unitsPerPoint
    // semantically. The existing earn rule schema is "points awarded for
    // this action, per dollar if perDollar=true", so for the purchase rule
    // we set points = 1 and let the merchant tune unitsPerPoint via the
    // /app/program page later. Bonus actions are flat points (perDollar=false).
    const earnPointsPerUnit = w.unitsPerPoint > 0 ? 1 / w.unitsPerPoint : 1;

    await prisma.$transaction(async (tx) => {
      await tx.tier.deleteMany({ where: { shopId: shop.id } });
      await tx.earnRule.deleteMany({ where: { shopId: shop.id } });
      await tx.reward.deleteMany({ where: { shopId: shop.id } });

      await tx.tier.createMany({
        data: [
          {
            shopId: shop.id,
            name: "Bronze",
            thresholdType: "points",
            threshold: 0,
            earnMultiplier: 1,
            perks: [] as object,
            sortOrder: 0,
          },
          {
            shopId: shop.id,
            name: "Silver",
            thresholdType: "points",
            threshold: defaults.silverThresholdPoints,
            earnMultiplier: defaults.silverEarnMultiplier,
            perks: [] as object,
            sortOrder: 1,
          },
          {
            shopId: shop.id,
            name: "Gold",
            thresholdType: "points",
            threshold: defaults.goldThresholdPoints,
            earnMultiplier: defaults.goldEarnMultiplier,
            perks: [] as object,
            sortOrder: 2,
          },
        ],
      });

      await tx.earnRule.createMany({
        data: [
          {
            shopId: shop.id,
            action: "purchase",
            points: earnPointsPerUnit,
            perDollar: true,
            enabled: true,
            config: { label: "Place an order" } as object,
          },
          {
            shopId: shop.id,
            action: "signup",
            points: w.signupPoints,
            perDollar: false,
            enabled: true,
            config: { label: "Create an account" } as object,
          },
          {
            shopId: shop.id,
            action: "birthday",
            points: defaults.birthdayPoints,
            perDollar: false,
            enabled: true,
            config: { label: "Celebrate a birthday" } as object,
          },
          {
            shopId: shop.id,
            action: "review",
            points: defaults.reviewPoints,
            perDollar: false,
            enabled: false,
            config: { label: "Leave a product review" } as object,
          },
          {
            shopId: shop.id,
            action: "social",
            points: defaults.socialFollowPoints,
            perDollar: false,
            enabled: false,
            config: { label: "Follow on social" } as object,
          },
          {
            shopId: shop.id,
            action: "newsletter",
            points: defaults.newsletterPoints,
            perDollar: false,
            enabled: false,
            config: { label: "Subscribe to newsletter" } as object,
          },
        ],
      });

      await tx.reward.create({
        data: {
          shopId: shop.id,
          type: "amount_off",
          pointsCost: w.firstRewardPoints,
          value: w.firstRewardValue,
          enabled: true,
        },
      });

      const base =
        (shop.aiConfigSnapshot as Record<string, unknown>) ?? {};
      const brandingConfig = {
        widget: {
          position: "bottom-right",
          primaryColor: w.primaryColor,
          secondaryColor: w.secondaryColor,
          icon: "crown",
          launcherText: w.pointsName,
          title: w.programName,
        },
        page: {
          heroTitle: `Earn ${w.pointsName}. Get rewards.`,
          heroSubtitle: "Join the program and earn on every order.",
          themeColor: w.primaryColor,
          logoUrl: "",
          showEarn: true,
          showRewards: true,
          showReferral: true,
        },
        product: {
          enabled: true,
          accentColor: w.primaryColor,
          heading: `Earn {points} ${w.pointsName} with this purchase`,
          subtext: `You have {balance} ${w.pointsName}. Earn {more} more with this order!`,
        },
        cart: {
          enabled: true,
          accentColor: w.primaryColor,
          heading: `Use your ${w.pointsName}`,
          showEarnLine: true,
        },
      };

      await tx.shop.update({
        where: { id: shop.id },
        data: {
          aiConfigSnapshot: {
            ...base,
            branding: brandingConfig,
          } as object,
        },
      });

      await recordActivation(tx, shop.id);
    });

    // Iframe auth: don't server-redirect. Client navigates via useAppNavigate.
    return {
      ok: true,
      activated: true,
      redirectTo: "/app/program?onboarding=1",
    };
  }

  return { ok: false, error: "Unknown intent" };
};

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

const CHECKLIST = [
  {
    key: "klaviyo",
    title: "Connect Klaviyo",
    desc: "Send points, tier and reward events to your email flows.",
    href: "/app/billing",
    cta: "Open integrations",
  },
  {
    key: "pos",
    title: "Enable Point of Sale",
    desc: "Let customers earn and redeem in your physical store.",
    href: "shopify:admin/apps",
    cta: "Open Shopify POS",
  },
  {
    key: "widget",
    title: "Confirm the storefront widget",
    desc: "Enable the Royal Loyalty theme app embed so customers see it.",
    href: "shopify:admin/themes/current/editor?context=apps",
    cta: "Open theme editor",
  },
];

const STEPS = ["Welcome", "First reward", "Branding", "Activate"] as const;

export default function Onboarding() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  if (data.activated) {
    return <PostActivationChecklist />;
  }

  return <Wizard defaults={data.defaults} fetcher={fetcher} />;
}

function Wizard({
  defaults,
  fetcher,
}: {
  defaults: ProgramDefaults;
  fetcher: ReturnType<typeof useFetcher<typeof action>>;
}) {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(() => defaultsToWizard(defaults));
  const [dirty, setDirty] = useState(false);
  const appNav = useAppNavigate();

  const isSaving =
    fetcher.state !== "idle" && fetcher.formData?.get("intent") === "activate";
  const activated =
    isSaving ||
    fetcher.state === "loading" ||
    (fetcher.data && "activated" in fetcher.data && fetcher.data.activated === true);

  useEffect(() => {
    const d = fetcher.data as
      | { ok?: boolean; activated?: boolean; redirectTo?: string }
      | undefined;
    if (d?.ok && d.activated && d.redirectTo) {
      appNav(d.redirectTo);
    }
  }, [fetcher.data, appNav]);

  const blocker = useBlocker(() => dirty && !activated);
  useEffect(() => {
    if (blocker.state === "blocked") {
      const ok = window.confirm(
        "You have unsaved changes to your loyalty program. Leave without activating?",
      );
      if (ok) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty && !activated) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, activated]);

  const mut = <K extends keyof WizardState>(key: K, value: WizardState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
    setDirty(true);
  };

  const activate = () => {
    fetcher.submit(
      { intent: "activate", wizard: JSON.stringify(state) },
      { method: "POST" },
    );
  };

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <s-page heading="Set up your loyalty program">
      <ProgressBar step={step} />

      {step === 0 && (
        <StepWelcome
          state={state}
          mut={mut}
          currencyCode={defaults.currencyCode}
        />
      )}
      {step === 1 && (
        <StepReward
          state={state}
          mut={mut}
          currencyCode={defaults.currencyCode}
        />
      )}
      {step === 2 && <StepBranding state={state} mut={mut} />}
      {step === 3 && (
        <StepActivate
          state={state}
          onActivate={activate}
          isSaving={!!isSaving}
          error={
            fetcher.data && "ok" in fetcher.data && fetcher.data.ok === false
              ? fetcher.data.error ?? "Activation failed"
              : null
          }
        />
      )}

      <WizardNav
        step={step}
        onBack={back}
        onNext={next}
        onActivate={activate}
        isSaving={!!isSaving}
      />
    </s-page>
  );
}

function ProgressBar({ step }: { step: number }) {
  const pct = ((step + 1) / STEPS.length) * 100;
  return (
    <div style={{ margin: "0 0 16px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          color: "#6d7175",
          marginBottom: 6,
        }}
      >
        <span>
          Step {step + 1} of {STEPS.length} — {STEPS[step]}
        </span>
      </div>
      <div
        style={{
          height: 4,
          background: "#e1e3e5",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "#202223",
            transition: "width 200ms ease",
          }}
        />
      </div>
    </div>
  );
}

function WizardNav({
  step,
  onBack,
  onNext,
  onActivate,
  isSaving,
}: {
  step: number;
  onBack: () => void;
  onNext: () => void;
  onActivate: () => void;
  isSaving: boolean;
}) {
  const isLast = step === STEPS.length - 1;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        marginTop: 24,
      }}
    >
      <s-button
        variant="tertiary"
        onClick={onBack}
        {...(step === 0 ? { disabled: true } : {})}
      >
        Back
      </s-button>
      {isLast ? (
        <s-button
          variant="primary"
          onClick={onActivate}
          {...(isSaving ? { loading: true } : {})}
        >
          Activate program
        </s-button>
      ) : (
        <s-button variant="primary" onClick={onNext}>
          Next
        </s-button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Welcome + earn rate + signup
// ---------------------------------------------------------------------------

function StepWelcome({
  state,
  mut,
  currencyCode,
}: {
  state: WizardState;
  mut: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
  currencyCode: string;
}) {
  return (
    <s-section heading="Welcome to Royal Loyalty">
      <s-paragraph>
        Reward your customers for every purchase. We've pre-filled sensible
        defaults — tweak anything, or keep them and click through.
      </s-paragraph>

      <s-stack direction="block" gap="base">
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <s-text fontWeight="bold">How customers earn on every order</s-text>
            <s-stack direction="inline" gap="base">
              <s-number-field
                label={`Spend (${currencyCode}) to earn 1 point`}
                value={String(state.unitsPerPoint)}
                onInput={(e: any) =>
                  mut(
                    "unitsPerPoint",
                    Math.max(1, Number(e.target.value) || 1),
                  )
                }
              />
            </s-stack>
            <s-text tone="subdued">
              Industry standard: ~5% effective cashback when paired with the
              first reward on the next step.
            </s-text>
          </s-stack>
        </s-box>

        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <s-text fontWeight="bold">Signup bonus</s-text>
            <s-number-field
              label="Points awarded when a customer creates an account"
              value={String(state.signupPoints)}
              onInput={(e: any) =>
                mut(
                  "signupPoints",
                  Math.max(0, Math.round(Number(e.target.value) || 0)),
                )
              }
            />
            <s-text tone="subdued">
              A signup bonus equal to your first reward gives customers a
              taste of the program right away.
            </s-text>
          </s-stack>
        </s-box>
      </s-stack>
    </s-section>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — First reward
// ---------------------------------------------------------------------------

function StepReward({
  state,
  mut,
  currencyCode,
}: {
  state: WizardState;
  mut: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
  currencyCode: string;
}) {
  return (
    <s-section heading="Pick a first reward">
      <s-paragraph>
        This is the cheapest reward customers can redeem. You can add more
        rewards later from your Program page.
      </s-paragraph>

      <s-box padding="base" borderWidth="base" borderRadius="base">
        <s-stack direction="block" gap="base">
          <s-text fontWeight="bold">Amount off</s-text>
          <s-stack direction="inline" gap="base">
            <s-number-field
              label="Points cost"
              value={String(state.firstRewardPoints)}
              onInput={(e: any) =>
                mut(
                  "firstRewardPoints",
                  Math.max(1, Math.round(Number(e.target.value) || 1)),
                )
              }
            />
            <s-number-field
              label={`Discount value (${currencyCode})`}
              value={String(state.firstRewardValue)}
              onInput={(e: any) =>
                mut(
                  "firstRewardValue",
                  Math.max(1, Number(e.target.value) || 1),
                )
              }
            />
          </s-stack>
          <s-text tone="subdued">
            With the earn rate from step 1, this is roughly a 5% effective
            cashback when redeemed.
          </s-text>
        </s-stack>
      </s-box>
    </s-section>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Branding
// ---------------------------------------------------------------------------

function StepBranding({
  state,
  mut,
}: {
  state: WizardState;
  mut: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
}) {
  return (
    <s-section heading="Make it yours">
      <s-paragraph>
        These are the basics shoppers will see. You can fine-tune every detail
        later on the Branding page.
      </s-paragraph>

      <s-stack direction="block" gap="base">
        <s-text-field
          label="Program name"
          value={state.programName}
          onInput={(e: any) => mut("programName", e.target.value)}
        />
        <s-text-field
          label="Points name (e.g. Crowns, Coins, Stars)"
          value={state.pointsName}
          onInput={(e: any) => mut("pointsName", e.target.value)}
        />

        <s-text fontWeight="bold">Palette</s-text>
        <s-paragraph>
          Pick a starting palette that fits your brand, or fine-tune the
          colors below.
        </s-paragraph>
        <BrandingPalette
          primary={state.primaryColor}
          secondary={state.secondaryColor}
          onSelect={(preset) => {
            mut("primaryColor", preset.primary);
            mut("secondaryColor", preset.secondary);
          }}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto",
            gap: 24,
            alignItems: "start",
          }}
        >
          <s-stack direction="block" gap="base">
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13, color: "#202223" }}>
                Primary color
              </span>
              <ColorPicker
                value={state.primaryColor}
                label="Primary color"
                onChange={(v) => mut("primaryColor", v)}
              />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: 13, color: "#202223" }}>
                Secondary color
              </span>
              <ColorPicker
                value={state.secondaryColor}
                label="Secondary color"
                onChange={(v) => mut("secondaryColor", v)}
              />
            </div>
          </s-stack>
          <div style={{ position: "sticky", top: 16 }}>
            <s-text tone="subdued">Live preview</s-text>
            <div style={{ marginTop: 8 }}>
              <WidgetPreview
                config={{
                  primaryColor: state.primaryColor,
                  secondaryColor: state.secondaryColor,
                  title: state.programName,
                  subtitle:
                    "Earn points on every order — redeem for rewards.",
                  launcherText: state.pointsName,
                  showEarn: true,
                  showRewards: true,
                  showReferral: true,
                }}
              />
            </div>
          </div>
        </div>
      </s-stack>
    </s-section>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Activate
// ---------------------------------------------------------------------------

function StepActivate({
  state,
  onActivate,
  isSaving,
  error,
}: {
  state: WizardState;
  onActivate: () => void;
  isSaving: boolean;
  error: string | null;
}) {
  return (
    <s-section heading="One step left — activate">
      <s-paragraph>
        Clicking <s-text fontWeight="bold">Activate program</s-text> creates
        your earn rules, rewards and tiers, and turns the loyalty program on
        for your store.
      </s-paragraph>

      <s-box padding="base" borderWidth="base" borderRadius="base">
        <s-stack direction="block" gap="base">
          <s-text fontWeight="bold">After activation</s-text>
          <s-paragraph>
            Your program will be created with the defaults you set. To make
            the loyalty widget visible on your storefront, enable the Royal
            Loyalty theme app embed:
          </s-paragraph>
          <AppLink href="shopify:admin/themes/current/editor?context=apps">
            Open theme editor
          </AppLink>
          <s-text tone="subdued">
            In the theme editor, switch on "Royal Loyalty" under App embeds
            and click Save.
          </s-text>
        </s-stack>
      </s-box>

      <s-box padding="base" borderWidth="base" borderRadius="base">
        <s-stack direction="block" gap="base">
          <s-text fontWeight="bold">Summary</s-text>
          <s-paragraph>
            <s-text fontWeight="bold">{state.programName}</s-text> — customers
            earn 1 {state.pointsName.toLowerCase()} per {state.unitsPerPoint}{" "}
            spent, get {state.signupPoints} {state.pointsName.toLowerCase()}{" "}
            for signing up, and can redeem {state.firstRewardPoints}{" "}
            {state.pointsName.toLowerCase()} for {state.firstRewardValue} off.
          </s-paragraph>
        </s-stack>
      </s-box>

      {error && (
        <s-banner tone="critical">
          <s-paragraph>{error}</s-paragraph>
        </s-banner>
      )}
    </s-section>
  );
}

// ---------------------------------------------------------------------------
// Post-activation checklist (kept from the previous flow)
// ---------------------------------------------------------------------------

function PostActivationChecklist() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const meta =
    data.activated && data.snapshot
      ? ((data.snapshot._checklistDismissed as boolean) ?? false)
      : false;

  const [done, setDone] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(meta);

  const allDone = useMemo(
    () => CHECKLIST.every((c) => done[c.key]),
    [done],
  );

  const dismiss = () => {
    setCollapsed(true);
    fetcher.submit({ intent: "dismiss-checklist" }, { method: "POST" });
  };

  return (
    <s-page heading="Your loyalty program is live">
      <s-section heading="Program activated">
        <s-banner tone="success">
          <s-paragraph>
            Royal Loyalty is now active for your store. Finish these optional
            steps to get the most out of it.
          </s-paragraph>
        </s-banner>
      </s-section>

      <s-section heading="Setup checklist">
        {collapsed ? (
          <s-stack direction="inline" gap="base">
            <s-text>Checklist {allDone ? "complete" : "hidden"}.</s-text>
            <s-button variant="tertiary" onClick={() => setCollapsed(false)}>
              Show checklist
            </s-button>
          </s-stack>
        ) : (
          <s-stack direction="block" gap="base">
            {CHECKLIST.map((c) => (
              <s-box
                key={c.key}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack direction="inline" gap="base">
                  <s-checkbox
                    label={c.title}
                    {...(done[c.key] ? { checked: true } : {})}
                    onChange={(e: any) =>
                      setDone((d) => ({
                        ...d,
                        [c.key]: !!e.target.checked,
                      }))
                    }
                  />
                  <s-text>{c.desc}</s-text>
                  <AppLink href={c.href}>{c.cta}</AppLink>
                </s-stack>
              </s-box>
            ))}
            <s-stack direction="inline" gap="base">
              <s-button onClick={dismiss}>
                {allDone ? "Done — hide checklist" : "Dismiss checklist"}
              </s-button>
              <s-button variant="tertiary" onClick={() => setCollapsed(true)}>
                Collapse
              </s-button>
            </s-stack>
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}

