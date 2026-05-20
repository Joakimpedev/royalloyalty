// React 18 + Polaris Web Components glue.
//
// React 18 doesn't set non-string JSX props as PROPERTIES on custom
// elements — it serializes everything as string ATTRIBUTES. That breaks any
// Polaris control whose state lives on an array or object property:
//
//   <s-choice-list values={["increments"]}>   // becomes values="increments"
//                                             // (attribute), element expects
//                                             // an array property
//
// React 19 fixes this, but the project is on 18 (see package.json), so we
// need an imperative ref + useEffect to set the property on the actual DOM
// node. That's what <ChoiceList /> below does. Use it anywhere a
// choice-list selection is controlled by React state.

import { useEffect, useRef, type ReactNode } from "react";
import { useAppNavigate } from "./app-navigate";

type ChoiceListProps = {
  label: string;
  value: string;
  onChange: (next: string) => void;
  children: ReactNode;
};

/**
 * Controlled single-select Polaris choice-list that survives React 18's
 * custom-element prop serialization. Pass the currently-selected `value`;
 * `onChange` fires with the newly-selected value when the merchant clicks
 * a choice. Children are the `<s-choice value="...">` items.
 */
export function ChoiceList({
  label,
  value,
  onChange,
  children,
}: ChoiceListProps) {
  const ref = useRef<HTMLElement | null>(null);

  // Set the `values` array as a PROPERTY (not attribute) on the underlying
  // custom element every time `value` changes. React 18 would otherwise
  // stringify the array to "increments" / "fixed" / etc. — useless to the
  // element's setter, which expects string[].
  useEffect(() => {
    const el = ref.current as (HTMLElement & { values?: string[] }) | null;
    if (el) el.values = [value];
  }, [value]);

  return (
    // @ts-expect-error - s-choice-list custom element JSX types
    <s-choice-list
      ref={ref}
      label={label}
      onChange={(e: any) => {
        const vs = (e.target?.values as string[] | undefined) ?? [];
        const next = vs[0] ?? "";
        if (next && next !== value) onChange(next);
      }}
    >
      {children}
    </s-choice-list>
  );
}

/**
 * Body-level page title: a left-arrow icon (Polaris `arrow-left`) + bold
 * heading on one row, optional subtitle underneath. This is what Essent
 * uses on its per-rule pages and what the user has asked for — a TITLE in
 * the iframe body, not in the Shopify chrome bar at the top.
 *
 * Why a body title and not <s-page heading=...>:
 *   <s-page heading> renders the title in Shopify's outer admin chrome bar
 *   (small text next to the app icon). It's fine for accessibility but it
 *   is NOT the prominent page-title look the Essent reference shows.
 *   Polaris-Web doesn't ship a "page header" component, so we compose one
 *   from primitives that ARE in the library: s-icon + s-heading + s-text.
 *
 * Why a plain <button> for the back trigger:
 *   We want a minimal icon-only click target (no Polaris button frame
 *   around it). s-clickable would also work but adds its own padding /
 *   default appearance. A native <button styled transparent> renders the
 *   bare s-icon cleanly. The click goes through useAppNavigate so the
 *   iframe (and the embedded session) stays alive.
 */
export function PageTitle({
  title,
  subtitle,
  backHref,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
}) {
  const nav = useAppNavigate();
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {backHref && (
          <button
            type="button"
            onClick={() => nav(backHref)}
            aria-label="Back"
            style={{
              background: "transparent",
              border: 0,
              padding: 4,
              margin: 0,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#202223",
              font: "inherit",
              lineHeight: 0,
            }}
          >
            {/* @ts-expect-error - s-icon custom element JSX types */}
            <s-icon type="arrow-left" />
          </button>
        )}
        {/* @ts-expect-error - s-heading custom element JSX types */}
        <s-heading>{title}</s-heading>
      </div>
      {subtitle && (
        <div
          style={{
            marginTop: 4,
            marginLeft: backHref ? 32 : 0,
            color: "#6d7175",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}
