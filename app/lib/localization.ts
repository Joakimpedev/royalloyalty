// Read/write helpers for merchant-customized storefront strings on
// Shop.aiConfigSnapshot.localization.
//
// Storage shape (single-language model):
//
//   localization: {
//     defaultLocale: "en" | "nb" | ...,
//     overrides: { "hub.earn": "Earn points!", ... }  // current locale only
//   }
//
// The active locale is whatever the merchant picked. Overrides apply on
// top of that locale's baked defaults. Switching language and saving
// CLEARS the overrides — the merchant gets a fresh baseline from the new
// locale's bake. (Earlier draft kept per-locale bundles; that's confusing
// when "switching back" still shows your earlier edits. The merchant
// wants language = "set my baseline", overrides = "on top".)
//
// Legacy data with the old per-locale shape is auto-migrated on read:
// the overrides of whatever's now the active locale survive; the other
// locales' bundles are dropped silently.

import type { LocaleCode } from "./localization-locales";
import { DEFAULT_LOCALE, isLocaleCode } from "./localization-locales";
import { getDefault, TRANSLATIONS } from "./localization-defaults";

export interface LocalizationConfig {
  defaultLocale: LocaleCode;
  /** Merchant overrides that apply on top of the active locale's baked
   *  defaults. Only non-default values are stored. */
  overrides: Record<string, string>;
}

export const EMPTY_CONFIG: LocalizationConfig = {
  defaultLocale: DEFAULT_LOCALE,
  overrides: {},
};

/** Parse the merchant's saved localization config from a snapshot blob.
 *  Migrates the legacy { bundles: {locale: {...}} } shape to the new
 *  { overrides: {...} } shape on the fly. */
export function readLocalization(snapshot: unknown): LocalizationConfig {
  if (!snapshot || typeof snapshot !== "object") return EMPTY_CONFIG;
  const snap = snapshot as Record<string, unknown>;
  const raw = snap.localization as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object") return EMPTY_CONFIG;
  const defaultLocale =
    typeof raw.defaultLocale === "string" && isLocaleCode(raw.defaultLocale)
      ? (raw.defaultLocale as LocaleCode)
      : DEFAULT_LOCALE;

  // Modern shape: a single `overrides` map.
  if (raw.overrides && typeof raw.overrides === "object") {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(
      raw.overrides as Record<string, unknown>,
    )) {
      if (typeof v === "string") clean[k] = v;
    }
    return { defaultLocale, overrides: clean };
  }

  // Legacy shape: { bundles: { en: {...}, nb: {...} } }. Promote whichever
  // locale matches `defaultLocale` to the new `overrides` field; the rest
  // are discarded (the merchant explicitly chose this new model where
  // switching a language = clean slate).
  if (raw.bundles && typeof raw.bundles === "object") {
    const bundles = raw.bundles as Record<string, unknown>;
    const active = bundles[defaultLocale];
    if (active && typeof active === "object") {
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(
        active as Record<string, unknown>,
      )) {
        if (typeof v === "string") clean[k] = v;
      }
      return { defaultLocale, overrides: clean };
    }
  }

  return { defaultLocale, overrides: {} };
}

/** Resolve a single key: override → locale's baked default → en → "". */
export function tFromConfig(
  config: LocalizationConfig,
  key: string,
): string {
  const override = config.overrides[key];
  if (override != null) return override;
  return getDefault(config.defaultLocale, key);
}

/**
 * Build the full flat bundle the storefront ships to the customer:
 * baked defaults for the active locale, with merchant overrides layered
 * on top. Locale arg lets callers (e.g. the admin form preview) sample
 * any locale's bundle without committing to it.
 */
export function buildResolvedBundle(
  config: LocalizationConfig,
  locale: LocaleCode,
): Record<string, string> {
  const baked = TRANSLATIONS[locale] ?? TRANSLATIONS.en;
  // Overrides only apply when the merchant is viewing/serving the
  // locale they stored them against. For other locales we surface just
  // the baked defaults.
  const overrides =
    locale === config.defaultLocale ? config.overrides : {};
  return { ...baked, ...overrides };
}

/**
 * Persist a partial update, stripping any override that equals the
 * baked default so storage stays minimal and clearing a field resets
 * it to default automatically.
 */
export function writeLocalization(
  existingSnapshot: unknown,
  next: LocalizationConfig,
): Record<string, unknown> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(next.overrides)) {
    if (typeof v !== "string") continue;
    if (v === "") continue;
    const baked = getDefault(next.defaultLocale, k);
    if (v !== baked) out[k] = v;
  }
  const minimized: LocalizationConfig = {
    defaultLocale: next.defaultLocale,
    overrides: out,
  };
  const base =
    existingSnapshot && typeof existingSnapshot === "object"
      ? (existingSnapshot as Record<string, unknown>)
      : {};
  // Drop the legacy `bundles` key on save so old data doesn't linger.
  const cleaned: Record<string, unknown> = { ...base };
  delete cleaned.localization;
  cleaned.localization = minimized;
  return cleaned;
}
