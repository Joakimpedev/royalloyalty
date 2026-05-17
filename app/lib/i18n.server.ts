// Multi-language / multi-currency (Phase 4, brief §3a.10).
//
// All customer-facing strings (widget, loyalty page, emails, storefront) resolve
// through this catalog. Reward values are presented currency-aware using the
// shop's currency. The shop's primary locale + currency are read from
// Shop.primaryLocale / Shop.currencyCode (populated on install / first AI run).
import prisma from "../db.server";

export type LocaleCode = "en" | "fr" | "de" | "es" | "it" | "nl" | "pt" | "da";

export type StringKey =
  | "widget.launcher"
  | "widget.title"
  | "widget.points_balance"
  | "widget.tier"
  | "widget.earn_heading"
  | "widget.rewards_heading"
  | "widget.redeem"
  | "widget.redeem_success"
  | "widget.redeem_error"
  | "widget.signin_prompt"
  | "widget.referral_heading"
  | "widget.referral_share"
  | "widget.empty_rewards"
  | "page.hero_title"
  | "page.hero_subtitle"
  | "email.points_earned.subject"
  | "email.points_earned.body"
  | "email.reward_available.subject"
  | "email.reward_available.body"
  | "email.tier_change.subject"
  | "email.tier_change.body"
  | "email.expiry_reminder.subject"
  | "email.expiry_reminder.body"
  | "email.referral_success.subject"
  | "email.referral_success.body";

type Catalog = Record<StringKey, string>;

// English is the complete reference catalog. Other locales fall back to English
// per-key, so a partial translation never produces a blank string.
const EN: Catalog = {
  "widget.launcher": "Rewards",
  "widget.title": "Your rewards",
  "widget.points_balance": "You have {points} points",
  "widget.tier": "Your tier: {tier}",
  "widget.earn_heading": "Ways to earn",
  "widget.rewards_heading": "Rewards",
  "widget.redeem": "Redeem",
  "widget.redeem_success": "Reward redeemed — your code is {code}.",
  "widget.redeem_error": "We couldn't redeem that reward. Please try again.",
  "widget.signin_prompt": "Sign in to see your points and rewards.",
  "widget.referral_heading": "Refer a friend",
  "widget.referral_share": "Share your link and you both get rewarded.",
  "widget.empty_rewards": "No rewards available yet — check back soon.",
  "page.hero_title": "Earn points. Get rewards.",
  "page.hero_subtitle":
    "Join the program and earn on every order, signup and more.",
  "email.points_earned.subject": "You earned {points} points",
  "email.points_earned.body":
    "Thanks for your order! You earned {points} points. Your balance is now {balance}.",
  "email.reward_available.subject": "A reward is ready for you",
  "email.reward_available.body":
    "You have enough points to redeem {reward}. Sign in to claim it.",
  "email.tier_change.subject": "Welcome to {tier}",
  "email.tier_change.body":
    "Congratulations — you've reached the {tier} tier and unlocked new perks.",
  "email.expiry_reminder.subject": "Your points expire soon",
  "email.expiry_reminder.body":
    "You have {points} points expiring on {date}. Redeem them before they're gone.",
  "email.referral_success.subject": "Your referral paid off",
  "email.referral_success.body":
    "Your friend made their first order — you've earned {points} points.",
};

const FR: Partial<Catalog> = {
  "widget.launcher": "Récompenses",
  "widget.title": "Vos récompenses",
  "widget.points_balance": "Vous avez {points} points",
  "widget.tier": "Votre niveau : {tier}",
  "widget.earn_heading": "Comment gagner",
  "widget.rewards_heading": "Récompenses",
  "widget.redeem": "Échanger",
  "widget.redeem_success": "Récompense échangée — votre code est {code}.",
  "widget.redeem_error": "Échec de l'échange. Veuillez réessayer.",
  "widget.signin_prompt":
    "Connectez-vous pour voir vos points et récompenses.",
  "widget.referral_heading": "Parrainez un ami",
  "widget.referral_share":
    "Partagez votre lien et soyez récompensés tous les deux.",
  "widget.empty_rewards":
    "Aucune récompense disponible pour le moment — revenez bientôt.",
  "page.hero_title": "Gagnez des points. Obtenez des récompenses.",
  "page.hero_subtitle":
    "Rejoignez le programme et gagnez à chaque commande, inscription et plus.",
  "email.points_earned.subject": "Vous avez gagné {points} points",
  "email.points_earned.body":
    "Merci pour votre commande ! Vous avez gagné {points} points. Votre solde est de {balance}.",
};

