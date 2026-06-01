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
import { BrandingPalette } from "../components/BrandingPalette";
import ColorPicker from "../components/ColorPicker";
import { WidgetPreview } from "../components/WidgetPreview";
import LocalePicker from "../components/LocalePicker";
import { AppLink, useAppNavigate } from "../lib/app-navigate";
import {
  DEFAULT_LOCALE,
  type LocaleCode,
} from "../lib/localization-locales";
import { getDefault } from "../lib/localization-defaults";

// ---------------------------------------------------------------------------
// Shape merchant fills in across the wizard
// ---------------------------------------------------------------------------

interface WizardState {
  // Step 1
  earnPoints: number;
  earnPerCurrency: number;
  signupPoints: number;
  // Step 2
  firstRewardPoints: number;
  firstRewardValue: number;
  // Step 3
  programName: string;
  pointsName: string;
  primaryColor: string;
  secondaryColor: string;
  defaultLocale: LocaleCode;
}

function defaultsToWizard(d: ProgramDefaults): WizardState {
  return {
    earnPoints: d.earnPoints,
    earnPerCurrency: d.earnPerCurrency,
    signupPoints: d.signupPoints,
    firstRewardPoints: d.firstRewardPoints,
    firstRewardValue: d.firstRewardValue,
    programName: localizedProgramName(DEFAULT_LOCALE),
    pointsName: localizedPointsName(DEFAULT_LOCALE),
    primaryColor: "#2C2A29",
    secondaryColor: "#F0EBE3",
    defaultLocale: DEFAULT_LOCALE,
  };
}

/** Localized default for the program-name field. Falls back to "Loyalty
 *  Rewards" if the locale's bundle is missing the key. */
function localizedProgramName(locale: LocaleCode): string {
  const t = getDefault(locale, "launcher.title");
  return t && t.trim() ? t : "Loyalty Rewards";
}

/** Localized default for the points-name field. Derived from the
 *  account.pointsSuffix string (" points" → "Points"). */
