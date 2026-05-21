// Server-side assembler for the unified `/loyalty/balance` response.
//
// The storefront extension (launcher panel, loyalty page block, customer-
// account block, and the launcher-driven product/cart injections) fetches
// this ONCE on page load and uses it to
// render every section: balance, tier, earn list, reward list, referral
// link, recent activity, and branding (colors + copy chosen in the admin
// Branding page). One round-trip per open so the panel is fast.
//
// Anonymous visitors still get earn rules, rewards, and branding — they
// just don't get balance / tier / referral link / activity (those need a
// customer record). The launcher's signed-out state is handled in the
// Liquid block itself; this payload doesn't make assumptions.

import prisma from "../db.server";
import type { Shop } from "@prisma/client";
import { getBalance } from "./points.server";
import { issueReferralCode, referralLink } from "./referrals.server";

export interface StorefrontBranding {
  primaryColor: string;
  secondaryColor: string;
  programName: string;
  pointsName: string;
  launcherText: string;
  launcherPosition: "bottom-right" | "bottom-left";
  heroTitle: string;
  heroSubtitle: string;
  showEarn: boolean;
  showRewards: boolean;
  showReferral: boolean;
  // Product page injection (above add-to-cart). The launcher app embed reads
  // these to decide whether/how to inject the "earn X points" card.
  productEnabled: boolean;
  productAccent: string;
  productHeading: string;
  productSubtext: string;
  // Cart drawer / cart page injection.
  cartEnabled: boolean;
  cartAccent: string;
  cartHeading: string;
  cartShowEarnLine: boolean;
}

export interface StorefrontEarnRule {
  action: string;
  label: string;
  points: number;
  perDollar: boolean;
  /** Only meaningful when perDollar=true; "X points per perAmount currency". */
  perAmount: number;
}

export interface StorefrontReward {
  id: string;
  type: string;
  pointsCost: number;
  value: number | null;
  label: string;
}

export interface StorefrontActivity {
  type: "EARN" | "REDEEM" | "ADJUST" | "EXPIRE" | string;
  reason: string;
  points: number;
  /** ISO date string. */
  date: string;
}

export interface StorefrontPayload {
  balance: number;
  enrolled: boolean;
  tier: string | null;
  currencyCode: string;
  earnRules: StorefrontEarnRule[];
  rewards: StorefrontReward[];
  referralLink: string | null;
  activity: StorefrontActivity[];
  branding: StorefrontBranding;
}

// Hardcoded defaults that match the Liquid block defaults — so a brand-new
// shop with no aiConfigSnapshot still renders something sensible.
const DEFAULT_BRANDING: StorefrontBranding = {
  primaryColor: "#2C2A29",
  secondaryColor: "#FFFFFF",
  programName: "Rewards",
  pointsName: "Points",
  launcherText: "Rewards",
  launcherPosition: "bottom-right",
  heroTitle: "Earn points. Get rewards.",
  heroSubtitle: "Join the program and earn on every order.",
  showEarn: true,
  showRewards: true,
  showReferral: true,
  productEnabled: true,
  productAccent: "#2C2A29",
  productHeading: "Earn {points} points with this purchase",
  productSubtext:
    "You have {balance} points. Earn {more} more with this order!",
  cartEnabled: true,
  cartAccent: "#2C2A29",
  cartHeading: "Use your points",
  cartShowEarnLine: true,
};

function readBranding(snapshot: unknown): StorefrontBranding {
  if (!snapshot || typeof snapshot !== "object") return DEFAULT_BRANDING;
  const snap = snapshot as Record<string, unknown>;
  // The admin saves an extended shape under `branding`: widget / page /
  // emails sub-objects (see /app/branding loader). We pull from each so the
  // storefront sees a flat, ergonomic shape.
  const br = (snap.branding as Record<string, any> | undefined) ?? {};
  const widget = (br.widget as Record<string, any> | undefined) ?? {};
  const page = (br.page as Record<string, any> | undefined) ?? {};
  const product = (br.product as Record<string, any> | undefined) ?? {};
  const cart = (br.cart as Record<string, any> | undefined) ?? {};

  // The onboarding wizard also writes a ProposedBranding shape sometimes,
  // so fall back to the flat fields if widget/page aren't present yet.
  const flat = br as Record<string, any>;

  return {
    primaryColor:
      widget.primaryColor ?? flat.primaryColor ?? DEFAULT_BRANDING.primaryColor,
    secondaryColor:
      widget.secondaryColor ??
      flat.secondaryColor ??
      DEFAULT_BRANDING.secondaryColor,
    programName:
      widget.title ?? flat.programName ?? DEFAULT_BRANDING.programName,
    pointsName: flat.pointsName ?? DEFAULT_BRANDING.pointsName,
    launcherText:
      widget.launcherText ??
      flat.pointsName ??
      DEFAULT_BRANDING.launcherText,
    launcherPosition:
      (widget.position as "bottom-right" | "bottom-left") ??
      flat.launcherPosition ??
      DEFAULT_BRANDING.launcherPosition,
    heroTitle: page.heroTitle ?? DEFAULT_BRANDING.heroTitle,
    heroSubtitle: page.heroSubtitle ?? DEFAULT_BRANDING.heroSubtitle,
    showEarn: page.showEarn ?? DEFAULT_BRANDING.showEarn,
    showRewards: page.showRewards ?? DEFAULT_BRANDING.showRewards,
    showReferral: page.showReferral ?? DEFAULT_BRANDING.showReferral,
    productEnabled:
      product.enabled ?? DEFAULT_BRANDING.productEnabled,
    productAccent:
      product.accentColor ??
      widget.primaryColor ??
      DEFAULT_BRANDING.productAccent,
    productHeading:
      product.heading ?? DEFAULT_BRANDING.productHeading,
    productSubtext:
      product.subtext ?? DEFAULT_BRANDING.productSubtext,
    cartEnabled: cart.enabled ?? DEFAULT_BRANDING.cartEnabled,
    cartAccent:
      cart.accentColor ??
      widget.primaryColor ??
      DEFAULT_BRANDING.cartAccent,
    cartHeading: cart.heading ?? DEFAULT_BRANDING.cartHeading,
    cartShowEarnLine:
      cart.showEarnLine ?? DEFAULT_BRANDING.cartShowEarnLine,
  };
}

