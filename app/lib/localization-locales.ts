// Supported customer-facing locales for the Localization page. The
// merchant picks one as their `defaultLocale`; that bundle is what every
// customer sees on the storefront. We may layer per-market resolution on
// top later — that's a non-breaking addition to this shape.

export type LocaleCode =
  | "en"
  | "es"
  | "fr"
  | "de"
  | "it"
  | "pt-BR"
  | "nl"
  | "pl"
  | "cs"
  | "el"
  | "tr"
  | "nb"
  | "sv"
  | "da"
  | "fi"
  | "is"
  | "hu"
  | "ro"
  | "uk"
  | "ja"
  | "zh-CN"
  | "zh-TW"
  | "ko"
  | "th"
  | "vi"
  | "id"
  | "hi"
  | "tl"
  | "bn"
  | "ta"
  | "ar"
  | "he"
  | "ur"
  | "ru";

export interface LocaleMeta {
  code: LocaleCode;
  label: string;
  /** Display in the picker (native script + English in parens). */
  displayName: string;
  /** ISO 3166-1 alpha-2 country code for the picker's flag image. We
   *  source flag images from flagcdn.com (free, fast, reliable) rather
   *  than emoji flags — emoji flags don't render on Windows / many
   *  desktop browsers (they fall back to the country code letters). */
  countryCode: string;
  rtl?: boolean;
}

export const LOCALES: LocaleMeta[] = [
  { code: "en", label: "English", displayName: "English", countryCode: "gb" },
  { code: "es", label: "Spanish", displayName: "Español (Spanish)", countryCode: "es" },
  { code: "fr", label: "French", displayName: "Français (French)", countryCode: "fr" },
  { code: "de", label: "German", displayName: "Deutsch (German)", countryCode: "de" },
  { code: "it", label: "Italian", displayName: "Italiano (Italian)", countryCode: "it" },
  {
    code: "pt-BR",
    label: "Portuguese (Brazil)",
    displayName: "Português — Brasil",
    countryCode: "br",
  },
  { code: "nl", label: "Dutch", displayName: "Nederlands (Dutch)", countryCode: "nl" },
  { code: "pl", label: "Polish", displayName: "Polski (Polish)", countryCode: "pl" },
  { code: "cs", label: "Czech", displayName: "Čeština (Czech)", countryCode: "cz" },
  { code: "el", label: "Greek", displayName: "Ελληνικά (Greek)", countryCode: "gr" },
  { code: "tr", label: "Turkish", displayName: "Türkçe (Turkish)", countryCode: "tr" },
  {
    code: "nb",
    label: "Norwegian (Bokmål)",
    displayName: "Norsk bokmål (Norwegian)",
    countryCode: "no",
  },
  { code: "sv", label: "Swedish", displayName: "Svenska (Swedish)", countryCode: "se" },
  { code: "da", label: "Danish", displayName: "Dansk (Danish)", countryCode: "dk" },
  { code: "fi", label: "Finnish", displayName: "Suomi (Finnish)", countryCode: "fi" },
  { code: "is", label: "Icelandic", displayName: "Íslenska (Icelandic)", countryCode: "is" },
  { code: "hu", label: "Hungarian", displayName: "Magyar (Hungarian)", countryCode: "hu" },
  { code: "ro", label: "Romanian", displayName: "Română (Romanian)", countryCode: "ro" },
  { code: "uk", label: "Ukrainian", displayName: "Українська (Ukrainian)", countryCode: "ua" },
  { code: "ja", label: "Japanese", displayName: "日本語 (Japanese)", countryCode: "jp" },
  {
    code: "zh-CN",
    label: "Chinese (Simplified)",
    displayName: "简体中文 (Simplified Chinese)",
    countryCode: "cn",
  },
  {
    code: "zh-TW",
    label: "Chinese (Traditional)",
    displayName: "繁體中文 (Traditional Chinese)",
    countryCode: "tw",
  },
  { code: "ko", label: "Korean", displayName: "한국어 (Korean)", countryCode: "kr" },
  { code: "th", label: "Thai", displayName: "ไทย (Thai)", countryCode: "th" },
  { code: "vi", label: "Vietnamese", displayName: "Tiếng Việt (Vietnamese)", countryCode: "vn" },
  {
    code: "id",
    label: "Indonesian",
    displayName: "Bahasa Indonesia (Indonesian)",
    countryCode: "id",
  },
  { code: "hi", label: "Hindi", displayName: "हिन्दी (Hindi)", countryCode: "in" },
  {
    code: "tl",
    label: "Filipino",
    displayName: "Filipino / Tagalog",
    countryCode: "ph",
  },
  { code: "bn", label: "Bengali", displayName: "বাংলা (Bengali)", countryCode: "bd" },
  { code: "ta", label: "Tamil", displayName: "தமிழ் (Tamil)", countryCode: "in" },
  { code: "ar", label: "Arabic", displayName: "العربية (Arabic)", countryCode: "sa", rtl: true },
  { code: "he", label: "Hebrew", displayName: "עברית (Hebrew)", countryCode: "il", rtl: true },
  { code: "ur", label: "Urdu", displayName: "اردو (Urdu)", countryCode: "pk", rtl: true },
  { code: "ru", label: "Russian", displayName: "Русский (Russian)", countryCode: "ru" },
];

export const LOCALE_INDEX: Map<LocaleCode, LocaleMeta> = new Map(
  LOCALES.map((l) => [l.code, l]),
);

export const DEFAULT_LOCALE: LocaleCode = "en";

export function isLocaleCode(v: string): v is LocaleCode {
  return LOCALE_INDEX.has(v as LocaleCode);
}