function localizedPointsName(locale: LocaleCode): string {
  const raw = getDefault(locale, "account.pointsSuffix");
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "Points";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
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

  // "Activated" here means "onboarding wizard has been finished" — NOT
  // "program is live" (that's the merchant's job on /app/program). We mark
  // wizard completion with aiConfigSnapshot._onboardingFinishedAt; the
  // existing programActivatedAt flag still counts so legacy shops that
  // activated under the previous flow still see the checklist.
  const snapshot =
    (shop.aiConfigSnapshot as Record<string, unknown> | null) ?? {};
  const onboardingFinished =
    Boolean(snapshot._onboardingFinishedAt) || Boolean(shop.programActivatedAt);

  if (onboardingFinished) {
    return {
      activated: true,
      shopDomain: session.shop,
      snapshot,
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
    // "activate" here = finish the onboarding wizard. It does NOT flip the
    // program live (programActivatedAt) — that's the merchant's deliberate
    // act on /app/program. We just persist the wizard's picks and mark the
    // wizard as done.
    const finishedAt =
      ((shop.aiConfigSnapshot as Record<string, unknown> | null) ?? {})
        ._onboardingFinishedAt;
    if (finishedAt) {
      return { ok: false, error: "Onboarding already finished" };
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

    // Earn rule stored as points-per-currency-unit. The wizard collects two
    // numbers — "X points / per Y currency" — and persists their ratio.
    const earnPointsPerUnit =
      w.earnPerCurrency > 0 ? w.earnPoints / w.earnPerCurrency : 1;

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

      const existingLocalization =
        (base.localization as Record<string, unknown> | undefined) ?? {};
      await tx.shop.update({
        where: { id: shop.id },
        data: {
          aiConfigSnapshot: {
            ...base,
            branding: brandingConfig,
            localization: {
              ...existingLocalization,
              defaultLocale: w.defaultLocale,
              overrides:
                (existingLocalization.overrides as object | undefined) ?? {},
            },
            _onboardingFinishedAt: new Date().toISOString(),
          } as object,
        },
      });
    });

    // Iframe auth: don't server-redirect. Client navigates via useAppNavigate.
    // Land on /app/program with ?onboarding=1 so that page shows the big
    // "Activate program" CTA banner the merchant will click to flip live.
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

const STEPS = ["Welcome", "Earn", "First reward", "Branding", "Activate"] as const;

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
  // When the merchant types in the name fields we stop auto-overwriting them
  // on language change. Until then, switching language updates both fields
  // to the new locale's baked default.
  const [programNameTouched, setProgramNameTouched] = useState(false);
  const [pointsNameTouched, setPointsNameTouched] = useState(false);
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
    setState((s) => {
      const next = { ...s, [key]: value };
      // Picking a new language re-seeds the name fields if the merchant
      // hasn't customized them yet — so the live preview's localized labels
      // and the typed-in name stay in sync.
      if (key === "defaultLocale") {
        const locale = value as LocaleCode;
        if (!programNameTouched) next.programName = localizedProgramName(locale);
        if (!pointsNameTouched) next.pointsName = localizedPointsName(locale);
      }
      return next;
    });
    setDirty(true);
  };

  const setProgramName = (v: string) => {
    setProgramNameTouched(true);
    setState((s) => ({ ...s, programName: v }));
    setDirty(true);
  };
  const setPointsName = (v: string) => {
    setPointsNameTouched(true);
    setState((s) => ({ ...s, pointsName: v }));
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
    <s-page>
      <ProgressBar step={step} />

      <div
        style={{
          maxWidth: step === 0 || step === 3 ? 1040 : 640,
          margin: "0 auto",
          padding: "24px 16px 16px",
          transition: "max-width 200ms ease",
        }}
      >
        {step === 0 && <StepIntro />}
        {step === 1 && (
          <StepWelcome
            state={state}
            mut={mut}
            currencyCode={defaults.currencyCode}
          />
        )}
        {step === 2 && (
          <StepReward
            state={state}
            mut={mut}
            currencyCode={defaults.currencyCode}
          />
        )}
        {step === 3 && (
          <StepBranding
            state={state}
            mut={mut}
            setProgramName={setProgramName}
            setPointsName={setPointsName}
          />
        )}
        {step === 4 && (
          <StepActivate
            isSaving={!!isSaving}
            error={
              fetcher.data && "ok" in fetcher.data && fetcher.data.ok === false
                ? fetcher.data.error ?? "Could not save your setup"
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
      </div>
    </s-page>
  );
}

// Royal brand palette — pulled from research/listing-mockups (hero.html).
// Navy gradient for darks, gold for accents on light cards, cream as
// off-white. We use these on the WIZARD CHROME (progress bar +
// illustration) so the merchant immediately reads "Royal Loyalty brand",
// while the live preview keeps using the merchant's chosen storefront
// colors.
const ROYAL = {
  navyDarker: "#08081A",
  navyDeep: "#0B1228",
  navy: "#131B36",
  navyMid: "#1B2547",
  gold: "#F2B821",
  goldSoft: "#FFD86B",
  cream: "#F7F2E6",
} as const;

function ProgressBar({ step }: { step: number }) {
  const pct = ((step + 1) / STEPS.length) * 100;
  return (
    <div
      style={{
        padding: "12px 20px 14px",
        background: `linear-gradient(135deg, ${ROYAL.navyDarker} 0%, ${ROYAL.navyDeep} 60%, ${ROYAL.navy} 100%)`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          fontWeight: 500,
          color: ROYAL.cream,
          marginBottom: 8,
          letterSpacing: 0.2,
        }}
      >
        <span style={{ opacity: 0.7 }}>
          Step {step + 1} of {STEPS.length}
        </span>
        <span>{STEPS[step]}</span>
      </div>
      <div
        style={{
          height: 4,
          background: "rgba(255,255,255,0.12)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: "#ffffff",
            transition: "width 240ms ease",
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
  const navBtn = (
    label: string,
    onClick: () => void,
    variant: "primary" | "ghost",
    disabled = false,
    loading = false,
  ) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        appearance: "none",
        border: variant === "primary" ? "none" : "1px solid #c9cccf",
        background: variant === "primary" ? "#1a1c1f" : "#fff",
        color: variant === "primary" ? "#fff" : "#1a1c1f",
        fontFamily: "inherit",
        fontSize: 14,
        fontWeight: 600,
        padding: "9px 18px",
        borderRadius: 8,
        cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {loading ? "Saving…" : label}
    </button>
  );
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        marginTop: 32,
      }}
    >
      {navBtn("Back", onBack, "ghost", step === 0)}
      {isLast
        ? navBtn("Finish setup", onActivate, "primary", false, isSaving)
        : navBtn("Next", onNext, "primary")}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Visual primitives — kept in this file so each step reads top-to-bottom.
// ---------------------------------------------------------------------------

function StepTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div style={{ textAlign: "center", margin: "8px 0 28px" }}>
      <h1
        style={{
          fontSize: 28,
          lineHeight: 1.2,
          fontWeight: 700,
          color: "#1a1c1f",
          margin: "0 0 8px",
        }}
      >
        {title}
      </h1>
      {subtitle && (
        <p
          style={{
            fontSize: 14,
            color: "#6d7175",
            margin: 0,
          }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}

function Card({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e3e5e7",
        borderRadius: 12,
        padding: "20px 22px",
        marginBottom: 16,
        boxShadow: "0 1px 0 rgba(22, 29, 37, 0.04)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 8,
            background: "#f1f2f3",
            color: "#5c5f62",
          }}
        >
          {icon}
        </span>
        <span style={{ fontSize: 15, fontWeight: 600, color: "#1a1c1f" }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: 0.4,
        color: "#6d7175",
        margin: "0 4px 10px",
      }}
    >
      {children}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 13,
        color: "#5c5f62",
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

/** Compact numeric input with an in-field suffix (e.g. "points" or a currency
 *  code). Width is fixed so two of these sit side-by-side without taking the
 *  whole card width. */
function SuffixNumber({
  value,
  onChange,
  suffix,
  min = 1,
  step = 1,
  width = 160,
}: {
  value: number;
  onChange: (v: number) => void;
  suffix: string;
  min?: number;
  step?: number;
  width?: number;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "stretch",
        width,
        border: "1px solid #c9cccf",
        borderRadius: 8,
        background: "#fff",
        overflow: "hidden",
      }}
    >
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.max(min, n));
        }}
        style={{
          flex: 1,
          minWidth: 0,
          border: "none",
          outline: "none",
          padding: "8px 8px 8px 12px",
          fontSize: 14,
          fontFamily: "inherit",
          color: "#1a1c1f",
          background: "transparent",
        }}
      />
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "0 12px",
          background: "#fafbfb",
          borderLeft: "1px solid #e3e5e7",
          fontSize: 13,
          color: "#5c5f62",
        }}
      >
        {suffix}
      </span>
    </div>
  );
}

