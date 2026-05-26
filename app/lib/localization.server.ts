// Server-side localization helpers — read/write the merchant's customized
// strings on Shop.aiConfigSnapshot.localization. The shape:
//
//   localization: {
//     defaultLocale: "en" | "nb" | ...,
//     bundles: {
//       en: { "hub.earn": "Earn points", ... },  // overrides only
//       nb: { ... }
//     }
//   }
//
// We DON'T persist the full English catalog on every shop — only the keys
// the merchant has touched. The resolver layers overrides on top of the
// baked defaults (localization-defaults.ts), which always have a value.
// So storage stays small and adding new strings to the catalog never
// requires a migration.

import type { LocaleCode } from "./localization-locales";
import { DEFAULT_LOCALE, isLocaleCode } from "./localization-locales";
import { getDefault, TRANSLATIONS } from "./localization-defaults";

export interface LocalizationConfig {
  defaultLocale: LocaleCode;
  bundles: Partial<Record<LocaleCode, Record<string, string>>>;
}

/** Default config when a shop hasn't touched localization yet. */
export const EMPTY_CONFIG: LocalizationConfig = {
  defaultLocale: DEFAULT_LOCALE,
  bundles: {},
};

/** Read the merchant's localization config from a Shop snapshot blob. */
export function readLocalization(snapshot: unknown): LocalizationConfig {
  if (!snapshot || typeof snapshot !== "object") return EMPTY_CONFIG;
  const snap = snapshot as Record<string, unknown>;
  const raw = snap.localization as Partial<LocalizationConfig> | undefined;
  if (!raw || typeof raw !== "object") return EMPTY_CONFIG;
  const defaultLocale =
    raw.defaultLocale && isLocaleCode(raw.defaultLocale)
      ? (raw.defaultLocale as LocaleCode)
      : DEFAULT_LOCALE;
  const bundles: LocalizationConfig["bundles"] = {};
  if (raw.bundles && typeof raw.bundles === "object") {
    for (const [code, bundle] of Object.entries(
      raw.bundles as Record<string, unknown>,
    )) {
      if (!isLocaleCode(code)) continue;
      if (!bundle || typeof bundle !== "object") continue;
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(bundle as Record<string, unknown>)) {
        if (typeof v === "string") clean[k] = v;
      }
      bundles[code as LocaleCode] = clean;
    }
  }
  return { defaultLocale, bundles };
}

/**
 * Resolve a single key against a merchant's config:
 *   merchant override → baked default for locale → baked English → empty
 */
export function tFromConfig(
  config: LocalizationConfig,
  locale: LocaleCode,
  key: string,
): string {
  const override = config.bundles[locale]?.[key];
  if (override != null) return override;
  return getDefault(locale, key);
}

/**
 * Build the FULL flat bundle for a given locale — merchant overrides
 * merged on top of baked defaults. This is what the storefront payload
 * ships to the customer-facing extension so the client doesn't need to
 * carry the defaults file.
 */
export function buildResolvedBundle(
  config: LocalizationConfig,
  locale: LocaleCode,
): Record<string, string> {
  const baked = TRANSLATIONS[locale] ?? TRANSLATIONS.en;
  const overrides = config.bundles[locale] ?? {};
  return { ...baked, ...overrides };
}

/**
 * Persist a partial update of the config onto the existing snapshot,
 * dropping any override that equals the baked default (so storage stays
 * minimal and the merchant can "reset to default" by clearing a field).
 */
export function writeLocalization(
  existingSnapshot: unknown,
  next: LocalizationConfig,
): Record<string, unknown> {
  const minimized: LocalizationConfig = {
    defaultLocale: next.defaultLocale,
    bundles: {},
  };
  for (const [code, bundle] of Object.entries(next.bundles) as Array<
    [LocaleCode, Record<string, string>]
  >) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(bundle)) {
      const baked = getDefault(code, k);
      if (v != null && v !== "" && v !== baked) {
        out[k] = v;
      }
    }
    if (Object.keys(out).length > 0) {
      minimized.bundles[code] = out;
    }
  }
  const base =
    existingSnapshot && typeof existingSnapshot === "object"
      ? (existingSnapshot as Record<string, unknown>)
      : {};
  return { ...base, localization: minimized };
}
