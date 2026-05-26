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
  /** Unicode flag emoji prefixed in the picker. */
  flag: string;
  rtl?: boolean;
}

export const LOCALES: LocaleMeta[] = [
  { code: "en", label: "English", displayName: "English", flag: "🇬🇧" },
  { code: "es", label: "Spanish", displayName: "Español (Spanish)", flag: "🇪🇸" },
  { code: "fr", label: "French", displayName: "Français (French)", flag: "🇫🇷" },
  { code: "de", label: "German", displayName: "Deutsch (German)", flag: "🇩🇪" },
  { code: "it", label: "Italian", displayName: "Italiano (Italian)", flag: "🇮🇹" },
  {
    code: "pt-BR",
    label: "Portuguese (Brazil)",
    displayName: "Português — Brasil",
    flag: "🇧🇷",
  },
  { code: "nl", label: "Dutch", displayName: "Nederlands (Dutch)", flag: "🇳🇱" },
  { code: "pl", label: "Polish", displayName: "Polski (Polish)", flag: "🇵🇱" },
  { code: "cs", label: "Czech", displayName: "Čeština (Czech)", flag: "🇨🇿" },
  { code: "el", label: "Greek", displayName: "Ελληνικά (Greek)", flag: "🇬🇷" },
  { code: "tr", label: "Turkish", displayName: "Türkçe (Turkish)", flag: "🇹🇷" },
  {
    code: "nb",
    label: "Norwegian (Bokmål)",
    displayName: "Norsk bokmål (Norwegian)",
    flag: "🇳🇴",
  },
  { code: "sv", label: "Swedish", displayName: "Svenska (Swedish)", flag: "🇸🇪" },
  { code: "da", label: "Danish", displayName: "Dansk (Danish)", flag: "🇩🇰" },
  { code: "fi", label: "Finnish", displayName: "Suomi (Finnish)", flag: "🇫🇮" },
  { code: "is", label: "Icelandic", displayName: "Íslenska (Icelandic)", flag: "🇮🇸" },
  { code: "hu", label: "Hungarian", displayName: "Magyar (Hungarian)", flag: "🇭🇺" },
  { code: "ro", label: "Romanian", displayName: "Română (Romanian)", flag: "🇷🇴" },
  { code: "uk", label: "Ukrainian", displayName: "Українська (Ukrainian)", flag: "🇺🇦" },
  { code: "ja", label: "Japanese", displayName: "日本語 (Japanese)", flag: "🇯🇵" },
  {
    code: "zh-CN",
    label: "Chinese (Simplified)",
    displayName: "简体中文 (Simplified Chinese)",
    flag: "🇨🇳",
  },
  {
    code: "zh-TW",
    label: "Chinese (Traditional)",
    displayName: "繁體中文 (Traditional Chinese)",
    flag: "🇹🇼",
  },
  { code: "ko", label: "Korean", displayName: "한국어 (Korean)", flag: "🇰🇷" },
  { code: "th", label: "Thai", displayName: "ไทย (Thai)", flag: "🇹🇭" },
  { code: "vi", label: "Vietnamese", displayName: "Tiếng Việt (Vietnamese)", flag: "🇻🇳" },
  {
    code: "id",
    label: "Indonesian",
    displayName: "Bahasa Indonesia (Indonesian)",
    flag: "🇮🇩",
  },
  { code: "hi", label: "Hindi", displayName: "हिन्दी (Hindi)", flag: "🇮🇳" },
  {
    code: "tl",
    label: "Filipino",
    displayName: "Filipino / Tagalog",
    flag: "🇵🇭",
  },
  { code: "bn", label: "Bengali", displayName: "বাংলা (Bengali)", flag: "🇧🇩" },
  { code: "ta", label: "Tamil", displayName: "தமிழ் (Tamil)", flag: "🇱🇰" },
  { code: "ar", label: "Arabic", displayName: "العربية (Arabic)", flag: "🇸🇦", rtl: true },
  { code: "he", label: "Hebrew", displayName: "עברית (Hebrew)", flag: "🇮🇱", rtl: true },
  { code: "ur", label: "Urdu", displayName: "اردو (Urdu)", flag: "🇵🇰", rtl: true },
  { code: "ru", label: "Russian", displayName: "Русский (Russian)", flag: "🇷🇺" },
];

export const LOCALE_INDEX: Map<LocaleCode, LocaleMeta> = new Map(
  LOCALES.map((l) => [l.code, l]),
);

export const DEFAULT_LOCALE: LocaleCode = "en";

export function isLocaleCode(v: string): v is LocaleCode {
  return LOCALE_INDEX.has(v as LocaleCode);
}