// Inline SVG icon set — Polaris-style stroke, 18px, currentColor.
const ICONS: Record<string, React.ReactNode> = {
  bag: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 7h12l-1 13H7L6 7Z" />
      <path d="M9 7V5a3 3 0 0 1 6 0v2" />
    </svg>
  ),
  userPlus: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10" cy="8" r="4" />
      <path d="M3 21a7 7 0 0 1 14 0" />
      <path d="M19 8v6M16 11h6" />
    </svg>
  ),
  gift: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M5 12v9h14v-9M12 8v13" />
      <path d="M12 8c-3 0-4-1.5-4-3a2 2 0 0 1 4 0v3ZM12 8c3 0 4-1.5 4-3a2 2 0 0 0-4 0v3Z" />
    </svg>
  ),
  palette: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2s-1-1.5-1-2.5 1-1.5 2-1.5h2a4 4 0 0 0 4-4 9 9 0 0 0-9-8Z" />
      <circle cx="7.5" cy="10.5" r="1.2" />
      <circle cx="11" cy="7" r="1.2" />
      <circle cx="15.5" cy="8.5" r="1.2" />
    </svg>
  ),
  type: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7V5h16v2M12 5v14M9 19h6" />
    </svg>
  ),
  rocket: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 4c4 0 6 2 6 6-3 0-5 1-7 3l-4 4-3-3 4-4c2-2 3-4 4-6Z" />
      <path d="M9 15l-3-3M6 18l-2 2M9 18l-2 2M6 15l-2 2" />
    </svg>
  ),
  store: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9l1-4h14l1 4M4 9v11h16V9M4 9h16" />
      <path d="M9 20v-6h6v6" />
    </svg>
  ),
  globe: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </svg>
  ),
};

