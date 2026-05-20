// Branding — edit the Widget, Loyalty page and Emails (colors, logo, copy,
// section toggles) with a live preview per surface. Free plan = colors + logo
// only; paid = full copy / section control (the only non-volume gate, per the
// plan §3d). Save bar + useBlocker(). Branding is stored on
// Shop.aiConfigSnapshot.branding (schema is owned by another agent / locked).
import { useEffect, useRef, useState, useCallback } from "react";
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
  useBlocker,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
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
  emails: {
    accentColor: string;
    logoUrl: string;
    pointsEarnedSubject: string;
    rewardAvailableSubject: string;
    tierChangeSubject: string;
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
  emails: {
    accentColor: "#2C2A29",
    logoUrl: "",
    pointsEarnedSubject: "You earned {points} points",
    rewardAvailableSubject: "A reward is ready for you",
    tierChangeSubject: "Welcome to {tier}",
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
    emails: { ...DEFAULTS.emails, ...(snap?.emails ?? {}) },
  };
}

async function requireShop(shopDomain: string) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Response("Shop not found", { status: 404 });
  return shop;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const paid = shop.plan !== "FREE";
  return { branding: readBranding(shop.aiConfigSnapshot), paid };
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

  // Free plan: only colors + logo are persisted; copy/section toggles are
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
        emails: {
          ...current.emails,
          accentColor: incoming.emails.accentColor,
          logoUrl: incoming.emails.logoUrl,
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
  const { branding, paid } = useLoaderData<typeof loader>();
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

  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }) =>
        dirty && currentLocation.pathname !== nextLocation.pathname,
      [dirty],
    ),
  );

  useEffect(() => {
    if (blocker.state === "blocked" && !dirty) blocker.reset?.();
  }, [blocker, dirty]);

  useEffect(() => {
    const el = saveBarRef.current as
      | (HTMLElement & { show?: () => void; hide?: () => void })
      | null;
    if (!el) return;
    if (dirty) el.show?.();
    else el.hide?.();
  }, [dirty]);

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
  const setE = (k: keyof BrandingConfig["emails"], v: string) =>
    setForm((f) => ({ ...f, emails: { ...f.emails, [k]: v } }));

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
                    emails: { ...f.emails, accentColor: preset.primary },
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
                checked={form.page.showEarn ? true : undefined}
                disabled={!paid ? true : undefined}
                onChange={(e: { target: { checked: boolean } }) =>
                  setP("showEarn", e.target.checked)
                }
              >
                Show &quot;ways to earn&quot; section
              </s-checkbox>
              <s-checkbox
                checked={form.page.showRewards ? true : undefined}
                disabled={!paid ? true : undefined}
                onChange={(e: { target: { checked: boolean } }) =>
                  setP("showRewards", e.target.checked)
                }
              >
                Show rewards section
              </s-checkbox>
              <s-checkbox
                checked={form.page.showReferral ? true : undefined}
                disabled={!paid ? true : undefined}
                onChange={(e: { target: { checked: boolean } }) =>
                  setP("showReferral", e.target.checked)
                }
              >
                Show referral section
              </s-checkbox>
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

      {/* ---- Emails ---- */}
      <s-section heading="Emails">
        <s-stack direction="block" gap="base">
          <ColorField
            label="Accent color"
            value={form.emails.accentColor}
            onChange={(v) => setE("accentColor", v)}
          />
          <s-text-field
            label="Email logo URL"
            value={form.emails.logoUrl}
            onChange={(e: { target: { value: string } }) =>
              setE("logoUrl", e.target.value)
            }
          />
          <Gated
            locked={!paid}
            label={'"Points earned" subject'}
          >
            <s-text-field
              value={form.emails.pointsEarnedSubject}
              disabled={!paid ? true : undefined}
              onChange={(e: { target: { value: string } }) =>
                setE("pointsEarnedSubject", e.target.value)
              }
            />
          </Gated>
          <Gated
            locked={!paid}
            label={'"Reward available" subject'}
          >
            <s-text-field
              value={form.emails.rewardAvailableSubject}
              disabled={!paid ? true : undefined}
              onChange={(e: { target: { value: string } }) =>
                setE("rewardAvailableSubject", e.target.value)
              }
            />
          </Gated>
          <Gated
            locked={!paid}
            label={'"Tier change" subject'}
          >
            <s-text-field
              value={form.emails.tierChangeSubject}
              disabled={!paid ? true : undefined}
              onChange={(e: { target: { value: string } }) =>
                setE("tierChangeSubject", e.target.value)
              }
            />
          </Gated>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-text tone="subdued">Live preview</s-text>
            <div
              style={{
                marginTop: 8,
                borderTop: `4px solid ${form.emails.accentColor}`,
                padding: 16,
                background: "#fff",
                color: "#202223",
              }}
            >
              <strong>{form.emails.pointsEarnedSubject}</strong>
              <p style={{ marginTop: 8 }}>
                Thanks for your order! You earned points.
              </p>
            </div>
          </s-box>
        </s-stack>
      </s-section>

      {blocker.state === "blocked" && (
        <s-section>
          <s-banner tone="warning" heading="You have unsaved changes">
            <s-stack direction="inline" gap="base">
              <s-button variant="primary" onClick={() => blocker.proceed?.()}>
                Leave without saving
              </s-button>
              <s-button onClick={() => blocker.reset?.()}>
                Stay on page
              </s-button>
            </s-stack>
          </s-banner>
        </s-section>
      )}
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
