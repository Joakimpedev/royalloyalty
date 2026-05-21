// Branding — edit the Widget, Loyalty page and Emails (colors, logo, copy,
// section toggles) with a live preview per surface. Free plan = colors + logo
// only; paid = full copy / section control (the only non-volume gate, per the
// plan §3d). Save bar + useBlocker(). Branding is stored on
// Shop.aiConfigSnapshot.branding (schema is owned by another agent / locked).
import { useEffect, useRef, useState, useCallback } from "react";
import { useSaveBar } from "../lib/polaris-bindings";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  useLoaderData,
  useActionData,
  useNavigation,
  useSearchParams,
  useSubmit,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { checkAppEmbedEnabled } from "../lib/theme-embed.server";
import { BrandingPalette } from "../components/BrandingPalette";
import ColorPicker from "../components/ColorPicker";
import { WidgetPreview } from "../components/WidgetPreview";

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 13, color: "#202223" }}>{label}</span>
      <ColorPicker value={value} onChange={onChange} label={label} />
    </div>
  );
}
import { useAppNavigate } from "../lib/app-navigate";

function LockedHint() {
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

// Quiet copy button for the "App embed status unknown" case — copies the
// full diagnostic JSON to the clipboard without ever showing the dump on
// screen. Label flips to "Copied!" for 2s after a successful copy.
function CopyDiagnosticButton({ dump }: { dump: Record<string, unknown> }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(dump, null, 2);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* give up */
      }
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);
  return (
    <button
      type="button"
      onClick={copy}
      style={{
        background: "transparent",
        color: "#202223",
        border: "1px solid #c9cccf",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        cursor: "pointer",
        lineHeight: 1.6,
      }}
    >
      {copied ? "Copied!" : "Copy diagnostics"}
    </button>
  );
}

// Deep link to the theme editor's App embeds panel. Earlier we tried
// `activateAppId={uid}/launcher` to auto-flip the toggle, but that filter
// uses Shopify's *deployed* extension UUID — which differs from the local
// shopify.extension.toml `uid` — so the panel rendered empty ("you don't
// have any apps with embeds installed") even when the merchant clearly
// had other apps' embeds. Dropping activateAppId opens the full panel so
// the merchant can scroll to "Royal Loyalty" and toggle it themselves.
//
// (See feedback_iframe_auth_bug — must be a shopify: URL with a plain
// anchor; never target=_top.)
const ENABLE_EMBED_HREF = "shopify:admin/themes/current/editor?context=apps";

function SectionHeader({
  title,
  embedEnabled,
  embedDump,
}: {
  title: string;
  embedEnabled: boolean | null;
  embedDump?: Record<string, unknown>;
}) {
  // s-badge tone="success" = green, tone="critical" = red. When the check
  // is inconclusive (enabled === null) we render a neutral warning badge so
  // we always see *something* — that signals "lookup failed" instead of
  // silently hiding.
  const tone: "success" | "critical" | "warning" =
    embedEnabled === true
      ? "success"
      : embedEnabled === false
        ? "critical"
        : "warning";
  const label =
    embedEnabled === true
      ? "App embed enabled"
      : embedEnabled === false
        ? "App embed disabled — open theme editor"
        : "App embed status unknown";
  const badge = <s-badge tone={tone}>{label}</s-badge>;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 12,
      }}
    >
      <span style={{ fontSize: 14, fontWeight: 600, color: "#202223" }}>
        {title}
      </span>
      {embedEnabled === false ? (
        <a
          href={ENABLE_EMBED_HREF}
          style={{ textDecoration: "none", cursor: "pointer" }}
          title='Open the App embeds panel — scroll to "Royal Loyalty" and toggle it on, then click Save'
        >
          {badge}
        </a>
      ) : (
        badge
      )}
      {embedEnabled === null && embedDump && (
        <CopyDiagnosticButton dump={embedDump} />
      )}
    </div>
  );
}

// Wraps a paid-only field. When `label` is provided the lock icon sits right
// next to the label text; for unlabeled groups (e.g. checkboxes) it falls
// back to an absolute-positioned icon at the top-right.
function Gated({
  locked,
  label,
  children,
}: {
  locked: boolean;
  label?: string;
  children: React.ReactNode;
}) {
  if (!locked) return <>{children}</>;
  if (label) {
    return (
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            marginBottom: 4,
          }}
        >
          <span
            style={{ fontSize: 13, fontWeight: 500, color: "#202223" }}
          >
            {label}
          </span>
          <LockedHint />
        </div>
        {children}
      </div>
    );
  }
  return (
    <div style={{ position: "relative" }}>
      <span
        style={{
          position: "absolute",
          top: 2,
          right: 2,
          zIndex: 2,
          display: "inline-flex",
        }}
      >
        <LockedHint />
      </span>
      {children}
    </div>
  );
}