// ---------------------------------------------------------------------------
// Step 0 — Intro / welcome (no inputs, bullets + illustration side panel)
// ---------------------------------------------------------------------------

function StepIntro() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 300px",
        gap: 40,
        alignItems: "center",
        padding: "16px 0 8px",
      }}
    >
      <div>
        <h1
          style={{
            fontSize: 32,
            lineHeight: 1.15,
            fontWeight: 700,
            color: "#1a1c1f",
            margin: "0 0 12px",
          }}
        >
          Get more repeat customers
        </h1>
        <p
          style={{
            fontSize: 15,
            color: "#6d7175",
            margin: "0 0 28px",
            lineHeight: 1.5,
          }}
        >
          Reward shoppers for coming back. Set your program up in a few clicks
          and switch it on for your storefront.
        </p>

        <div style={{ display: "grid", gap: 18 }}>
          <IntroBullet
            icon={ICONS.bag}
            title="Reward every purchase"
            body="Customers earn points on every order. Their balance shows up in the storefront widget."
          />
          <IntroBullet
            icon={ICONS.gift}
            title="Turn points into discounts"
            body="Shoppers redeem points for an amount-off reward applied at checkout."
          />
          <IntroBullet
            icon={ICONS.rocket}
            title="Lift your best customers"
            body="VIP tiers reward repeat buyers with a higher earn multiplier."
          />
        </div>
      </div>

      <Illustration />
    </div>
  );
}

function IntroBullet({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
      <span
        style={{
          flexShrink: 0,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "#f1f2f3",
          color: "#5c5f62",
        }}
      >
        {icon}
      </span>
      <div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: "#1a1c1f",
            marginBottom: 2,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "#6d7175",
            lineHeight: 1.5,
          }}
        >
          {body}
        </div>
      </div>
    </div>
  );
}

/** Pure-HTML/CSS illustration panel (no SVG). 2:3 vertical aspect.
 *  Royal-branded: dark-navy gradient background, gold sparkles + accents,
 *  cream cards. Independent of the merchant's storefront palette. */