export async function buildStorefrontLoyaltyPayload(params: {
  shop: Shop;
  shopDomain: string;
  shopifyCustomerId: string | null;
}): Promise<StorefrontPayload> {
  const { shop, shopDomain, shopifyCustomerId } = params;

  // Earn rules and rewards are shop-wide — load them in parallel regardless
  // of customer presence so signed-out visitors still see "ways to earn".
  const [earnRulesRows, rewardsRows] = await Promise.all([
    prisma.earnRule.findMany({
      where: { shopId: shop.id, enabled: true },
      orderBy: { action: "asc" },
    }),
    prisma.reward.findMany({
      where: { shopId: shop.id, enabled: true },
      orderBy: { pointsCost: "asc" },
    }),
  ]);

  const branding = readBranding(shop.aiConfigSnapshot);

  const earnRules: StorefrontEarnRule[] = earnRulesRows.map((r) => {
    const cfg = (r.config ?? null) as
      | { title?: string; perAmount?: number }
      | null;
    const perAmount = Math.max(1, cfg?.perAmount ?? 1);
    return {
      action: r.action,
      label: cfg?.title ?? defaultEarnLabel(r.action, r.points, perAmount, r.perDollar),
      points: r.points,
      perDollar: r.perDollar,
      perAmount,
    };
  });

  // Reward model has no per-row config field, so labels are computed from
  // type + value. The storefront JS re-formats `amount_off`/`store_credit`
  // labels using the response's `currencyCode` so we get "$5 off" / "kr 5
  // off" / "€5 off" without needing the currency symbol here.
  const rewards: StorefrontReward[] = rewardsRows.map((rw) => ({
    id: rw.id,
    type: rw.type,
    pointsCost: rw.pointsCost,
    value: rw.value,
    label: defaultRewardLabel(rw.type, rw.value),
  }));

  // Customer-specific data — only when we have a Shopify customer to look up.
  if (!shopifyCustomerId) {
    return {
      balance: 0,
      enrolled: false,
      tier: null,
      currencyCode: shop.currencyCode ?? "USD",
      earnRules,
      rewards,
      referralLink: null,
      activity: [],
      branding,
    };
  }

  const member = await prisma.member.findUnique({
    where: {
      shopId_shopifyCustomerId: {
        shopId: shop.id,
        shopifyCustomerId,
      },
    },
    include: { currentTier: true },
  });

  if (!member) {
    // Customer is signed in but hasn't been enrolled yet — they'll be
    // enrolled on their first qualifying action (purchase / signup / etc).
    return {
      balance: 0,
      enrolled: false,
      tier: null,
      currencyCode: shop.currencyCode ?? "USD",
      earnRules,
      rewards,
      referralLink: null,
      activity: [],
      branding,
    };
  }

  const [balance, activityRows, referralCode] = await Promise.all([
    getBalance(shop.id, member.id),
    prisma.pointTransaction.findMany({
      where: { shopId: shop.id, memberId: member.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    // Idempotent: returns the existing code if the member already has one.
    issueReferralCode({ shopId: shop.id, memberId: member.id })
      .then((r) => r.code)
      .catch(() => null),
  ]);

  return {
    balance,
    enrolled: true,
    tier: member.currentTier?.name ?? null,
    currencyCode: shop.currencyCode ?? "USD",
    earnRules,
    rewards,
    referralLink: referralCode
      ? referralLink(shopDomain, referralCode)
      : null,
    activity: activityRows.map((a) => ({
      type: a.type,
      reason: a.reason,
      points: a.points,
      date: a.createdAt.toISOString(),
    })),
    branding,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Label fallbacks — only used when the EarnRule / Reward row has no config
// label saved yet (e.g. very early rules from before the editor existed).
// New rules always have a label saved at write time.
// ───────────────────────────────────────────────────────────────────────────

function defaultEarnLabel(
  action: string,
  points: number,
  perAmount: number,
  perDollar: boolean,
): string {
  const pts = `${points} point${points === 1 ? "" : "s"}`;
  if (action === "purchase" && perDollar)
    return `Earn ${pts} for every ${perAmount} spent`;
  if (action === "purchase") return `Earn ${pts} per order`;
  if (action === "signup") return `Earn ${pts} for creating an account`;
  if (action === "birthday") return `Earn ${pts} on your birthday`;
  if (action === "newsletter")
    return `Earn ${pts} for subscribing to the newsletter`;
  if (action === "social") return `Earn ${pts} for a social follow`;
  if (action === "review") return `Earn ${pts} for a product review`;
  if (action === "anniversary")
    return `Earn ${pts} on your join anniversary`;
  return `Earn ${pts}`;
}

function defaultRewardLabel(type: string, value: number | null): string {
  if (type === "free_shipping") return "Free shipping";
  if (type === "free_product") return "Free product";
  if (type === "percent_off") return `${value ?? 0}% off`;
  // amount_off / store_credit — we don't know the shop currency symbol here
  // and don't want to import the client-side formatter; the storefront JS
  // re-formats this label using the response's `currencyCode` if needed.
  if (type === "amount_off") return `${value ?? 0} off`;
  if (type === "store_credit") return `${value ?? 0} in store credit`;
  return type;
}
