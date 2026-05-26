// Localization page — one place to edit every customer-facing string in
// the storefront extension + POS.
//
// Model: one Storefront language picker at the top. Picking a language
// reseeds every field with that locale's baked defaults (no leftover
// overrides from a previously-edited language; that data is dropped on
// save). Edits below the picker layer on top of the chosen baseline.
// Save persists ONLY the diff against the baked defaults so storage
// stays small and "clear field" effectively resets to default.

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useSaveBar } from "../lib/polaris-bindings";
import {
  KEY_CATALOG,
  SECTION_LABELS,
  type LocalizationKey,
  type LocalizationSection,
} from "../lib/localization-keys";
import {
  isLocaleCode,
  type LocaleCode,
} from "../lib/localization-locales";
import {
  readLocalization,
  writeLocalization,
  buildResolvedBundle,
  type LocalizationConfig,
} from "../lib/localization";
import LockedHint from "../components/LockedHint";
import LocalePicker from "../components/LocalePicker";

async function requireShop(shopDomain: string) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Response("Shop not found", { status: 404 });
  return shop;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const paid = shop.plan !== "FREE";
  const config = readLocalization(shop.aiConfigSnapshot);
  return { config, paid };
};

type ActionResult = { ok: true } | { ok: false; message: string };

export const action = async ({
  request,
}: ActionFunctionArgs): Promise<ActionResult> => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const paid = shop.plan !== "FREE";
  if (!paid) {
    return { ok: false, message: "Localization editing requires a paid plan." };
  }
  const form = await request.formData();
  let next: LocalizationConfig;
  try {
    const raw = String(form.get("config") ?? "{}");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("bad shape");
    const dl = parsed.defaultLocale;
    if (typeof dl !== "string" || !isLocaleCode(dl)) {
      throw new Error("invalid defaultLocale");
    }
    const overrides: Record<string, string> = {};
    if (parsed.overrides && typeof parsed.overrides === "object") {
      for (const [k, v] of Object.entries(
        parsed.overrides as Record<string, unknown>,
      )) {
        if (typeof v === "string") overrides[k] = v.slice(0, 500);
      }
    }
    next = { defaultLocale: dl as LocaleCode, overrides };
  } catch (e) {
    return { ok: false, message: "Could not parse localization payload." };
  }
  const nextSnapshot = writeLocalization(shop.aiConfigSnapshot, next);
  await prisma.shop.update({
    where: { id: shop.id },
    data: { aiConfigSnapshot: nextSnapshot as object },
  });
  return { ok: true };
};

function groupBySection(): Record<LocalizationSection, LocalizationKey[]> {
  const out = {} as Record<LocalizationSection, LocalizationKey[]>;
  for (const entry of KEY_CATALOG) {
    if (!out[entry.section]) out[entry.section] = [];
    out[entry.section].push(entry);
  }
  return out;
}