function Illustration() {
  const color = ROYAL.gold; // accents inside the dark panel
  return (
    <div
      aria-hidden="true"
      style={{
        position: "relative",
        aspectRatio: "2 / 3",
        width: "100%",
        borderRadius: 16,
        background: `
          radial-gradient(ellipse 200px 280px at 70% 30%, rgba(242,184,33,0.18), transparent 70%),
          linear-gradient(160deg, ${ROYAL.navyDarker} 0%, ${ROYAL.navyDeep} 55%, ${ROYAL.navy} 100%)
        `,
        overflow: "hidden",
        boxShadow: "0 4px 16px rgba(8, 8, 26, 0.25)",
      }}
    >
      {/* Floating "sparkles" — multi-shadow dots in gold */}
      <div
        style={{
          position: "absolute",
          top: 24,
          left: 24,
          width: 4,
          height: 4,
          borderRadius: "50%",
          background: color,
          opacity: 0.85,
          boxShadow: `
            120px 14px 0 -1px ${color}cc,
            180px 80px 0 -1px ${color}99,
            40px 130px 0 -1px ${color}99,
            210px 170px 0 -1px ${color}cc,
            70px 220px 0 -1px ${color}99,
            220px 280px 0 -1px ${color}cc,
            30px 320px 0 -1px ${color}99,
            140px 360px 0 -1px ${color}99
          `,
        }}
      />

      {/* Card 1 — top: order placed */}
      <div
        style={{
          position: "absolute",
          top: 28,
          left: 18,
          right: 60,
          background: "#fff",
          borderRadius: 10,
          boxShadow: "0 6px 18px rgba(22, 29, 37, 0.10)",
          padding: 12,
        }}
      >
        <div style={{ fontSize: 10, color: "#6d7175", letterSpacing: 0.4 }}>
          ORDER PLACED
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 8,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              background: "#f1f2f3",
            }}
          />
          <div style={{ flex: 1 }}>
            <div
              style={{
                height: 6,
                width: "70%",
                background: "#e3e5e7",
                borderRadius: 3,
              }}
            />
            <div
              style={{
                height: 6,
                width: "45%",
                background: "#e3e5e7",
                borderRadius: 3,
                marginTop: 5,
              }}
            />
          </div>
        </div>
      </div>

      {/* Card 2 — middle: +points pill (gold on navy for legibility) */}
      <div
        style={{
          position: "absolute",
          top: "44%",
          right: 28,
          background: ROYAL.gold,
          color: ROYAL.navyDarker,
          borderRadius: 999,
          padding: "8px 14px",
          fontSize: 12,
          fontWeight: 700,
          boxShadow: `0 8px 20px rgba(242, 184, 33, 0.35)`,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          letterSpacing: 0.2,
        }}
      >
        <CoinShape />
        +50 points earned
      </div>

      {/* Card 3 — bottom: reward unlocked */}
      <div
        style={{
          position: "absolute",
          bottom: 26,
          left: 18,
          right: 32,
          background: "#fff",
          borderRadius: 10,
          boxShadow: "0 6px 18px rgba(8, 8, 26, 0.35)",
          padding: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <GiftShape />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: ROYAL.navy }}>
              Reward unlocked
            </div>
            <div style={{ fontSize: 11, color: "#6d7175", marginTop: 2 }}>
              5% off — applied at checkout
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Pure-CSS coin: small white circle with a darker inner ring. */
function CoinShape() {
  return (
    <span
      style={{
        display: "inline-block",
        width: 12,
        height: 12,
        borderRadius: "50%",
        background: "#ffffff",
        border: "2px solid rgba(255,255,255,0.7)",
        boxShadow: "inset 0 0 0 2px currentColor",
      }}
    />
  );
}

/** Pure-CSS gift box: navy box body with gold ribbon overlay (Royal brand). */
function GiftShape() {
  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        width: 32,
        height: 32,
        borderRadius: 6,
        background: ROYAL.navy,
        flexShrink: 0,
      }}
    >
      {/* lid */}
      <span
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 6,
          height: 4,
          background: ROYAL.gold,
        }}
      />
      {/* ribbon vertical */}
      <span
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: "50%",
          width: 3,
          marginLeft: -1.5,
          background: ROYAL.gold,
        }}
      />
    </span>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — earn rate + signup
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
    <>
      <StepTitle
        title="Set how customers earn"
        subtitle="You can add more later."
      />

      <Card icon={ICONS.bag} title="Earn on every order">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            gap: 16,
          }}
        >
          <div>
            <FieldLabel>Customer earns</FieldLabel>
            <SuffixNumber
              value={state.earnPoints}
              onChange={(v) => mut("earnPoints", Math.max(1, Math.round(v)))}
              suffix="points"
            />
          </div>
          <div>
            <FieldLabel>For every</FieldLabel>
            <SuffixNumber
              value={state.earnPerCurrency}
              onChange={(v) =>
                mut("earnPerCurrency", Math.max(1, Math.round(v)))
              }
              suffix={currencyCode}
            />
          </div>
        </div>
      </Card>

      <Card icon={ICONS.userPlus} title="Signup bonus">
        <div>
          <FieldLabel>New customers receive</FieldLabel>
          <SuffixNumber
            value={state.signupPoints}
            onChange={(v) => mut("signupPoints", Math.max(0, Math.round(v)))}
            suffix="points"
            min={0}
          />
        </div>
      </Card>
    </>
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
    <>
      <StepTitle
        title="Pick a first reward"
        subtitle="You can add more later."
      />

      <Card icon={ICONS.gift} title="Amount off">
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "flex-end",
            gap: 16,
          }}
        >
          <div>
            <FieldLabel>Spend</FieldLabel>
            <SuffixNumber
              value={state.firstRewardPoints}
              onChange={(v) =>
                mut("firstRewardPoints", Math.max(1, Math.round(v)))
              }
              suffix="points"
            />
          </div>
          <div>
            <FieldLabel>Get</FieldLabel>
            <SuffixNumber
              value={state.firstRewardValue}
              onChange={(v) =>
                mut("firstRewardValue", Math.max(1, Math.round(v)))
              }
              suffix={`${currencyCode} off`}
              width={180}
            />
          </div>
        </div>
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Branding
// ---------------------------------------------------------------------------

