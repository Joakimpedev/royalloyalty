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
 * Polaris page-chrome breadcrumb back link with App Bridge interception.
 *
 * `<s-link slot="breadcrumbActions">` is the documented Polaris pattern for
 * the back arrow next to the page heading, but every other body <s-link>
 * in this codebase does a full iframe reload that breaks auth (see
 * app/lib/NAVIGATION-AUDIT.md). To be safe, we intercept the click here
 * with preventDefault + useAppNavigate so it always routes through React
 * Router, regardless of what the slot does internally.
 */
export function BreadcrumbBackLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  const nav = useAppNavigate();
  return (
    // @ts-expect-error - s-link custom element JSX types
    <s-link
      slot="breadcrumbActions"
      href={href}
      onClick={(e: Event) => {
        e.preventDefault?.();
        nav(href);
      }}
    >
      {label}
    </s-link>
  );
}