export default function LocalizationPage() {
  const { config, paid } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const saveBarRef = useRef<HTMLElement | null>(null);

  // Local form state: the active locale + the overrides that apply on
  // top of its baked defaults. Switching locale CLEARS overrides — the
  // merchant gets the new locale's defaults as their baseline.
  const [defaultLocale, setDefaultLocale] = useState<LocaleCode>(
    config.defaultLocale,
  );
  const [overrides, setOverrides] = useState<Record<string, string>>(
    () => ({ ...config.overrides }),
  );

  const grouped = useMemo(() => groupBySection(), []);

  // Values shown in the form: baked defaults for the active locale,
  // then merchant overrides on top.
  const liveBundle = useMemo(
    () =>
      buildResolvedBundle(
        { defaultLocale, overrides },
        defaultLocale,
      ),
    [defaultLocale, overrides],
  );

  const dirty = useMemo(() => {
    if (defaultLocale !== config.defaultLocale) return true;
    return JSON.stringify(overrides) !== JSON.stringify(config.overrides);
  }, [defaultLocale, overrides, config]);

  const saving = nav.state === "submitting";
  useSaveBar(saveBarRef, dirty);

  const setField = useCallback((key: string, value: string) => {
    setOverrides((prev) => ({ ...prev, [key]: value }));
  }, []);

  const onLocaleChange = useCallback(
    (next: LocaleCode) => {
      if (next === defaultLocale) return;
      // Wipe overrides — the new locale is the new baseline. (Saved
      // overrides for the previous locale are still in the DB until the
      // merchant hits Save; clicking Discard restores everything.)
      setDefaultLocale(next);
      setOverrides({});
    },
    [defaultLocale],
  );

  const save = useCallback(() => {
    const fd = new FormData();
    fd.set("config", JSON.stringify({ defaultLocale, overrides }));
    submit(fd, { method: "POST" });
  }, [defaultLocale, overrides, submit]);

  const discard = useCallback(() => {
    setDefaultLocale(config.defaultLocale);
    setOverrides({ ...config.overrides });
  }, [config]);

  const sectionOrder: LocalizationSection[] = [
    "launcher",
    "loyaltyPage",
    "customerAccount",
    "rewards",
    "referrals",
    "cart",
    "product",
    "social",
    "ruleDefaults",
    "emptyStates",
    "statusAndErrors",
    "tooltips",
    "pos",
  ];

  return (
    // @ts-expect-error - s-page
    <s-page heading="Localization">
      {/* @ts-expect-error */}
      <ui-save-bar id="localization-save-bar" ref={saveBarRef}>
        <button
          variant="primary"
          onClick={save}
          {...(saving ? { loading: "" } : {})}
          disabled={!paid ? true : undefined}
        >
          Save
        </button>
        <button onClick={discard}>Discard</button>
        {/* @ts-expect-error */}
      </ui-save-bar>

      {actionData && !actionData.ok ? (
        // @ts-expect-error
        <s-section>
          {/* @ts-expect-error */}
          <s-banner tone="critical" heading="Could not save">
            {/* @ts-expect-error */}
            <s-paragraph>{actionData.message}</s-paragraph>
            {/* @ts-expect-error */}
          </s-banner>
          {/* @ts-expect-error */}
        </s-section>
      ) : null}

      {/* @ts-expect-error */}
      <s-section heading="Language">
        {/* @ts-expect-error */}
        <s-stack direction="block" gap="base">
          {/* @ts-expect-error */}
          <s-paragraph>
            {/* @ts-expect-error */}
            <s-text tone="subdued">
              Pick a language to set the baseline copy. Edit any field below
              to customize. Per-rule copy (Place an order, Sign up, etc.)
              lives on{" "}
              {/* @ts-expect-error - s-link */}
              <s-link href="/app/program">Program</s-link>.
              {/* @ts-expect-error */}
            </s-text>
            {/* @ts-expect-error */}
          </s-paragraph>
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 6,
              }}
            >
              <span style={{ fontSize: 13, color: "#202223" }}>
                Storefront language
              </span>
              {!paid ? <LockedHint /> : null}
            </div>
            <LocalePicker
              value={defaultLocale}
              onChange={onLocaleChange}
              readOnly={!paid}
            />
          </div>
          {/* @ts-expect-error */}
        </s-stack>
        {/* @ts-expect-error */}
      </s-section>

      {sectionOrder.map((section) => {
        const items = grouped[section];
        if (!items || items.length === 0) return null;
        const sectionHint = SECTION_HINTS[section];
        return (
          // @ts-expect-error
          <s-section key={section} heading={SECTION_LABELS[section]}>
            {/* @ts-expect-error */}
            <s-stack direction="block" gap="base">
              {sectionHint ? (
                // @ts-expect-error
                <s-paragraph>
                  {/* @ts-expect-error */}
                  <s-text tone="subdued">{sectionHint}</s-text>
                  {/* @ts-expect-error */}
                </s-paragraph>
              ) : null}
              {items.map((entry) => (
                <LocalizationField
                  key={entry.key}
                  entry={entry}
                  value={
                    overrides[entry.key] ?? liveBundle[entry.key] ?? entry.defaultEn
                  }
                  onChange={(v) => setField(entry.key, v)}
                  paid={paid}
                />
              ))}
              {/* @ts-expect-error */}
            </s-stack>
            {/* @ts-expect-error */}
          </s-section>
        );
      })}
      {/* @ts-expect-error */}
    </s-page>
  );
}

/** Per-section intro line, rendered above the fields. Empty = no intro. */
const SECTION_HINTS: Partial<Record<LocalizationSection, React.ReactNode>> = {
  ruleDefaults: (
    <>
      These are the placeholder defaults shown on each earn rule's editor
      when you haven't customized that specific rule yet. To customize a
      rule's actual title or description, edit it on{" "}
      {/* @ts-expect-error - s-link */}
      <s-link href="/app/program">Program</s-link>.
    </>
  ),
};

function LocalizationField({
  entry,
  value,
  onChange,
  paid,
}: {
  entry: LocalizationKey;
  value: string;
  onChange: (v: string) => void;
  paid: boolean;
}) {
  const multiline = value.length > 60 || /\n/.test(value);
  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "#202223",
          }}
        >
          {entry.label}
        </span>
        {!paid ? <LockedHint /> : null}
        <code
          style={{
            fontSize: 11,
            color: "#6d7175",
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            marginLeft: "auto",
          }}
        >
          {entry.key}
        </code>
      </div>
      {multiline ? (
        // @ts-expect-error
        <s-text-area
          label=""
          value={value}
          disabled={!paid ? true : undefined}
          rows={2}
          onChange={(e: any) => onChange(String(e.target.value ?? ""))}
        />
      ) : (
        // @ts-expect-error
        <s-text-field
          label=""
          value={value}
          disabled={!paid ? true : undefined}
          onChange={(e: any) => onChange(String(e.target.value ?? ""))}
        />
      )}
      {entry.hint ? (
        <div
          style={{
            fontSize: 12,
            color: "#6d7175",
            marginTop: 4,
          }}
        >
          {entry.hint}
        </div>
      ) : null}
    </div>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