export interface BrandingConfig {
  widget: {
    position: "bottom-right" | "bottom-left";
    primaryColor: string;
    secondaryColor: string;
    icon: string;
    launcherText: string;
    title: string;
  };
  page: {
    heroTitle: string;
    heroSubtitle: string;
    themeColor: string;
    logoUrl: string;
    showEarn: boolean;
    showRewards: boolean;
    showReferral: boolean;
  };
  // Product page injection (above add-to-cart). Rendered by the launcher app
  // embed scanning the page for the add-to-cart form — no theme block needed.
  product: {
    enabled: boolean;
    accentColor: string;
    heading: string;
    subtext: string;
  };
  // Cart drawer / cart page injection. Same story — the app embed listens for
  // cart events and inserts the redeem card; merchants can't drop blocks into
  // the drawer anyway, so injection is the only practical option.
  cart: {
    enabled: boolean;
    accentColor: string;
    heading: string;
    showEarnLine: boolean;
  };
}

const DEFAULTS: BrandingConfig = {
  widget: {
    position: "bottom-right",
    primaryColor: "#2C2A29",
    secondaryColor: "#F0EBE3",
    icon: "crown",
    launcherText: "Rewards",
    title: "Your rewards",
  },
  page: {
    heroTitle: "Earn points. Get rewards.",
    heroSubtitle: "Join the program and earn on every order.",
    themeColor: "#2C2A29",
    logoUrl: "",
    showEarn: true,
    showRewards: true,
    showReferral: true,
  },
  product: {
    enabled: true,
    accentColor: "#2C2A29",
    heading: "Earn {points} points with this purchase",
    subtext: "You have {balance} points. Earn {more} more with this order!",
  },
  cart: {
    enabled: true,
    accentColor: "#2C2A29",
    heading: "Use your points",
    showEarnLine: true,
  },
};

function readBranding(snapshot: unknown): BrandingConfig {
  const snap =
    snapshot && typeof snapshot === "object"
      ? ((snapshot as Record<string, unknown>).branding as
          | Partial<BrandingConfig>
          | undefined)
      : undefined;
  return {
    widget: { ...DEFAULTS.widget, ...(snap?.widget ?? {}) },
    page: { ...DEFAULTS.page, ...(snap?.page ?? {}) },
    product: { ...DEFAULTS.product, ...(snap?.product ?? {}) },
    cart: { ...DEFAULTS.cart, ...(snap?.cart ?? {}) },
  };
}

async function requireShop(shopDomain: string) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Response("Shop not found", { status: 404 });
  return shop;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const paid = shop.plan !== "FREE";
  const embed = await checkAppEmbedEnabled(admin, {
    shop: session.shop,
    accessToken: session.accessToken,
  });
  // Surface the session's actual granted scopes in the diagnostic. If
  // `read_themes` isn't in here, the OAuth re-grant didn't take and the
  // merchant needs to reinstall / re-auth the app explicitly.
  if (embed.dump && typeof embed.dump === "object") {
    (embed.dump as Record<string, unknown>).session_scope = session.scope;
    (embed.dump as Record<string, unknown>).session_shop = session.shop;
    (embed.dump as Record<string, unknown>).session_is_online = session.isOnline;
    (embed.dump as Record<string, unknown>).session_expires =
      session.expires?.toISOString() ?? null;
  }
  return {
    branding: readBranding(shop.aiConfigSnapshot),
    paid,
    embed,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const paid = shop.plan !== "FREE";
  const form = await request.formData();
  const incoming = JSON.parse(
    String(form.get("branding") ?? "{}"),
  ) as BrandingConfig;

  const current = readBranding(shop.aiConfigSnapshot);

  // Free plan: only colors + logo + on/off toggles are persisted; copy is
  // ignored server-side (defense in depth — the UI also disables them).
  const next: BrandingConfig = paid
    ? incoming
    : {
        widget: {
          ...current.widget,
          primaryColor: incoming.widget.primaryColor,
          secondaryColor: incoming.widget.secondaryColor,
        },
        page: {
          ...current.page,
          themeColor: incoming.page.themeColor,
          logoUrl: incoming.page.logoUrl,
        },
        product: {
          ...current.product,
          enabled: incoming.product.enabled,
          accentColor: incoming.product.accentColor,
        },
        cart: {
          ...current.cart,
          enabled: incoming.cart.enabled,
          accentColor: incoming.cart.accentColor,
          showEarnLine: incoming.cart.showEarnLine,
        },
      };

  const base =
    shop.aiConfigSnapshot && typeof shop.aiConfigSnapshot === "object"
      ? (shop.aiConfigSnapshot as Record<string, unknown>)
      : {};
  await prisma.shop.update({
    where: { id: shop.id },
    data: { aiConfigSnapshot: { ...base, branding: next } },
  });
  return { ok: true, message: "Branding saved." };
};

