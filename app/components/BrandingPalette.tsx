// Industry-themed palette presets for the loyalty widget. One-click sets both
// primary (background / accent) and secondary (text on primary) — the merchant
// can still hex-tune below. Used in /app/branding and in the onboarding wizard.
//
// Restrained Polaris-native palette set; we deliberately avoid BON's pink-
// dominant identity so the admin reads as a tool, not a brand.

import { useId } from "react";

export type PalettePreset = {
  id: string;
  label: string;
  primary: string;
  secondary: string;
};

export const PALETTE_PRESETS: PalettePreset[] = [
  // Apparel (near-black on off-white) is the implicit default — neutral
  // enough to work for almost any store. The previous brown "Default" was
  // dropped because it visually overlapped with "Pets" and looked dated
  // against most storefronts.
  { id: "apparel", label: "Apparel", primary: "#2C2A29", secondary: "#F0EBE3" },
  { id: "beauty", label: "Beauty & wellness", primary: "#6B4F60", secondary: "#F4E8E8" },
  { id: "food", label: "Food & drink", primary: "#A03A2A", secondary: "#F5E1D2" },
  { id: "home", label: "Home & garden", primary: "#3F5E50", secondary: "#E6EBE0" },
  { id: "toys", label: "Toys & hobby", primary: "#2E5B9A", secondary: "#DCE6F0" },
  { id: "health", label: "Health", primary: "#2C7873", secondary: "#D9E8E5" },
  { id: "pets", label: "Pets", primary: "#7A5A3A", secondary: "#F0E5D2" },
  { id: "sports", label: "Sports", primary: "#E87722", secondary: "#1A1A1A" },
  { id: "arts", label: "Art & entertainment", primary: "#4E2C66", secondary: "#E8DCEC" },
];

export function findPreset(
  primary: string,
  secondary: string,
): PalettePreset | undefined {
  const p = primary.toLowerCase();
  const s = secondary.toLowerCase();
  return PALETTE_PRESETS.find(
    (preset) =>
      preset.primary.toLowerCase() === p &&
      preset.secondary.toLowerCase() === s,
  );
}

export function BrandingPalette({
  primary,
  secondary,
  onSelect,
}: {
  primary: string;
  secondary: string;
  onSelect: (preset: PalettePreset) => void;
}) {
  const groupId = useId();
  const active = findPreset(primary, secondary)?.id;

  return (
    <div
      role="radiogroup"
      aria-labelledby={`${groupId}-label`}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: 10,
      }}
    >
      {PALETTE_PRESETS.map((preset) => {
        const selected = preset.id === active;
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect(preset)}
            style={{
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              gap: 6,
              padding: 8,
              border: selected
                ? "2px solid #2c6ecb"
                : "1px solid #d1d5db",
              borderRadius: 8,
              background: "#fff",
              textAlign: "left",
              font: "inherit",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                height: 36,
                borderRadius: 6,
                background: `linear-gradient(135deg, ${preset.primary} 0%, ${preset.primary} 60%, ${preset.secondary} 60%, ${preset.secondary} 100%)`,
              }}
            />
            <div style={{ fontSize: 12, fontWeight: 500, color: "#202223" }}>
              {preset.label}
            </div>
          </button>
        );
      })}
    </div>
  );
}
