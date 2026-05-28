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
// Nudge any currently-open App Bridge <ui-save-bar> in the page by adding
// a brief shake animation. Called from the PageTitle back arrow when the
// page is dirty: instead of letting the user navigate away (or blocking
// with a confirm modal), we draw attention to the save bar so they know
// to Save or Discard explicitly.
// Drive App Bridge <ui-save-bar> imperatively (show/hide via ref). The
// declarative `open=` attribute renders the element but App Bridge does
// not register slotted buttons reliably across page mounts, so we keep
// the imperative pattern. The cleanup callback fires `.hide()` whenever
// dirty flips to false AND on unmount, so the bar doesn't linger.
export function useSaveBar(
  ref: React.MutableRefObject<HTMLElement | null>,
  dirty: boolean,
) {
  useEffect(() => {
    const el = ref.current as
      | (HTMLElement & { show?: () => void; hide?: () => void })
      | null;
    if (!el) return;
    if (dirty) el.show?.();
    else el.hide?.();
    return () => {
      try {
        el.hide?.();
      } catch {
        /* element already gone */
      }
    };
  }, [ref, dirty]);
}

// Fire a Polaris/App Bridge toast on successful action. Replaces the
// green <s-banner tone="success"> blocks merchants kept asking us to
// kill — toasts auto-dismiss and don't shove the page content down.
export function useSuccessToast(
  actionData: { ok?: boolean; message?: string } | null | undefined,
  fallback = "Saved.",
): void {
  useEffect(() => {
    if (!actionData?.ok) return;
    try {
      const sh = (window as unknown as {
        shopify?: { toast?: { show?: (msg: string, opts?: object) => void } };
      }).shopify;
      sh?.toast?.show?.(actionData.message ?? fallback, { duration: 3000 });
    } catch {
      /* App Bridge not available — no-op */
    }
  }, [actionData, fallback]);
}

// ---------------------------------------------------------------------------
// Narrow number inputs with inline affixes
// ---------------------------------------------------------------------------
//
// Default `<s-text-field type="number">` stretches the full width of its
// container. That's fine for free-form text but absurd for a percent (max
// 100, 3 digits) or a money amount (almost always under 9999). And it never
// shows the currency / % symbol inline, so the merchant has to read the
// label to know what units they're typing.
//
// PercentField + MoneyField wrap `<s-number-field>` (which natively supports
// `prefix` / `suffix`) with a width-constrained container and the right
// affix derived from the shop's locale + currency. PointsField stays plain
// (points have no symbol) but is also width-capped because point values
// are typically 2–4 digits.


// Always show the 3-letter ISO currency code as a trailing suffix (USD,
// NOK, EUR, JPY, …). The earlier attempt at locale-aware symbol placement
// — leading "$" for USD vs trailing "kr" for NOK via Intl.NumberFormat
// parts — was confusing in practice; merchants told us the consistent
// 3-letter code is clearer than guessing where the glyph belongs per
// locale.
export function moneyAffix(
  currencyCode: string,
  _locale: string,
): { prefix?: string; suffix?: string } {
  return { suffix: currencyCode };
}

function NarrowFieldShell({
  width,
  children,
}: {
  width: number;
  children: ReactNode;
}) {
  // Inline-block so the field can sit next to other inputs in a stack and
  // never stretch past its needed width.
  return (
    <div style={{ display: "inline-block", maxWidth: "100%", width }}>
      {children}
    </div>
  );
}

// `s-number-field` JSX types from @shopify/ui-extensions are strict about
// the onChange event shape and reject our looser `{ target: { value } }`
// signature. Wrap the element with `any` so the wrapper API stays clean
// for callers — same pragma used everywhere else in this file.
const SNumberField = "s-number-field" as unknown as React.FC<any>;

export function PercentField({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  width = 140,
}: {
  label: string;
  value: number | string;
  onChange: (next: string) => void;
  min?: number;
  max?: number;
  step?: number;
  width?: number;
}) {
  return (
    <NarrowFieldShell width={width}>
      <SNumberField
        label={label}
        value={String(value)}
        suffix="%"
        min={min}
        max={max}
        step={step}
        onChange={(e: NumberFieldChangeEvent) => onChange(e.target.value)}
      />
    </NarrowFieldShell>
  );
}

export function MoneyField({
  label,
  value,
  onChange,
  currencyCode,
  locale,
  min = 0,
  step = 0.01,
  width = 200,
}: {
  label: string;
  value: number | string;
  onChange: (next: string) => void;
  currencyCode: string;
  locale: string;
  min?: number;
  step?: number;
  width?: number;
}) {
  const { prefix, suffix } = moneyAffix(currencyCode, locale);
  return (
    <NarrowFieldShell width={width}>
      <SNumberField
        label={label}
        value={String(value)}
        {...(prefix ? { prefix } : {})}
        {...(suffix ? { suffix } : {})}
        min={min}
        step={step}
        onChange={(e: NumberFieldChangeEvent) => onChange(e.target.value)}
      />
    </NarrowFieldShell>
  );
}