const DE: Partial<Catalog> = {
  "widget.launcher": "Prämien",
  "widget.title": "Ihre Prämien",
  "widget.points_balance": "Sie haben {points} Punkte",
  "widget.tier": "Ihre Stufe: {tier}",
  "widget.earn_heading": "Punkte sammeln",
  "widget.rewards_heading": "Prämien",
  "widget.redeem": "Einlösen",
  "widget.redeem_success": "Prämie eingelöst — Ihr Code ist {code}.",
  "widget.redeem_error":
    "Einlösen fehlgeschlagen. Bitte versuchen Sie es erneut.",
  "widget.signin_prompt":
    "Melden Sie sich an, um Punkte und Prämien zu sehen.",
  "page.hero_title": "Punkte sammeln. Prämien erhalten.",
  "page.hero_subtitle":
    "Treten Sie dem Programm bei und sammeln Sie bei jeder Bestellung.",
};

const ES: Partial<Catalog> = {
  "widget.launcher": "Recompensas",
  "widget.title": "Tus recompensas",
  "widget.points_balance": "Tienes {points} puntos",
  "widget.tier": "Tu nivel: {tier}",
  "widget.earn_heading": "Formas de ganar",
  "widget.rewards_heading": "Recompensas",
  "widget.redeem": "Canjear",
  "widget.redeem_success": "Recompensa canjeada — tu código es {code}.",
  "widget.redeem_error":
    "No se pudo canjear. Inténtalo de nuevo.",
  "widget.signin_prompt":
    "Inicia sesión para ver tus puntos y recompensas.",
  "page.hero_title": "Gana puntos. Obtén recompensas.",
  "page.hero_subtitle":
    "Únete al programa y gana en cada pedido y registro.",
};

const CATALOGS: Record<LocaleCode, Partial<Catalog>> = {
  en: EN,
  fr: FR,
  de: DE,
  es: ES,
  it: {},
  nl: {},
  pt: {},
  da: {},
};

export function normalizeLocale(raw: string | null | undefined): LocaleCode {
  if (!raw) return "en";
  const base = raw.toLowerCase().split("-")[0];
  return (Object.keys(CATALOGS) as LocaleCode[]).includes(base as LocaleCode)
    ? (base as LocaleCode)
    : "en";
}

/**
 * Resolve a string for a locale with {placeholder} interpolation. Falls back to
 * English per-key so a partial translation is never blank.
 */
export function t(
  locale: LocaleCode,
  key: StringKey,
  vars?: Record<string, string | number>,
): string {
  const fromLocale = CATALOGS[locale]?.[key];
  const template = fromLocale ?? EN[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  );
}

/** A flat resolved catalog for the storefront extension to embed as JSON. */
export function resolveCatalog(locale: LocaleCode): Catalog {
  const out = {} as Catalog;
  for (const key of Object.keys(EN) as StringKey[]) {
    out[key] = CATALOGS[locale]?.[key] ?? EN[key];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Currency-aware reward values
// ---------------------------------------------------------------------------

export interface ShopLocaleContext {
  locale: LocaleCode;
  currencyCode: string;
}

export async function getShopLocaleContext(
  shopId: string,
): Promise<ShopLocaleContext> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { primaryLocale: true, currencyCode: true },
  });
  return {
    locale: normalizeLocale(shop?.primaryLocale),
    currencyCode: shop?.currencyCode || "USD",
  };
}

/**
 * Format a money reward value in the shop's currency + locale. Uses Intl
 * (available in the Node runtime) — never hardcodes a currency symbol.
 */
export function formatCurrency(
  amount: number,
  currencyCode: string,
  locale: LocaleCode,
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currencyCode}`;
  }
}

/**
 * Human label for a reward, currency-aware.
 *  amount_off    -> "$5 off"
 *  percent_off   -> "10% off"
 *  free_shipping -> "Free shipping"
 *  free_product  -> "Free product"
 *  store_credit  -> "$5 store credit"
 */
export function describeReward(
  reward: { type: string; value: number | null },
  ctx: ShopLocaleContext,
): string {
  switch (reward.type) {
    case "amount_off":
      return `${formatCurrency(reward.value ?? 0, ctx.currencyCode, ctx.locale)} off`;
    case "percent_off":
      return `${reward.value ?? 0}% off`;
    case "free_shipping":
      return "Free shipping";
    case "free_product":
      return "Free product";
    case "store_credit":
      return `${formatCurrency(reward.value ?? 0, ctx.currencyCode, ctx.locale)} store credit`;
    default:
      return reward.type;
  }
}
