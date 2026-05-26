// Localization page — one place to edit every customer-facing string in
// the storefront extension + POS. Language picker at the top; switching
// language re-fills every field with that locale's baked defaults
// (merchant-overrides preserved when present). Save persists ONLY the
// merchant's overrides (diff against the baked default) so storage stays
// small.

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
  LOCALES,
  LOCALE_INDEX,
  DEFAULT_LOCALE,
  isLocaleCode,
  type LocaleCode,
} from "../lib/localization-locales";
import {
  readLocalization,
  writeLocalization,
  buildResolvedBundle,
  type LocalizationConfig,
} from "../lib/localization.server";
import LockedHint from "../components/LockedHint";

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
    const bundles: LocalizationConfig["bundles"] = {};
    if (parsed.bundles && typeof parsed.bundles === "object") {
      for (const [code, bundle] of Object.entries(parsed.bundles)) {
        if (!isLocaleCode(code)) continue;
        if (!bundle || typeof bundle !== "object") continue;
        const clean: Record<string, string> = {};
        for (const [k, v] of Object.entries(
          bundle as Record<string, unknown>,
        )) {
          if (typeof v === "string") clean[k] = v.slice(0, 500);
        }
        bundles[code as LocaleCode] = clean;
      }
    }
    next = { defaultLocale: dl as LocaleCode, bundles };
  } catch (e) {
    return {
      ok: false,
      message: "Could not parse localization payload.",
    };
  }
  const nextSnapshot = writeLocalization(shop.aiConfigSnapshot, next);
  await prisma.shop.update({
    where: { id: shop.id },
    data: { aiConfigSnapshot: nextSnapshot as object },
  });
  return { ok: true };
};

/** Group the catalog by section, preserving declaration order. */
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

  // The "view bundle" is what's shown in the form. It's the merged result
  // of the baked default for the active locale + any merchant overrides.
  // When the merchant edits a field, we store their value in
  // `overrides[locale][key]`. When they switch language, the form repopulates
  // from buildResolvedBundle for the new locale.
  const [defaultLocale, setDefaultLocale] = useState<LocaleCode>(
    config.defaultLocale,
  );
  const [editingLocale, setEditingLocale] = useState<LocaleCode>(
    config.defaultLocale,
  );
  const [overrides, setOverrides] = useState<
    Partial<Record<LocaleCode, Record<string, string>>>
  >(() => {
    const seed: Partial<Record<LocaleCode, Record<string, string>>> = {};
    for (const [code, bundle] of Object.entries(config.bundles)) {
      seed[code as LocaleCode] = { ...(bundle as Record<string, string>) };
    }
    return seed;
  });

  const grouped = useMemo(() => groupBySection(), []);

  // Build the values displayed in the form: merchant override > baked default.
  const liveBundle = useMemo(() => {
    return buildResolvedBundle(
      { defaultLocale, bundles: overrides },
      editingLocale,
    );
  }, [defaultLocale, overrides, editingLocale]);

  const dirty = useMemo(() => {
    if (defaultLocale !== config.defaultLocale) return true;
    const a = JSON.stringify(overrides);
    const b = JSON.stringify(config.bundles);
    return a !== b;
  }, [defaultLocale, overrides, config]);

  const saving = nav.state === "submitting";
  useSaveBar(saveBarRef, dirty);

  useEffect(() => {
    if (actionData && actionData.ok) {
      // The reload will pick up the new baseline; no further action.
    }
  }, [actionData]);

  const setField = useCallback(
    (key: string, value: string) => {
      setOverrides((prev) => {
        const next = { ...prev };
        const cur = { ...(next[editingLocale] ?? {}) };
        cur[key] = value;
        next[editingLocale] = cur;
        return next;
      });
    },
    [editingLocale],
  );

  const save = useCallback(() => {
    const fd = new FormData();
    fd.set(
      "config",
      JSON.stringify({ defaultLocale, bundles: overrides }),
    );
    submit(fd, { method: "POST" });
  }, [defaultLocale, overrides, submit]);

  const discard = useCallback(() => {
    setDefaultLocale(config.defaultLocale);
    setEditingLocale(config.defaultLocale);
    const seed: Partial<Record<LocaleCode, Record<string, string>>> = {};
    for (const [code, bundle] of Object.entries(config.bundles)) {
      seed[code as LocaleCode] = { ...(bundle as Record<string, string>) };
    }
    setOverrides(seed);
  }, [config]);

  const editingLocaleMeta = LOCALE_INDEX.get(editingLocale);
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
    // @ts-expect-error - s-page custom element JSX types
    <s-page heading="Localization">
      {/* @ts-expect-error - ui-save-bar */}
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
        {/* @ts-expect-error - ui-save-bar */}
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
              Pick the language your customers see on the storefront. Every
              field below pre-fills with that language's defaults; edit any
              value to customize. Switching languages doesn't lose your work
              — each language stores its own values.
            </s-text>
            {/* @ts-expect-error */}
          </s-paragraph>
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 4,
              }}
            >
              <span style={{ fontSize: 13, color: "#202223" }}>
                Storefront language
              </span>
              {!paid ? <LockedHint /> : null}
            </div>
            {/* @ts-expect-error */}
            <s-select
              value={defaultLocale}
              disabled={!paid ? true : undefined}
              onChange={(e: { target: { value: string } }) => {
                const v = e.target.value;
                if (isLocaleCode(v)) {
                  setDefaultLocale(v);
                  setEditingLocale(v);
                }
              }}
            >
              {LOCALES.map((l) => (
                // @ts-expect-error - s-option
                <s-option key={l.code} value={l.code}>
                  {l.displayName}
                  {/* @ts-expect-error */}
                </s-option>
              ))}
              {/* @ts-expect-error */}
            </s-select>
          </div>
          {editingLocale !== defaultLocale ? (
            // @ts-expect-error
            <s-banner tone="info">
              {/* @ts-expect-error */}
              <s-paragraph>
                You're editing the <strong>{editingLocaleMeta?.label}</strong>{" "}
                bundle. The active storefront language is{" "}
                <strong>{LOCALE_INDEX.get(defaultLocale)?.label}</strong>.
                {/* @ts-expect-error */}
              </s-paragraph>
              {/* @ts-expect-error */}
            </s-banner>
          ) : null}
          <div>
            <span style={{ fontSize: 13, color: "#202223" }}>
              Edit bundle for
            </span>
            {/* @ts-expect-error */}
            <s-select
              value={editingLocale}
              disabled={!paid ? true : undefined}
              onChange={(e: { target: { value: string } }) => {
                const v = e.target.value;
                if (isLocaleCode(v)) setEditingLocale(v);
              }}
            >
              {LOCALES.map((l) => (
                // @ts-expect-error
                <s-option key={l.code} value={l.code}>
                  {l.displayName}
                  {/* @ts-expect-error */}
                </s-option>
              ))}
              {/* @ts-expect-error */}
            </s-select>
          </div>
          {/* @ts-expect-error */}
        </s-stack>
        {/* @ts-expect-error */}
      </s-section>

      {sectionOrder.map((section) => {
        const items = grouped[section];
        if (!items || items.length === 0) return null;
        return (
          // @ts-expect-error
          <s-section key={section} heading={SECTION_LABELS[section]}>
            {/* @ts-expect-error */}
            <s-stack direction="block" gap="base">
              {items.map((entry) => (
                <LocalizationField
                  key={entry.key}
                  entry={entry}
                  value={liveBundle[entry.key] ?? entry.defaultEn}
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
