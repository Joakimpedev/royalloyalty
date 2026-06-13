// Design tokens for the Royal Loyalty in-app support module (FAQ help page,
// support bubble, contact modal, and support-ticket emails). Kept separate
// from app/lib/tokens.ts (which handles {{token}} substitution) — this file
// is the brand palette for the support UI only.
//
// Brand: deep navy anchor + warm gold accent — matches the Royal family.
// The customer-facing storefront widget has its own merchant-customizable
// theme; do NOT use these tokens for storefront HTML.

export const C = {
  // ── Brand palette ─────────────────────────────────────────────────────────
  navyDark:  "#0F1729", // deepest, gradient start / hero
  navy:      "#1B2547", // primary brand anchor
  navyDeep:  "#131B36", // hover / darker variant
  navyMid:   "#2A3868", // lighter navy, secondary surfaces
  navyFaint: "#EEF1F8", // very faint navy tint, info backgrounds
  navyRgb:   "27, 37, 71",

  gold:      "#F2B821", // brand accent, highlights, callouts
  goldSoft:  "#FFD86B", // lighter gold
  goldDeep:  "#C68B0F", // darker gold
  goldFaint: "#FFF6DC", // faint gold background

  // ── Semantic aliases ──────────────────────────────────────────────────────
  accent:      "#1B2547",
  accentHover: "#131B36",
  accentMid:   "#F2B821",
  accentFaint: "#FFFAEB",
  accentRgb:   "27, 37, 71",

  // Gradient ramps. Dark = hero/header surface; bright = primary CTA.
  gradientDark:   "linear-gradient(135deg, #0F1729 0%, #1B2547 100%)",
  gradientBright: "linear-gradient(90deg, #1B2547 0%, #F2B821 100%)",

  // ── Neutrals ──────────────────────────────────────────────────────────────
  text:       "#111827",
  muted:      "#6b7280",
  border:     "#e5e7eb",
  surface:    "#ffffff",
  surfaceSub: "#f9fafb",

  green:      "#059669",
  greenFaint: "#d1fae5",
  red:        "#dc2626",
  redFaint:   "#fee2e2",
};

export const RADIUS = {
  input: 8,
  card: 12,
  modal: 14,
};

export const SHADOW = {
  card: "0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
  modal: "0 10px 30px rgba(17,24,39,0.18), 0 2px 8px rgba(17,24,39,0.08)",
};