function StepBranding({
  state,
  mut,
  setProgramName,
  setPointsName,
}: {
  state: WizardState;
  mut: <K extends keyof WizardState>(key: K, value: WizardState[K]) => void;
  setProgramName: (v: string) => void;
  setPointsName: (v: string) => void;
}) {
  return (
    <>
      <StepTitle
        title="Make it yours"
        subtitle="Customize what shoppers see on the storefront."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 340px",
          gap: 32,
          alignItems: "start",
        }}
      >
        <div>
          <Card icon={ICONS.globe} title="Default language">
            <FieldLabel>Customers will see strings in this language</FieldLabel>
            <LocalePicker
              value={state.defaultLocale}
              onChange={(v) => mut("defaultLocale", v)}
            />
          </Card>

          <Card icon={ICONS.type} title="Naming">
            <div style={{ display: "grid", gap: 14 }}>
              <div>
                <FieldLabel>Program name</FieldLabel>
                <input
                  type="text"
                  value={state.programName}
                  onChange={(e) => setProgramName(e.target.value)}
                  style={{
                    width: "100%",
                    maxWidth: 360,
                    border: "1px solid #c9cccf",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 14,
                    fontFamily: "inherit",
                    color: "#1a1c1f",
                    background: "#fff",
                  }}
                />
              </div>
              <div>
                <FieldLabel>
                  Points name (e.g. Crowns, Coins, Stars)
                </FieldLabel>
                <input
                  type="text"
                  value={state.pointsName}
                  onChange={(e) => setPointsName(e.target.value)}
                  style={{
                    width: "100%",
                    maxWidth: 240,
                    border: "1px solid #c9cccf",
                    borderRadius: 8,
                    padding: "8px 12px",
                    fontSize: 14,
                    fontFamily: "inherit",
                    color: "#1a1c1f",
                    background: "#fff",
                  }}
                />
              </div>
            </div>
          </Card>

          <Card icon={ICONS.palette} title="Colors">
            <FieldLabel>Pick a starting palette</FieldLabel>
            <BrandingPalette
              primary={state.primaryColor}
              secondary={state.secondaryColor}
              onSelect={(preset) => {
                mut("primaryColor", preset.primary);
                mut("secondaryColor", preset.secondary);
              }}
            />
            <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
              <div>
                <FieldLabel>Primary color</FieldLabel>
                <ColorPicker
                  value={state.primaryColor}
                  label="Primary color"
                  onChange={(v) => mut("primaryColor", v)}
                />
              </div>
              <div>
                <FieldLabel>Secondary color</FieldLabel>
                <ColorPicker
                  value={state.secondaryColor}
                  label="Secondary color"
                  onChange={(v) => mut("secondaryColor", v)}
                />
              </div>
            </div>
          </Card>
        </div>

        <div style={{ position: "sticky", top: 16 }}>
          <FieldLabel>Live preview</FieldLabel>
          <WidgetPreview
            config={{
              primaryColor: state.primaryColor,
              secondaryColor: state.secondaryColor,
              title: state.programName,
              subtitle: "Earn points on every order — redeem for rewards.",
              launcherText: state.pointsName,
              showEarn: true,
              showRewards: true,
              showReferral: true,
              locale: state.defaultLocale,
            }}
          />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Step 4 — Activate
