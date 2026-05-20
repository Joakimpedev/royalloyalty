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
 * Polaris page-chrome breadcrumb back link.
 *
 * Slot naming: Polaris React-prop is `breadcrumbActions` (camelCase) but the
 * actual DOM slot attribute is **kebab-case** — same convention as
 * `primary-action`, which is the working reference in this codebase. Passing
 * `slot="breadcrumbActions"` silently fails (the link falls out of the
 * chrome slot and renders as plain inline text in the page body).
 *
 * The click is also intercepted with preventDefault + useAppNavigate so the
 * iframe (and the embedded session) stays alive regardless of whether
 * Shopify's page chrome would have handled it natively — every other body
 * `<s-link>` in this codebase full-reloads the iframe and breaks auth (see
 * app/lib/NAVIGATION-AUDIT.md).
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
      slot="breadcrumb-actions"
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
