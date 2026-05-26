// Tiny padlock icon with a "Available for paid plans" tooltip on hover/focus.
// Rendered next to copy fields that are gated behind a paid plan, so the
// merchant understands why the input is disabled. Lives next to the field
// label (not inside the input) to match the Branding page convention.

import { useState } from "react";

export default function LockedHint() {
  const [show, setShow] = useState(false);
  return (
    <span
      role="note"
      aria-label="Available for paid plans"
      tabIndex={0}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        color: "#8c9196",
        cursor: "help",
        lineHeight: 0,
        outline: "none",
      }}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M10 1a4 4 0 0 1 4 4v2h1.5A1.5 1.5 0 0 1 17 8.5v8A1.5 1.5 0 0 1 15.5 18h-11A1.5 1.5 0 0 1 3 16.5v-8A1.5 1.5 0 0 1 4.5 7H6V5a4 4 0 0 1 4-4Zm0 2a2 2 0 0 0-2 2v2h4V5a2 2 0 0 0-2-2Z" />
      </svg>
      <span
        role="tooltip"
        style={{
          position: "absolute",
          bottom: "calc(100% + 8px)",
          left: "50%",
          transform: `translateX(-50%) translateY(${show ? 0 : 4}px)`,
          background: "#1a1c1d",
          color: "#fff",
          padding: "6px 10px",
          borderRadius: 6,
          fontSize: 12,
          lineHeight: 1.4,
          fontWeight: 400,
          width: 160,
          textAlign: "center",
          opacity: show ? 1 : 0,
          pointerEvents: "none",
          transition: "opacity 120ms ease, transform 120ms ease",
          boxShadow: "0 2px 10px rgba(0,0,0,0.18)",
          zIndex: 100,
          whiteSpace: "normal",
        }}
      >
        Available for paid plans
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: "100%",
            left: "50%",
            transform: "translateX(-50%)",
            width: 0,
            height: 0,
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderTop: "5px solid #1a1c1d",
          }}
        />
      </span>
    </span>
  );
}
