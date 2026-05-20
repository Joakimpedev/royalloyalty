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
 * Body-level page title for sub-pages: back-arrow button + bold heading on
 * one row, optional subtitle paragraph below.
 *
 * Composed entirely from Polaris primitives that pass the
 * `validate_component_codeblocks` MCP validator:
 *   - <s-stack direction="block">   vertical wrapper
 *   - <s-stack direction="inline">  horizontal row (button + heading)
 *   - <s-button variant="tertiary" icon="arrow-left">  the back arrow
 *   - <s-heading>                  the title text
 *   - <s-paragraph>                the subtitle
 *
 * No raw <div> wrappers. The previous version used a <div> as the outer
 * container and <s-page> rendered it as empty / invisible — likely because
 * <s-page> filters its children to Polaris primitives and discards plain
 * HTML elements. Keeping every node as a registered Polaris custom element
 * means <s-page> sees them as valid children.
 *
 * The button's onClick goes through useAppNavigate so the iframe and the
 * embedded session stay alive (App Bridge-aware client-side nav).
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
    // @ts-expect-error - s-stack custom element JSX types
    <s-stack direction="block" gap="small-200">
      {/* @ts-expect-error - s-stack custom element JSX types */}
      <s-stack direction="inline" gap="small-300" alignItems="center">
        {backHref && (
          // @ts-expect-error - s-button custom element JSX types
          <s-button
            variant="tertiary"
            icon="arrow-left"
            onClick={() => nav(backHref)}
            accessibilityLabel="Back"
          ></s-button>
        )}
        {/* @ts-expect-error - s-heading custom element JSX types */}
        <s-heading>{title}</s-heading>
        {/* @ts-expect-error - s-stack custom element JSX types */}
      </s-stack>
      {subtitle && (
        // @ts-expect-error - s-paragraph custom element JSX types
        <s-paragraph>{subtitle}</s-paragraph>
      )}
      {/* @ts-expect-error - s-stack custom element JSX types */}
    </s-stack>
  );
}
