// Royal Loyalty — color picker popover.
//
// Replaces a plain hex text field on the Branding page with a Shopify-admin-
// style picker: a saturation/value 2D area, a hue slider, a hex input, and
// a circular swatch trigger that shows the current color. Always emits
// 6-digit #RRGGBB — alpha isn't needed for loyalty branding (widget / page /
// email previews render colors as solid fills).
//
// Adapted from the stitch-bundles ColorPicker. Brand palette replaced with
// neutral Polaris grays; alpha slider stripped.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const C = {
  border: "#e1e3e5",
  ink: "#202223",
  inkSecondary: "#6d7175",
};

// ── Color math ────────────────────────────────────────────────────────

interface HSV { h: number; s: number; v: number }
interface RGB { r: number; g: number; b: number }

function hexToRgb(hex: string): RGB {
  const clean = hex.replace(/^#/, "").trim();
  let r = 0, g = 0, b = 0;
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16);
    g = parseInt(clean[1] + clean[1], 16);
    b = parseInt(clean[2] + clean[2], 16);
  } else if (clean.length >= 6) {
    r = parseInt(clean.slice(0, 2), 16);
    g = parseInt(clean.slice(2, 4), 16);
    b = parseInt(clean.slice(4, 6), 16);
  }
  return { r, g, b };
}

function rgbToHex({ r, g, b }: RGB): string {
  const h = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function rgbToHsv({ r, g, b }: RGB): HSV {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return { h, s, v };
}

function hsvToRgb({ h, s, v }: HSV): RGB {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0, gp = 0, bp = 0;
  if (h < 60) { rp = c; gp = x; }
  else if (h < 120) { rp = x; gp = c; }
  else if (h < 180) { gp = c; bp = x; }
  else if (h < 240) { gp = x; bp = c; }
  else if (h < 300) { rp = x; bp = c; }
  else { rp = c; bp = x; }
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

// ── Picker ────────────────────────────────────────────────────────────

export interface ColorPickerProps {
  value: string;
  onChange: (next: string) => void;
  label?: string;
}

export default function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const popH = 220;
      const flipUp = r.bottom + popH > window.innerHeight && r.top > popH;
      setPos({
        top: flipUp ? r.top + window.scrollY - popH - 6 : r.bottom + window.scrollY + 6,
        left: r.left + window.scrollX,
      });
    };
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <span style={{ position: "relative", display: "inline-flex", width: "100%" }}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label ?? "Pick color"}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "#ffffff",
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          padding: "4px 10px",
          height: 32,
          width: "100%",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 20,
            height: 20,
            borderRadius: 999,
            border: "1px solid rgba(0,0,0,0.1)",
            background: value,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            color: C.inkSecondary,
            fontSize: 12,
            fontFamily: "monospace",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flex: 1,
            textAlign: "left",
          }}
        >
          {value.toUpperCase()}
        </span>
      </button>
      {open && pos
        ? createPortal(
            <PickerPopover
              containerRef={popoverRef}
              value={value}
              onChange={onChange}
              top={pos.top}
              left={pos.left}
            />,
            document.body,
          )
        : null}
    </span>
  );
}

const PickerPopover = ({
  value,
  onChange,
  containerRef,
  top,
  left,
}: {
  value: string;
  onChange: (next: string) => void;
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  top: number;
  left: number;
}) => {
  const initialRgb = useMemo(() => hexToRgb(value), [value]);
  const [hsv, setHsv] = useState<HSV>(() => rgbToHsv(initialRgb));
  const [hexInput, setHexInput] = useState(value.toUpperCase());

  // Refs holding the latest hsv so slider drag handlers always read the
  // newest values (their listeners are bound once on mount and would
  // otherwise capture the first-render closure).
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;

  useEffect(() => {
    const p = hexToRgb(value);
    setHsv(rgbToHsv(p));
    setHexInput(value.toUpperCase());
  }, [value]);

  const emit = (next: HSV) => {
    onChange(rgbToHex(hsvToRgb(next)));
  };

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Color picker"
      style={{
        position: "absolute",
        top,
        left,
        background: "#ffffff",
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: 10,
        boxShadow: "0 8px 24px rgba(17,24,39,0.12)",
        zIndex: 9999,
        width: 232,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <div style={{ display: "flex", gap: 8 }}>
        <SaturationValueArea
          hue={hsv.h}
          s={hsv.s}
          v={hsv.v}
          onChange={(s, v) => {
            const next: HSV = { h: hsvRef.current.h, s, v };
            setHsv(next);
            emit(next);
          }}
        />
        <HueSlider
          hue={hsv.h}
          onChange={(h) => {
            const next: HSV = { h, s: hsvRef.current.s, v: hsvRef.current.v };
            setHsv(next);
            emit(next);
          }}
        />
      </div>
      <input
        type="text"
        value={hexInput}
        onChange={(e) => setHexInput(e.currentTarget.value)}
        onBlur={() => {
          const v = hexInput.trim();
          const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(v);
          if (!m) {
            setHexInput(value.toUpperCase());
            return;
          }
          const normalized = `#${m[1]}`.toUpperCase();
          const p = hexToRgb(normalized);
          setHsv(rgbToHsv(p));
          onChange(rgbToHex(p));
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
        }}
        style={{
          padding: "6px 10px",
          fontSize: 12,
          fontFamily: "monospace",
          border: `1px solid ${C.border}`,
          borderRadius: 6,
          outline: "none",
          color: C.ink,
          background: "#ffffff",
        }}
      />
    </div>
  );
};

function SaturationValueArea({
  hue, s, v, onChange,
}: { hue: number; s: number; v: number; onChange: (s: number, v: number) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  const apply = (clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ns = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const nv = 1 - Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    onChange(ns, nv);
  };

  useEffect(() => {
    const move = (e: MouseEvent) => { if (dragging.current) apply(e.clientX, e.clientY); };
    const up = () => { dragging.current = false; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  const baseHueColor = rgbToHex(hsvToRgb({ h: hue, s: 1, v: 1 }));

  return (
    <div
      ref={ref}
      onMouseDown={(e) => { dragging.current = true; apply(e.clientX, e.clientY); }}
      style={{
        position: "relative",
        flex: 1,
        height: 140,
        borderRadius: 6,
        cursor: "crosshair",
        background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${baseHueColor})`,
        border: "1px solid rgba(0,0,0,0.06)",
        userSelect: "none",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: `calc(${s * 100}% - 7px)`,
          top: `calc(${(1 - v) * 100}% - 7px)`,
          width: 14,
          height: 14,
          borderRadius: 999,
          border: "2px solid #ffffff",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

function HueSlider({ hue, onChange }: { hue: number; onChange: (h: number) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const dragging = useRef(false);

  const apply = (clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    onChange(ratio * 360);
  };

  useEffect(() => {
    const move = (e: MouseEvent) => { if (dragging.current) apply(e.clientY); };
    const up = () => { dragging.current = false; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  return (
    <div
      ref={ref}
      onMouseDown={(e) => { dragging.current = true; apply(e.clientY); }}
      style={{
        position: "relative",
        width: 14,
        height: 140,
        borderRadius: 6,
        cursor: "pointer",
        background:
          "linear-gradient(to bottom, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)",
        border: "1px solid rgba(0,0,0,0.06)",
        userSelect: "none",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: -3,
          right: -3,
          top: `calc(${(hue / 360) * 100}% - 4px)`,
          height: 8,
          border: "2px solid #ffffff",
          borderRadius: 4,
          boxShadow: "0 0 0 1px rgba(0,0,0,0.4)",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}