export function PointsField({
  label,
  value,
  onChange,
  min = 0,
  step = 1,
  width = 160,
  suffix = "points",
}: {
  label: string;
  value: number | string;
  onChange: (next: string) => void;
  min?: number;
  step?: number;
  width?: number;
  suffix?: string;
}) {
  return (
    <NarrowFieldShell width={width}>
      <SNumberField
        label={label}
        value={String(value)}
        suffix={suffix}
        min={min}
        step={step}
        onChange={(e: NumberFieldChangeEvent) => onChange(e.target.value)}
      />
    </NarrowFieldShell>
  );
}

type NumberFieldChangeEvent = { target: { value: string } };

// Nudge the user when they try to leave with unsaved changes. The
// <ui-save-bar> visible UI lives in App Bridge's parent admin shell
// (outside our iframe), so we can't directly animate it. Instead:
//   1. Pop an App Bridge toast (`shopify.toast.show`) — guaranteed to
//      show across the entire admin frame.
//   2. Best-effort: also add a shake class to the in-DOM element in
//      case a future Polaris release renders the bar locally.
export function nudgeSaveBar(): void {
  if (typeof document === "undefined") return;

  // Toast — primary feedback.
  try {
    const sh = (window as unknown as {
      shopify?: { toast?: { show?: (msg: string, opts?: object) => void } };
    }).shopify;
    sh?.toast?.show?.("You have unsaved changes — save or discard first.", {
      duration: 3000,
    });
  } catch {
    /* App Bridge not available — skip */
  }

  // Best-effort visual shake (no-op when the element is just a portal).
  ensureShakeStyle();
  document.querySelectorAll("ui-save-bar").forEach((el) => {
    (el as HTMLElement).classList.add("royal-save-shake");
    window.setTimeout(() => {
      (el as HTMLElement).classList.remove("royal-save-shake");
    }, 500);
  });
}

const SHAKE_STYLE_ID = "royal-save-shake-style";
function ensureShakeStyle() {
  if (typeof document === "undefined") return;
  if (document.getElementById(SHAKE_STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = SHAKE_STYLE_ID;
  s.textContent = `
    @keyframes royal-save-shake-keyframes {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-6px); }
      40% { transform: translateX(6px); }
      60% { transform: translateX(-4px); }
      80% { transform: translateX(4px); }
    }
    .royal-save-shake {
      animation: royal-save-shake-keyframes 0.45s ease-in-out;
    }
  `;
  document.head.appendChild(s);
}

export function PageTitle({
  title,
  subtitle,
  backHref,
  dirty,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  /** When true, clicking the back arrow pops a native confirm so the user
   *  doesn't lose unsaved changes by accidentally navigating away.
   *  Pages with a <ui-save-bar> should pass their dirty state here. */
  dirty?: boolean;
}) {
  const nav = useAppNavigate();
  const handleBack = () => {
    if (!backHref) return;
    // Don't navigate while there are unsaved changes — instead, draw
    // attention to the save bar so the user explicitly Saves or Discards.
    if (dirty) {
      nudgeSaveBar();
      return;
    }
    nav(backHref);
  };
  // The wrapper sets gridColumn 1/-1 so when this title sits inside an
  // <s-page> with a main + aside column layout, the title spans BOTH
  // columns and the aside content (e.g. Status card) drops below it
  // instead of floating up next to the heading. Without this, the right
  // rail's first card aligns to the same y as the title which makes it
  // look like the right rail outranks the title hierarchically — the
  // opposite of what we want. (Reference: Essent place-an-order layout.)
  //
  // Inside the wrapper:
  //   - back arrow + title on one row
  //   - subtitle below, *indented* to line up with the title text so it
  //     doesn't slip back under the arrow
  const titleIndent = backHref ? 36 : 0;
  return (
    <div
      style={{
        gridColumn: "1 / -1",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        {backHref && (
          // @ts-expect-error - s-button custom element JSX types
          <s-button
            variant="tertiary"
            icon="arrow-left"
            onClick={handleBack}
            accessibilityLabel="Back"
          ></s-button>
        )}
        <h1
          style={{
            margin: 0,
            fontSize: 16,
            fontWeight: 700,
            lineHeight: 1.2,
            color: "#202223",
          }}
        >
          {title}
        </h1>
      </div>
      {subtitle && (
        <div
          style={{
            marginTop: 4,
            marginLeft: titleIndent,
            fontSize: 13,
            color: "#6d7175",
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
}