// ---------------------------------------------------------------------------

function StepActivate({
  isSaving,
  error,
}: {
  isSaving: boolean;
  error: string | null;
}) {
  // Live embed-status probe. Re-fetches on mount, focus, and visibility
  // change so the merchant can flip the embed on in the theme editor, come
  // back to this tab, and see the status update without a manual refresh.
  const [status, setStatus] = useState<"loading" | "off" | "on" | "unknown">(
    "loading",
  );
  useEffect(() => {
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const res = await fetch("/app/embed-status", {
          headers: { Accept: "application/json" },
        });
        const data = (await res.json()) as { enabled: boolean | null };
        if (cancelled) return;
        setStatus(
          data.enabled === true
            ? "on"
            : data.enabled === false
              ? "off"
              : "unknown",
        );
      } catch {
        if (!cancelled) setStatus("unknown");
      }
    };
    fetchStatus();
    const onFocus = () => fetchStatus();
    const onVis = () => {
      if (document.visibilityState === "visible") fetchStatus();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return (
    <>
      <StepTitle
        title="Show it on your storefront"
        subtitle="Switch on the Royal Loyalty embed so customers can see the widget."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 320px",
          gap: 32,
          alignItems: "start",
        }}
      >
        <div>
          <Card icon={ICONS.store} title="Enable the app embed">
            <p
              style={{
                margin: "0 0 14px",
                fontSize: 14,
                color: "#1a1c1f",
                lineHeight: 1.5,
              }}
            >
              Open the theme editor, find <strong>Loyalty launcher</strong>{" "}
              under App embeds, switch it on, and click Save.
            </p>
            <AppLink href="shopify:admin/themes/current/editor?context=apps">
              Open theme editor
            </AppLink>
          </Card>

          <Card icon={ICONS.rocket} title="Embed status">
            <EmbedStatusPill status={status} />
            <p
              style={{
                margin: "12px 0 0",
                fontSize: 12,
                color: "#6d7175",
                lineHeight: 1.5,
              }}
            >
              We check automatically when you switch back to this tab — no
              need to refresh.
            </p>
          </Card>
        </div>

        <EmbedAnimation />
      </div>

      {isSaving && (
        <p
          style={{
            fontSize: 13,
            color: "#5c5f62",
            textAlign: "center",
            margin: "16px 0 0",
          }}
        >
          Saving your setup…
        </p>
      )}
      {error && (
        <div
          style={{
            background: "#fde7e9",
            border: "1px solid #f3c4c9",
            color: "#a51b29",
            padding: "10px 14px",
            borderRadius: 8,
            marginTop: 12,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}
    </>
  );
}

function EmbedStatusPill({
  status,
}: {
  status: "loading" | "off" | "on" | "unknown";
}) {
  const config = {
    loading: { bg: "#f1f2f3", fg: "#5c5f62", dot: "#8c9196", label: "Checking…" },
    off: { bg: "#f1f2f3", fg: "#5c5f62", dot: "#8c9196", label: "Not enabled yet" },
    on: { bg: "#e3f4e1", fg: "#0d6c2e", dot: "#0e8a3e", label: "Enabled — you're all set" },
    unknown: { bg: "#fff4e3", fg: "#8a5d00", dot: "#bf7c00", label: "Couldn't check status" },
  }[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: config.bg,
        color: config.fg,
        padding: "6px 12px",
        borderRadius: 999,
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: config.dot,
          flexShrink: 0,
        }}
      />
      {config.label}
    </span>
  );
}

/** Recreation of Shopify's "App embeds" panel in pure HTML/CSS, with a
 *  looping click animation that demonstrates flipping the Loyalty launcher
 *  toggle on. The keyframes are scoped via a unique class so this doesn't
 *  collide with anything else on the page. */
