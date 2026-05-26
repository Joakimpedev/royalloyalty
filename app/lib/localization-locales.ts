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
  rtl?: boolean;
}

export const LOCALES: LocaleMeta[] = [
  { code: "en", label: "English", displayName: "English" },
  { code: "es", label: "Spanish", displayName: "Español (Spanish)" },
  { code: "fr", label: "French", displayName: "Français (French)" },
  { code: "de", label: "German", displayName: "Deutsch (German)" },
  { code: "it", label: "Italian", displayName: "Italiano (Italian)" },
  {
    code: "pt-BR",
    label: "Portuguese (Brazil)",
    displayName: "Português — Brasil",
  },
  { code: "nl", label: "Dutch", displayName: "Nederlands (Dutch)" },
  { code: "pl", label: "Polish", displayName: "Polski (Polish)" },
  { code: "cs", label: "Czech", displayName: "Čeština (Czech)" },
  { code: "el", label: "Greek", displayName: "Ελληνικά (Greek)" },
  { code: "tr", label: "Turkish", displayName: "Türkçe (Turkish)" },
  {
    code: "nb",
    label: "Norwegian (Bokmål)",
    displayName: "Norsk bokmål (Norwegian)",
  },
  { code: "sv", label: "Swedish", displayName: "Svenska (Swedish)" },
  { code: "da", label: "Danish", displayName: "Dansk (Danish)" },
  { code: "fi", label: "Finnish", displayName: "Suomi (Finnish)" },
  { code: "is", label: "Icelandic", displayName: "Íslenska (Icelandic)" },
  { code: "hu", label: "Hungarian", displayName: "Magyar (Hungarian)" },
  { code: "ro", label: "Romanian", displayName: "Română (Romanian)" },
  { code: "uk", label: "Ukrainian", displayName: "Українська (Ukrainian)" },
  { code: "ja", label: "Japanese", displayName: "日本語 (Japanese)" },
  {
    code: "zh-CN",
    label: "Chinese (Simplified)",
    displayName: "简体中文 (Simplified Chinese)",
  },
  {
    code: "zh-TW",
    label: "Chinese (Traditional)",
    displayName: "繁體中文 (Traditional Chinese)",
  },
  { code: "ko", label: "Korean", displayName: "한국어 (Korean)" },
  { code: "th", label: "Thai", displayName: "ไทย (Thai)" },
  { code: "vi", label: "Vietnamese", displayName: "Tiếng Việt (Vietnamese)" },
  {
    code: "id",
    label: "Indonesian",
    displayName: "Bahasa Indonesia (Indonesian)",
  },
  { code: "hi", label: "Hindi", displayName: "हिन्दी (Hindi)" },
  {
    code: "tl",
    label: "Filipino",
    displayName: "Filipino / Tagalog",
  },
  { code: "bn", label: "Bengali", displayName: "বাংলা (Bengali)" },
  { code: "ta", label: "Tamil", displayName: "தமிழ் (Tamil)" },
  { code: "ar", label: "Arabic", displayName: "العربية (Arabic)", rtl: true },
  { code: "he", label: "Hebrew", displayName: "עברית (Hebrew)", rtl: true },
  { code: "ur", label: "Urdu", displayName: "اردو (Urdu)", rtl: true },
  { code: "ru", label: "Russian", displayName: "Русский (Russian)" },
];

export const LOCALE_INDEX: Map<LocaleCode, LocaleMeta> = new Map(
  LOCALES.map((l) => [l.code, l]),
);

export const DEFAULT_LOCALE: LocaleCode = "en";

export function isLocaleCode(v: string): v is LocaleCode {
  return LOCALE_INDEX.has(v as LocaleCode);
}
