// Small "{}" button rendered inline with a text-field's label. Clicking it
// opens a categorized dropdown of tokens like {{points}}; clicking a token
// fires `onPick(literalToken)` which the caller appends to the field's
// current value. Mirrors stitch-bundles' VariablePicker shape so the UX
// is consistent if a merchant uses both apps.

import { useEffect, useRef, useState } from "react";
import type { VariableGroup } from "../lib/tokens";

export interface VariablePickerProps {
  onPick: (token: string) => void;
  groups: VariableGroup[];
  /** Disabled state — matches the parent input's disabled flag. */
  disabled?: boolean;
}

export default function VariablePicker({
  onPick,
  groups,
  disabled,
}: VariablePickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        wrapRef.current &&
        !wrapRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", onDocClick);
    return () => window.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", display: "inline-block" }}
    >
      <button
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
      {open ? (
        <div
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 6,
            background: "#ffffff",
            border: "1px solid #e1e3e5",
            borderRadius: 8,
            boxShadow: "0 8px 24px rgba(17,24,39,0.10)",
            padding: 6,
            minWidth: 240,
            maxHeight: 360,
            overflowY: "auto",
            zIndex: 50,
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
        </div>
      ) : null}
    </div>
  );
}