function EmbedAnimation() {
  return (
    <>
      <style>{`
        @keyframes rl-cursor {
          0%, 18%   { transform: translate(-40px, -12px); opacity: 0; }
          22%      { transform: translate(0px, 0px); opacity: 1; }
          38%      { transform: translate(0px, 0px) scale(1); }
          42%      { transform: translate(0px, 0px) scale(0.85); }
          50%      { transform: translate(0px, 0px) scale(1); opacity: 1; }
          70%, 100% { transform: translate(0px, 0px); opacity: 0; }
        }
        @keyframes rl-toggle {
          0%, 38%   { background: #1a1c1f; }
          42%      { background: ${ROYAL.gold}; }
          100%     { background: ${ROYAL.gold}; }
        }
        @keyframes rl-knob {
          0%, 38%   { left: 3px; }
          42%, 100% { left: 21px; }
        }
        .rl-loop { animation-iteration-count: infinite; animation-duration: 4s; animation-timing-function: ease-in-out; }
      `}</style>
      <div
        aria-hidden="true"
        style={{
          position: "sticky",
          top: 16,
          width: "100%",
          background: "#fff",
          border: "1px solid #e3e5e7",
          borderRadius: 12,
          padding: 16,
          boxShadow: "0 4px 16px rgba(22, 29, 37, 0.08)",
        }}
      >
        {/* Header strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            paddingBottom: 12,
            borderBottom: "1px solid #f1f2f3",
            marginBottom: 12,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              background: "#edf2ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#4459d4",
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            +
          </div>
          <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1c1f" }}>
            App embeds
          </div>
        </div>

        {/* Loyalty launcher row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            position: "relative",
            padding: "8px 0",
          }}
        >
          {/* App icon block (navy + gold, mirrors the real app icon) */}
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: ROYAL.navy,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: ROYAL.gold,
              fontSize: 18,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            ♛
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "#1a1c1f",
                lineHeight: 1.3,
              }}
            >
              Loyalty launcher
            </div>
            <div style={{ fontSize: 12, color: "#6d7175", marginTop: 1 }}>
              Royal Loyalty
            </div>
          </div>

          {/* Toggle track — animated */}
          <div
            className="rl-loop"
            style={{
              position: "relative",
              width: 40,
              height: 22,
              borderRadius: 999,
              background: "#1a1c1f",
              flexShrink: 0,
              animationName: "rl-toggle",
            }}
          >
            <div
              className="rl-loop"
              style={{
                position: "absolute",
                top: 3,
                left: 3,
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "#fff",
                boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
                animationName: "rl-knob",
              }}
            />
            {/* Animated cursor pointer — classic OS arrow */}
            <div
              className="rl-loop"
              style={{
                position: "absolute",
                top: 4,
                right: -6,
                width: 18,
                height: 18,
                animationName: "rl-cursor",
                pointerEvents: "none",
                filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.25))",
              }}
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="#ffffff"
                stroke="#1a1c1f"
                strokeWidth="1.4"
                strokeLinejoin="round"
              >
                <path d="M5 3 L5 17.5 L9 14 L11.5 19.5 L13.8 18.4 L11.3 13 L17 13 Z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Second row — placeholder, dimmed */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "8px 0 4px",
            opacity: 0.55,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: "#f1f2f3",
              flexShrink: 0,
            }}
          />
          <div style={{ flex: 1 }}>
            <div
              style={{
                height: 8,
                width: "60%",
                borderRadius: 4,
                background: "#e3e5e7",
              }}
            />
            <div
              style={{
                height: 6,
                width: "35%",
                borderRadius: 3,
                background: "#e3e5e7",
                marginTop: 5,
              }}
            />
          </div>
          <div
            style={{
              width: 40,
              height: 22,
              borderRadius: 999,
              background: "#c9cccf",
              flexShrink: 0,
            }}
          />
        </div>

      </div>
    </>
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

