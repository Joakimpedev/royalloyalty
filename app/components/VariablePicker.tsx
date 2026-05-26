// Small "{}" button rendered inline with a text-field's label. Clicking it
// opens a categorized dropdown of tokens like {{points}}; clicking a token
// fires `onPick(literalToken)` which the caller appends to the field's
// current value. Mirrors stitch-bundles' VariablePicker shape.
//
// The dropdown is portaled into document.body and positioned with
// position:fixed against the trigger button's bounding rect — Polaris's
// s-section clips overflow, so a position:absolute dropdown nested under
// the trigger would get cropped at the card edge. The portal escapes that.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { VariableGroup } from "../lib/tokens";

export interface VariablePickerProps {
  onPick: (token: string) => void;
  groups: VariableGroup[];
  /** Disabled state — matches the parent input's disabled flag. */
  disabled?: boolean;
}

const DROPDOWN_WIDTH = 260;
const DROPDOWN_MAX_HEIGHT = 360;
const GAP = 6;

export default function VariablePicker({
  onPick,
  groups,
  disabled,
}: VariablePickerProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Compute fixed position based on the trigger button's bounding rect.
  // Pinned to the right edge of the trigger, with a small downward gap.
  // Falls back to opening UPWARD when there isn't enough room below
  // (e.g. trigger is near the bottom of the viewport).
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
    const left = Math.max(8, r.right - DROPDOWN_WIDTH);
    setPos({ top, left });
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

  const dropdown =
    open && pos
      ? createPortal(
          <div
            ref={dropdownRef}
            role="menu"
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: DROPDOWN_WIDTH,
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
            <div
              style={{
                padding: "8px 10px 6px",
                color: "#202223",
                fontSize: 12,
                fontWeight: 600,
                borderBottom: "1px solid #e1e3e5",
                marginBottom: 4,
              }}
            >
              Insert variable
            </div>
            {groups.map((g) => (
              <div key={g.title} style={{ marginBottom: 4 }}>
                <div
                  style={{
                    padding: "6px 10px 2px",
                    color: "#6d7175",
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {g.title}
                </div>
                {g.tokens.map((t) => (
                  <button
                    key={t.token}
                    type="button"
                    onClick={() => {
                      if (disabled) return;
                      onPick(t.token);
                      setOpen(false);
                    }}
                    title={
                      disabled
                        ? "Available on paid plans"
                        : "Insert " + t.token
                    }
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      width: "100%",
                      textAlign: "left",
                      background: "transparent",
                      border: "none",
                      padding: "6px 10px",
                      cursor: disabled ? "not-allowed" : "pointer",
                      fontFamily: "inherit",
                      fontSize: 13,
                      color: disabled ? "#8c9196" : "#202223",
                      borderRadius: 4,
                    }}
                    onMouseEnter={(e) => {
                      if (!disabled)
                        e.currentTarget.style.background = "#f6f6f7";
                    }}
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "transparent")
                    }
                  >
                    <span>{t.label}</span>
                    <code
                      style={{
                        fontSize: 11,
                        color: disabled ? "#8c9196" : "#6b3eb8",
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                      }}
                    >
                      {t.token}
                    </code>
                  </button>
                ))}
              </div>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <span style={{ display: "inline-block" }}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Insert variable"
        aria-expanded={open}
        title="Insert variable"
        style={{
          background: "transparent",
          border: "none",
          padding: 2,
          cursor: "pointer",
          color: "#6b3eb8",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
          fontWeight: 800,
          fontSize: 14,
          lineHeight: 1,
        }}
      >
        {"{}"}
      </button>
      {dropdown}
    </span>
  );
}