export default function BrandingPage() {
  const { branding, paid, embed } = useLoaderData<typeof loader>();
  const embedEnabled = embed.enabled;
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const [searchParams] = useSearchParams();
  // Final stop of the onboarding redirect chain. When ?onboarding=1 we frame the
  // page as "Step 2 of 2" and the primary CTA finishes the chain by sending the
  // merchant to /app?welcomed=1.
  const inOnboardingChain = searchParams.get("onboarding") === "1";
  const appNav = useAppNavigate();
  const saveBarRef = useRef<HTMLElement | null>(null);

  const [form, setForm] = useState<BrandingConfig>(branding);
  const [baseline, setBaseline] = useState<BrandingConfig>(branding);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const saving = nav.state === "submitting";

  // Note: native <ui-save-bar> (App Bridge) handles unsaved-changes nav
  // warnings — no useBlocker-driven body banner needed.

  useSaveBar(saveBarRef, dirty);

  useEffect(() => {
    if (actionData?.ok) setBaseline(form);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionData]);

  const save = useCallback(() => {
    const fd = new FormData();
    fd.set("branding", JSON.stringify(form));
    submit(fd, { method: "POST" });
  }, [form, submit]);

  const setW = (k: keyof BrandingConfig["widget"], v: string) =>
    setForm((f) => ({ ...f, widget: { ...f.widget, [k]: v } }));
  const setP = (
    k: keyof BrandingConfig["page"],
    v: string | boolean,
  ) => setForm((f) => ({ ...f, page: { ...f.page, [k]: v } }));
  const setPr = (
    k: keyof BrandingConfig["product"],
    v: string | boolean,
  ) => setForm((f) => ({ ...f, product: { ...f.product, [k]: v } }));
  const setC = (
    k: keyof BrandingConfig["cart"],
    v: string | boolean,
  ) => setForm((f) => ({ ...f, cart: { ...f.cart, [k]: v } }));

  return (
    <s-page heading="Branding">
      {inOnboardingChain && (
        <s-button
          slot="primary-action"
          onClick={() => appNav("/app?welcomed=1")}
          variant="primary"
        >
          Finish setup
        </s-button>
      )}

      {inOnboardingChain && (
        <s-section>
          <s-banner tone="info" heading="Step 2 of 2 — Customize your widget">
            <s-paragraph>
              Pick the colors, copy and sections shoppers will see. When you're
              happy, click <strong>Finish setup</strong> to wrap up.
            </s-paragraph>
          </s-banner>
        </s-section>
      )}

      {/* @ts-expect-error - ui-save-bar App Bridge custom element */}
      <ui-save-bar id="branding-save-bar" ref={saveBarRef}>
        <button
          variant="primary"
          onClick={save}
          {...(saving ? { loading: "" } : {})}
        >
          Save
        </button>
        <button onClick={() => setForm(baseline)}>Discard</button>
        {/* @ts-expect-error - ui-save-bar custom element */}
      </ui-save-bar>

      {actionData && actionData.ok && (
        <s-section>
          <s-banner tone="success">
            <s-paragraph>{actionData.message}</s-paragraph>
          </s-banner>
        </s-section>
      )}


      {!paid && (
        <s-section>
          <s-banner tone="info" heading="Colors and logo on your plan">
            <s-paragraph>
              Copy and section controls are available on a paid plan. Color and
              logo customization is included on every plan and is enabled below.
            </s-paragraph>
          </s-banner>
        </s-section>
      )}

      {/* ---- Widget ---- */}
      <s-section heading="Widget">
        <s-stack direction="block" gap="large">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: 24,
              alignItems: "start",
            }}
          >
            <s-stack direction="block" gap="base">
              <s-text fontWeight="bold">Palette</s-text>
              <s-paragraph>
                Pick a starting palette, then fine-tune the hex values below.
              </s-paragraph>
              <BrandingPalette
                primary={form.widget.primaryColor}
                secondary={form.widget.secondaryColor}
                onSelect={(preset) => {
                  // Apply the palette to all three surfaces so picking a brand
                  // color updates the Widget, the Loyalty page hero, and the
                  // email accent at the same time. The hex fields below each
                  // surface let merchants fine-tune any one independently.
                  setForm((f) => ({
                    ...f,
                    widget: {
                      ...f.widget,
                      primaryColor: preset.primary,
                      secondaryColor: preset.secondary,
                    },
                    page: { ...f.page, themeColor: preset.primary },
                    product: { ...f.product, accentColor: preset.primary },
                    cart: { ...f.cart, accentColor: preset.primary },
                  }));
                }}
              />
              <ColorField
                label="Primary color"
                value={form.widget.primaryColor}
                onChange={(v) => setW("primaryColor", v)}
              />
              <ColorField
                label="Secondary color"
                value={form.widget.secondaryColor}
                onChange={(v) => setW("secondaryColor", v)}
              />
              <Gated
                locked={!paid}
                label="Launcher position"
              >
                <s-select
                  value={form.widget.position}
                  disabled={!paid ? true : undefined}
                  onChange={(e: { target: { value: string } }) =>
                    setW("position", e.target.value)
                  }
                >
                  <s-option value="bottom-right">Bottom right</s-option>
                  <s-option value="bottom-left">Bottom left</s-option>
                </s-select>
              </Gated>
              <Gated
                locked={!paid}
                label="Launcher text"
              >
                <s-text-field
                  value={form.widget.launcherText}
                  disabled={!paid ? true : undefined}
                  onChange={(e: { target: { value: string } }) =>
                    setW("launcherText", e.target.value)
                  }
                />
              </Gated>
              <Gated
                locked={!paid}
                label="Widget title"
              >
                <s-text-field
                  value={form.widget.title}
                  disabled={!paid ? true : undefined}
                  onChange={(e: { target: { value: string } }) =>
                    setW("title", e.target.value)
                  }
                />
              </Gated>
            </s-stack>
            <div style={{ position: "sticky", top: 16 }}>
              <s-text tone="subdued">Live preview</s-text>
              <div style={{ marginTop: 8 }}>
                <WidgetPreview
                  config={{
                    primaryColor: form.widget.primaryColor,
                    secondaryColor: form.widget.secondaryColor,
                    title: form.widget.title,
                    launcherText: form.widget.launcherText,
                  }}
                />
              </div>
            </div>
          </div>
        </s-stack>
      </s-section>

      {/* ---- Loyalty page ---- */}
      <s-section heading="Loyalty page">
        <s-stack direction="block" gap="base">
          <ColorField
            label="Theme color"
            value={form.page.themeColor}
            onChange={(v) => setP("themeColor", v)}
          />
          <s-text-field
            label="Logo URL"
            value={form.page.logoUrl}
            onChange={(e: { target: { value: string } }) =>
              setP("logoUrl", e.target.value)
            }
          />
          <Gated
            locked={!paid}
            label="Hero title"
          >
            <s-text-field
              value={form.page.heroTitle}
              disabled={!paid ? true : undefined}
              onChange={(e: { target: { value: string } }) =>
                setP("heroTitle", e.target.value)
              }
            />
          </Gated>
          <Gated
            locked={!paid}
            label="Hero subtitle"
          >
            <s-text-field
              value={form.page.heroSubtitle}
              disabled={!paid ? true : undefined}
              onChange={(e: { target: { value: string } }) =>
                setP("heroSubtitle", e.target.value)
              }
            />
          </Gated>
          <Gated
            locked={!paid}
          >
            <s-stack direction="block" gap="small-200">
              <s-checkbox
                label={'Show "ways to earn" section'}
                checked={form.page.showEarn ? true : undefined}
                disabled={!paid ? true : undefined}
                onChange={(e: { target: { checked: boolean } }) =>
                  setP("showEarn", e.target.checked)
                }
              />
              <s-checkbox
                label="Show rewards section"
                checked={form.page.showRewards ? true : undefined}
                disabled={!paid ? true : undefined}
                onChange={(e: { target: { checked: boolean } }) =>
                  setP("showRewards", e.target.checked)
                }
              />
              <s-checkbox
                label="Show referral section"
                checked={form.page.showReferral ? true : undefined}
                disabled={!paid ? true : undefined}
                onChange={(e: { target: { checked: boolean } }) =>
                  setP("showReferral", e.target.checked)
                }
              />

            </s-stack>
          </Gated>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text tone="subdued">Live preview</s-text>
            <div
              style={{
                marginTop: 8,
                padding: 24,
                borderRadius: 8,
                background: form.page.themeColor,
                color: "#fff",
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {form.page.heroTitle}
              </div>
              <div style={{ opacity: 0.85 }}>{form.page.heroSubtitle}</div>
            </div>
          </s-box>
        </s-stack>
      </s-section>

      {/* ---- Product page widget ---- */}
      <s-section>
        <SectionHeader
          title="Product page widget"
          embedEnabled={embedEnabled}
          embedDump={embed.dump}
        />
        <s-stack direction="block" gap="base">
          <div style={{ color: "#6d7175", fontSize: 13 }}>
            Shows above the add-to-cart button.
          </div>
          <s-checkbox
            label="Show on product pages"
            checked={form.product.enabled ? true : undefined}
            onChange={(e: { target: { checked: boolean } }) =>
              setPr("enabled", e.target.checked)
            }
          />
          <ColorField
            label="Accent color"
            value={form.product.accentColor}
            onChange={(v) => setPr("accentColor", v)}
          />
          <Gated locked={!paid} label="Heading">
            <s-text-field
              value={form.product.heading}
              disabled={!paid ? true : undefined}
              onChange={(e: { target: { value: string } }) =>
                setPr("heading", e.target.value)
              }
            />
          </Gated>
          <Gated locked={!paid} label="Subtext">
            <s-text-field
              value={form.product.subtext}
              disabled={!paid ? true : undefined}
              onChange={(e: { target: { value: string } }) =>
                setPr("subtext", e.target.value)
              }
            />
          </Gated>
          <s-paragraph>
            <s-text tone="subdued">
              Placeholders: {"{points}"} (earned for this item), {"{balance}"}
              {" "}(customer's current points), {"{more}"} (points needed for
              next reward).
            </s-text>
          </s-paragraph>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text tone="subdued">Live preview</s-text>
            <div
              style={{
                marginTop: 8,
                padding: 14,
                borderRadius: 8,
                border: "1px solid #e1e3e5",
                background: "#fff",
                color: "#202223",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div
                aria-hidden
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: form.product.accentColor,
                  color: "#fff",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                ★
              </div>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {form.product.heading
                    .replaceAll("{points}", "120")
                    .replaceAll("{balance}", "350")
                    .replaceAll("{more}", "150")}
                </div>
                <div style={{ fontSize: 13, color: "#6d7175" }}>
                  {form.product.subtext
                    .replaceAll("{points}", "120")
                    .replaceAll("{balance}", "350")
                    .replaceAll("{more}", "150")}
                </div>
              </div>
            </div>
          </s-box>
        </s-stack>
      </s-section>

      {/* ---- Cart widget ---- */}
      <s-section>
        <SectionHeader
          title="Cart widget"
          embedEnabled={embedEnabled}
          embedDump={embed.dump}
        />
        <s-stack direction="block" gap="base">
          <div style={{ color: "#6d7175", fontSize: 13 }}>
            Shows inside the cart drawer and cart page.
          </div>
          <s-checkbox
            label="Show in cart"
            checked={form.cart.enabled ? true : undefined}
            onChange={(e: { target: { checked: boolean } }) =>
              setC("enabled", e.target.checked)
            }
          />
          <s-checkbox
            label='Show "+X points for this order" line'
            checked={form.cart.showEarnLine ? true : undefined}
            onChange={(e: { target: { checked: boolean } }) =>
              setC("showEarnLine", e.target.checked)
            }
          />
          <ColorField
            label="Accent color"
            value={form.cart.accentColor}
            onChange={(v) => setC("accentColor", v)}
          />
          <Gated locked={!paid} label="Heading">
            <s-text-field
              value={form.cart.heading}
              disabled={!paid ? true : undefined}
              onChange={(e: { target: { value: string } }) =>
                setC("heading", e.target.value)
              }
            />
          </Gated>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text tone="subdued">Live preview</s-text>
            <div
              style={{
                marginTop: 8,
                padding: 14,
                borderRadius: 8,
                border: "1px solid #e1e3e5",
                background: "#fff",
                color: "#202223",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  marginBottom: form.cart.showEarnLine ? 8 : 0,
                }}
              >
                <div
                  aria-hidden
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: form.cart.accentColor,
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                    fontSize: 14,
                  }}
                >
                  ★
                </div>
                <strong>{form.cart.heading}</strong>
              </div>
              {form.cart.showEarnLine && (
                <div style={{ fontSize: 13, color: "#6d7175" }}>
                  +120 points for this order
                </div>
              )}
              <div
                style={{
                  marginTop: 10,
                  padding: "8px 12px",
                  background: "#f6f6f7",
                  borderRadius: 6,
                  fontSize: 13,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>$5 Off</span>
                <span style={{ color: "#6d7175" }}>1000 pts</span>
              </div>
            </div>
          </s-box>
        </s-stack>
      </s-section>

    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
