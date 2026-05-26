// Dropdown for the Localization page's storefront-language picker. Custom
// (not Polaris <s-select>) because:
//   1. We need to render an <img> flag inline with each option — Polaris
//      select children are flat text only.
//   2. On the free plan we want merchants to still be able to OPEN the
//      dropdown and see what languages are available ("window shop"),
//      even though they can't pick one. Polaris <s-select disabled>
//      blocks opening entirely.
//
// Flag images come from flagcdn.com (free CDN). Same pattern as
// profit-tracker's CurrencySelect — no NPM package needed, just an
// <img> with a country code in the URL.
//
// The dropdown is portaled into document.body with position:fixed so it
// escapes any clipping ancestor (Polaris s-section clips overflow).

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  LOCALES,
  LOCALE_INDEX,
  type LocaleCode,
  type LocaleMeta,
} from "../lib/localization-locales";

function flagSrc(countryCode: string, size: 24 | 48 = 24): string {
  const dims = size === 24 ? "24x18" : "48x36";
  return `https://flagcdn.com/${dims}/${countryCode.toLowerCase()}.png`;
}

export interface LocalePickerProps {
  value: LocaleCode;
  onChange: (next: LocaleCode) => void;
  /** When true, the dropdown still opens but clicking an option is a
   *  no-op (the merchant can browse the language list but can't change
   *  the active locale). Used on the free plan. */
  readOnly?: boolean;
}

const DROPDOWN_WIDTH = 320;
const DROPDOWN_MAX_HEIGHT = 360;
const GAP = 6;

export default function LocalePicker({
  value,
  onChange,
  readOnly,
}: LocalePickerProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const reposition = () => {
    const btn = buttonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const viewportH =
      window.innerHeight || document.documentElement.clientHeight;
    const spaceBelow = viewportH - r.bottom;
    const top =
      spaceBelow >= DROPDOWN_MAX_HEIGHT + GAP
        ? r.bottom + GAP
        : Math.max(8, r.top - DROPDOWN_MAX_HEIGHT - GAP);
    const width = Math.max(DROPDOWN_WIDTH, r.width);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPos({ top, left, width });
  };

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        buttonRef.current &&
        !buttonRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    const onScrollOrResize = () => reposition();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDocClick);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current: LocaleMeta = LOCALE_INDEX.get(value) ?? LOCALES[0];

  const dropdown =
    open && pos
      ? createPortal(
          <div
            ref={dropdownRef}
            role="listbox"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              maxHeight: DROPDOWN_MAX_HEIGHT,
              overflowY: "auto",
              background: "#ffffff",
              border: "1px solid #e1e3e5",
              borderRadius: 8,
              boxShadow: "0 8px 24px rgba(17,24,39,0.18)",
              padding: 6,
              zIndex: 2147483600,
              fontFamily:
                "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            }}
          >
            {LOCALES.map((l) => {
              const selected = l.code === value;
              return (
                <button
                  key={l.code}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    if (readOnly) return;
                    onChange(l.code);
                    setOpen(false);
                  }}
                  title={
                    readOnly
                      ? "Available on paid plans"
                      : "Use " + l.label
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    textAlign: "left",
                    background: selected ? "#f1f8f5" : "transparent",
                    border: "none",
                    padding: "8px 10px",
                    cursor: readOnly ? "not-allowed" : "pointer",
                    fontFamily: "inherit",
                    fontSize: 13,
                    color: readOnly ? "#6d7175" : "#202223",
                    borderRadius: 6,
                  }}
                  onMouseEnter={(e) => {
                    if (!selected)
                      e.currentTarget.style.background = "#f6f6f7";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = selected
                      ? "#f1f8f5"
                      : "transparent";
                  }}
                >
                  <img
                    src={flagSrc(l.countryCode, 24)}
                    width={24}
                    height={18}
                    alt=""
                    style={{
                      flexShrink: 0,
                      borderRadius: 2,
                      border: "1px solid #e1e3e5",
                    }}
                  />
                  <span style={{ flex: 1 }}>{l.displayName}</span>
                  {l.rtl ? (
                    <span
                      style={{
                        fontSize: 10,
                        color: "#6d7175",
                        background: "#f6f6f7",
                        padding: "2px 6px",
                        borderRadius: 4,
                      }}
                    >
                      RTL
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          background: "#ffffff",
          border: "1px solid #c9cccf",
          borderRadius: 8,
          fontFamily: "inherit",
          fontSize: 14,
          color: "#202223",
          cursor: "pointer",
          minWidth: 280,
          textAlign: "left",
        }}
      >
        <img
          src={flagSrc(current.countryCode, 24)}
          width={24}
          height={18}
          alt=""
          style={{
            flexShrink: 0,
            borderRadius: 2,
            border: "1px solid #e1e3e5",
          }}
        />
        <span style={{ flex: 1 }}>{current.displayName}</span>
        <span
          aria-hidden="true"
          style={{
            color: "#6d7175",
            fontSize: 12,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s ease",
          }}
        >
          ▾
        </span>
      </button>
      {dropdown}
    </>
  );
}
