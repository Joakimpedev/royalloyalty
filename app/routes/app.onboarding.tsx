// Royal Loyalty — AI onboarding (Phase 3 #2-#8).
//
// First-load surface: the merchant lands on a PREVIEW of their own configured
// program (generated from aggregate store data via ai.server), never a blank
// setup. Every AI default is an editable card; one "Activate program" action
// persists Tier/EarnRule/Reward rows, sets Shop.programActivatedAt (TTV) and
// Shop.aiConfigSnapshot. Post-activation: a dismissible, collapsible checklist
// with store-context deep links.
//
// This is a form-bearing surface → contextual save bar (ui-save-bar) + React
// Router useBlocker() to block breadcrumb/<a> nav with unsaved edits.

import { useEffect, useMemo, useRef, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useBlocker, useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  generateProgram,
  type ProposedProgram,
} from "../lib/ai.server";
import { recordActivation } from "../lib/ttv.server";
import { BrandingPalette } from "../components/BrandingPalette";
import ColorPicker from "../components/ColorPicker";
import { WidgetPreview } from "../components/WidgetPreview";
import { AppLink, useAppNavigate } from "../lib/app-navigate";
import { useMoney, useShopMoney } from "../lib/use-money";

// ---------------------------------------------------------------------------
// Loader — generate (or reuse persisted) program preview
// ---------------------------------------------------------------------------

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  const shop = await prisma.shop.upsert({
    where: { shopDomain: session.shop },
    update: {},
    create: { shopDomain: session.shop },
    select: { id: true, programActivatedAt: true, aiConfigSnapshot: true },
  });

  // Already activated → show the post-activation checklist with the snapshot.
  if (shop.programActivatedAt && shop.aiConfigSnapshot) {
    return {
      activated: true,
      shopDomain: session.shop,
      program: shop.aiConfigSnapshot as unknown as ProposedProgram,
    };
  }

  const { program } = await generateProgram(admin);
  return { activated: false, shopDomain: session.shop, program };
};

// ---------------------------------------------------------------------------
// Action — activate (persist) or dismiss checklist
// ---------------------------------------------------------------------------

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = form.get("intent");

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    select: { id: true, programActivatedAt: true },
  });
  if (!shop) return { ok: false, error: "Shop not found" };

  if (intent === "dismiss-checklist") {
    // Persist checklist dismissal in the aiConfigSnapshot meta (DB, not local).
    const current = await prisma.shop.findUnique({
      where: { id: shop.id },
      select: { aiConfigSnapshot: true },
    });
    const snap = (current?.aiConfigSnapshot as Record<string, unknown>) ?? {};
    await prisma.shop.update({
      where: { id: shop.id },
      data: {
        aiConfigSnapshot: {
          ...snap,
          _checklistDismissed: true,
        } as object,
      },
    });
    return { ok: true, dismissed: true };
  }

  if (intent === "activate") {
    if (shop.programActivatedAt) {
      return { ok: false, error: "Program already activated" };
    }
    const payload = form.get("program");
    if (typeof payload !== "string") {
      return { ok: false, error: "Missing program payload" };
    }
    let program: ProposedProgram;
    try {
      program = JSON.parse(payload);
    } catch {
      return { ok: false, error: "Invalid program payload" };
    }

    // Persist everything atomically; TTV stamp is idempotent inside the txn.
    await prisma.$transaction(async (tx) => {
      await tx.tier.deleteMany({ where: { shopId: shop.id } });
      await tx.earnRule.deleteMany({ where: { shopId: shop.id } });
      await tx.reward.deleteMany({ where: { shopId: shop.id } });

      await tx.tier.createMany({
        data: program.tiers.map((t, i) => ({
          shopId: shop.id,
          name: t.name,
          thresholdType: t.thresholdType,
          threshold: t.threshold,
          earnMultiplier: t.earnMultiplier,
          perks: t.perks as object,
          sortOrder: i,
        })),
      });
      await tx.earnRule.createMany({
        data: program.earnRules.map((r) => ({
          shopId: shop.id,
          action: r.action,
          points: r.points,
          perDollar: r.perDollar,
          enabled: r.enabled,
          config: { label: r.label } as object,
        })),
      });
      await tx.reward.createMany({
        data: program.rewards.map((rw) => ({
          shopId: shop.id,
          type: rw.type,
          pointsCost: rw.pointsCost,
          value: rw.value,
          enabled: true,
        })),
      });
      // Persist the AI snapshot AND project the onboarding branding selection
      // into the BrandingConfig shape the /app/branding page reads, so the
      // merchant's palette pick survives the onboarding → branding hop.
      const brandingConfig = {
        widget: {
          position: program.branding.launcherPosition ?? "bottom-right",
          primaryColor: program.branding.primaryColor,
          secondaryColor: program.branding.secondaryColor,
          icon: "crown",
          launcherText: program.branding.pointsName,
          title: program.branding.programName,
        },
        page: {
          heroTitle: `Earn ${program.branding.pointsName}. Get rewards.`,
          heroSubtitle: "Join the program and earn on every order.",
          themeColor: program.branding.primaryColor,
          logoUrl: "",
          showEarn: true,
          showRewards: true,
          showReferral: true,
        },
        product: {
          enabled: true,
          accentColor: program.branding.primaryColor,
          heading: `Earn {points} ${program.branding.pointsName} with this purchase`,
          subtext: `You have {balance} ${program.branding.pointsName}. Earn {more} more with this order!`,
        },
        cart: {
          enabled: true,
          accentColor: program.branding.primaryColor,
          heading: `Use your ${program.branding.pointsName}`,
          showEarnLine: true,
        },
      };
      await tx.shop.update({
        where: { id: shop.id },
        data: {
          aiConfigSnapshot: {
            ...(program as unknown as Record<string, unknown>),
            branding: brandingConfig,
          } as object,
        },
      });
      // Time-to-value: idempotent install→activate stamp.
      await recordActivation(tx, shop.id);
    });

    // Post-onboarding redirect chain: Program → Branding → Home (?welcomed=1).
    //
    // ⚠ IFRAME AUTH: do NOT use `return redirect(...)`. A server-side redirect
    // from an action in the embedded admin causes the follow-up request to
    // sometimes land without the session token, logging the merchant out. We
    // return the destination as data and let the component navigate
    // client-side via useAppNavigate, which preserves the iframe session.
    return { ok: true, activated: true, redirectTo: "/app/program?onboarding=1" };
  }

  return { ok: false, error: "Unknown intent" };
};

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

const CHECKLIST = [
  {
    key: "klaviyo",
    title: "Connect Klaviyo",
    desc: "Send points, tier and reward events to your email flows.",
    href: "/app/billing",
    cta: "Open integrations",
  },
  {
    key: "pos",
    title: "Enable Point of Sale",
    desc: "Let customers earn and redeem in your physical store.",
    // shopify: URL — App Bridge intercepts and navigates the parent admin
    // frame while keeping our iframe (and session) alive. NEVER replace this
    // with https://admin.shopify.com/... + target="_top" — that breaks auth.
    href: "shopify:admin/apps",
    cta: "Open Shopify POS",
  },
  {
    key: "widget",
    title: "Confirm the storefront widget",
    desc: "Enable the Royal Loyalty theme app embed so customers see it.",
    href: "shopify:admin/themes/current/editor?context=apps",
    cta: "Open theme editor",
  },
];

export default function Onboarding() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  if (data.activated) {
    return <PostActivationChecklist />;
  }

  return <ProgramPreview initial={data.program} fetcher={fetcher} />;
}

function ProgramPreview({
  initial,
  fetcher,
}: {
  initial: ProposedProgram;
  fetcher: ReturnType<typeof useFetcher<typeof action>>;
}) {
  const [program, setProgram] = useState<ProposedProgram>(initial);
  const [dirty, setDirty] = useState(false);
  const appNav = useAppNavigate();
  const money = useMoney();
  const { currencyCode } = useShopMoney();
  const saveBarRef = useRef<HTMLElement | null>(null);

  const isSaving =
    fetcher.state !== "idle" && fetcher.formData?.get("intent") === "activate";
  // Action returns { ok: true, activated: true, redirectTo } — once we see
  // that, we navigate client-side via App Bridge-aware useAppNavigate.
  const activated =
    isSaving ||
    fetcher.state === "loading" ||
    (fetcher.data &&
      "activated" in fetcher.data &&
      fetcher.data.activated === true);

  useEffect(() => {
    const d = fetcher.data as
      | { ok?: boolean; activated?: boolean; redirectTo?: string }
      | undefined;
    if (d?.ok && d.activated && d.redirectTo) {
      appNav(d.redirectTo);
    }
  }, [fetcher.data, appNav]);

  // Block in-app nav (breadcrumb / <a>) while there are unsaved edits.
  const blocker = useBlocker(
    () => dirty && !activated,
  );

  useEffect(() => {
    if (blocker.state === "blocked") {
      const ok = window.confirm(
        "You have unsaved changes to your loyalty program. Leave without activating?",
      );
      if (ok) blocker.proceed();
      else blocker.reset();
    }
  }, [blocker]);

  // Native beforeunload guard (browser close / hard nav).
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty && !activated) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, activated]);

  const mutate = (fn: (p: ProposedProgram) => ProposedProgram) => {
    setProgram((p) => fn(structuredClone(p)));
    setDirty(true);
  };

  const activate = () => {
    fetcher.submit(
      { intent: "activate", program: JSON.stringify(program) },
      { method: "POST" },
    );
  };

  const discard = () => {
    setProgram(structuredClone(initial));
    setDirty(false);
  };

  useEffect(() => {
    if (activated) setDirty(false);
  }, [activated]);

  const isFallback = program.source === "fallback-template";

  return (
    <s-page heading="Set up your loyalty program">
      {/* Contextual save bar — required on every form surface incl. this preview */}
      <ui-save-bar id="onboarding-save-bar" open={dirty ? true : undefined}>
        <button
          slot="save"
          onClick={activate}
          {...(isSaving ? { loading: "" } : {})}
        >
          Activate program
        </button>
        <button slot="discard" onClick={discard}>
          Discard changes
        </button>
      </ui-save-bar>

      <s-button
        slot="primary-action"
        onClick={activate}
        {...(isSaving ? { loading: true } : {})}
      >
        Activate program
      </s-button>

      <s-section
        heading={
          isFallback
            ? "Recommended starter program (template)"
            : "Your AI-generated program"
        }
      >
        <s-banner tone={isFallback ? "info" : "success"}>
          <s-paragraph>
            {isFallback
              ? "Industry-agnostic best-practice template"
              : "Built from your own store's catalog, order volume and theme"}
            . {program.rationale}
          </s-paragraph>
        </s-banner>
        {fetcher.data?.ok === false && (
          <s-banner tone="critical">
            <s-paragraph>{fetcher.data.error}</s-paragraph>
          </s-banner>
        )}
        <s-paragraph>
          Everything below is editable. Adjust anything, then click
          <s-text> Activate program</s-text> — that one action makes it live.
        </s-paragraph>
      </s-section>

      {/* Branding card */}
      <s-section heading="Branding">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Program name"
            value={program.branding.programName}
            onInput={(e: any) =>
              mutate((p) => {
                p.branding.programName = e.target.value;
                return p;
              })
            }
          />
          <s-text-field
            label="Points name"
            value={program.branding.pointsName}
            onInput={(e: any) =>
              mutate((p) => {
                p.branding.pointsName = e.target.value;
                return p;
              })
            }
          />
          <s-text fontWeight="bold">Palette</s-text>
          <s-paragraph>
            Pick a starting palette that fits your brand. You can fine-tune the
            exact colors below or later from the Branding page.
          </s-paragraph>
          <BrandingPalette
            primary={program.branding.primaryColor}
            secondary={program.branding.secondaryColor}
            onSelect={(preset) =>
              mutate((p) => {
                p.branding.primaryColor = preset.primary;
                p.branding.secondaryColor = preset.secondary;
                return p;
              })
            }
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: 24,
              alignItems: "start",
            }}
          >
            <s-stack direction="block" gap="base">
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 13, color: "#202223" }}>
                  Primary color
                </span>
                <ColorPicker
                  value={program.branding.primaryColor}
                  label="Primary color"
                  onChange={(v) =>
                    mutate((p) => {
                      p.branding.primaryColor = v;
                      return p;
                    })
                  }
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontSize: 13, color: "#202223" }}>
                  Secondary color
                </span>
                <ColorPicker
                  value={program.branding.secondaryColor}
                  label="Secondary color"
                  onChange={(v) =>
                    mutate((p) => {
                      p.branding.secondaryColor = v;
                      return p;
                    })
                  }
                />
              </div>
            </s-stack>
            <div style={{ position: "sticky", top: 16 }}>
              <s-text tone="subdued">Live preview</s-text>
              <div style={{ marginTop: 8 }}>
                <WidgetPreview
                  config={{
                    primaryColor: program.branding.primaryColor,
                    secondaryColor: program.branding.secondaryColor,
                    title: program.branding.programName,
                    subtitle:
                      "Earn points on every order — redeem for rewards.",
                    launcherText: program.branding.pointsName,
                    showEarn: true,
                    showRewards: true,
                    showReferral: true,
                  }}
                />
              </div>
            </div>
          </div>
        </s-stack>
      </s-section>

      {/* Earn rules */}
      <s-section heading="How customers earn">
        <s-stack direction="block" gap="base">
          {program.earnRules.map((rule, i) => (
            <s-box
              key={rule.action}
              padding="base"
              borderWidth="base"
              borderRadius="base"
            >
              <s-stack direction="inline" gap="base">
                <s-text>{rule.label}</s-text>
                <s-number-field
                  label={`Points (${rule.action})`}
                  value={String(rule.points)}
                  onInput={(e: any) =>
                    mutate((p) => {
                      p.earnRules[i].points = Math.max(
                        0,
                        Math.round(Number(e.target.value) || 0),
                      );
                      return p;
                    })
                  }
                />
                <s-switch
                  label="Enabled"
                  {...(rule.enabled ? { checked: true } : {})}
                  onChange={(e: any) =>
                    mutate((p) => {
                      p.earnRules[i].enabled = !!e.target.checked;
                      return p;
                    })
                  }
                />
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-section>

      {/* VIP tiers */}
      <s-section heading="VIP tiers">
        <s-stack direction="block" gap="base">
          {program.tiers.map((tier, i) => (
            <s-box
              key={i}
              padding="base"
              borderWidth="base"
              borderRadius="base"
            >
              <s-stack direction="inline" gap="base">
                <s-text-field
                  label="Tier name"
                  value={tier.name}
                  onInput={(e: any) =>
                    mutate((p) => {
                      p.tiers[i].name = e.target.value;
                      return p;
                    })
                  }
                />
                <s-number-field
                  label="Threshold (points)"
                  value={String(tier.threshold)}
                  {...(i === 0 ? { disabled: true } : {})}
                  onInput={(e: any) =>
                    mutate((p) => {
                      p.tiers[i].threshold = Math.max(
                        0,
                        Math.round(Number(e.target.value) || 0),
                      );
                      return p;
                    })
                  }
                />
                <s-number-field
                  label="Earn multiplier"
                  value={String(tier.earnMultiplier)}
                  onInput={(e: any) =>
                    mutate((p) => {
                      p.tiers[i].earnMultiplier = Math.max(
                        1,
                        Number(e.target.value) || 1,
                      );
                      return p;
                    })
                  }
                />
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-section>

      {/* Rewards */}
      <s-section heading="Reward catalog">
        <s-stack direction="block" gap="base">
          {program.rewards.map((rw, i) => (
            <s-box
              key={i}
              padding="base"
              borderWidth="base"
              borderRadius="base"
            >
              <s-stack direction="inline" gap="base">
                <s-text>{rw.label}</s-text>
                <s-number-field
                  label="Points cost"
                  value={String(rw.pointsCost)}
                  onInput={(e: any) =>
                    mutate((p) => {
                      p.rewards[i].pointsCost = Math.max(
                        1,
                        Math.round(Number(e.target.value) || 1),
                      );
                      return p;
                    })
                  }
                />
                {rw.value !== null && (
                  <s-number-field
                    label={
                      rw.type === "percent_off"
                        ? "Value (% off)"
                        : `Value (${currencyCode})`
                    }
                    value={String(rw.value)}
                    onInput={(e: any) =>
                      mutate((p) => {
                        p.rewards[i].value = Number(e.target.value) || 0;
                        return p;
                      })
                    }
                  />
                )}
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-section>

      {/* Default emails (progressive disclosure: collapsed details) */}
      <s-section heading="Default emails">
        {program.emails.map((em, i) => (
          <details key={em.event} style={{ marginBottom: "0.5rem" }}>
            <summary>{em.event.replace(/_/g, " ")}</summary>
            <s-stack direction="block" gap="base">
              <s-text-field
                label="Subject"
                value={em.subject}
                onInput={(e: any) =>
                  mutate((p) => {
                    p.emails[i].subject = e.target.value;
                    return p;
                  })
                }
              />
              <s-text-area
                label="Body"
                value={em.body}
                onInput={(e: any) =>
                  mutate((p) => {
                    p.emails[i].body = e.target.value;
                    return p;
                  })
                }
              />
            </s-stack>
          </details>
        ))}
      </s-section>

      <s-section heading="Import existing members?">
        <s-paragraph>
          Switching from another loyalty app? Import your members and point
          balances first.
        </s-paragraph>
        <AppLink href="/app/import">Import from a CSV</AppLink>
      </s-section>
    </s-page>
  );
}

function PostActivationChecklist() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const meta =
    ((data.program as unknown as Record<string, unknown>)
      ?._checklistDismissed as boolean) ?? false;

  const [done, setDone] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(meta);

  const allDone = useMemo(
    () => CHECKLIST.every((c) => done[c.key]),
    [done],
  );

  const dismiss = () => {
    setCollapsed(true);
    fetcher.submit({ intent: "dismiss-checklist" }, { method: "POST" });
  };

  return (
    <s-page heading="Your loyalty program is live">
      <s-section heading="Program activated">
        <s-banner tone="success">
          <s-paragraph>
            Royal Loyalty is now active for your store. Finish these optional
            steps to get the most out of it.
          </s-paragraph>
        </s-banner>
      </s-section>

      <s-section heading="Setup checklist">
        {collapsed ? (
          <s-stack direction="inline" gap="base">
            <s-text>
              Checklist {allDone ? "complete" : "hidden"}.
            </s-text>
            <s-button
              variant="tertiary"
              onClick={() => setCollapsed(false)}
            >
              Show checklist
            </s-button>
          </s-stack>
        ) : (
          <s-stack direction="block" gap="base">
            {CHECKLIST.map((c) => (
              <s-box
                key={c.key}
                padding="base"
                borderWidth="base"
                borderRadius="base"
              >
                <s-stack direction="inline" gap="base">
                  <s-checkbox
                    label={c.title}
                    {...(done[c.key] ? { checked: true } : {})}
                    onChange={(e: any) =>
                      setDone((d) => ({
                        ...d,
                        [c.key]: !!e.target.checked,
                      }))
                    }
                  />
                  <s-text>{c.desc}</s-text>
                  {/* Routed via AppLink (useAppNavigate) so the iframe stays
                      alive — bare <s-link href=> in body content does a
                      full-page reload and destroys the embedded session. */}
                  <AppLink href={c.href}>{c.cta}</AppLink>
                </s-stack>
              </s-box>
            ))}
            <s-stack direction="inline" gap="base">
              <s-button onClick={dismiss}>
                {allDone ? "Done — hide checklist" : "Dismiss checklist"}
              </s-button>
              <s-button variant="tertiary" onClick={() => setCollapsed(true)}>
                Collapse
              </s-button>
            </s-stack>
          </s-stack>
        )}
      </s-section>
    </s-page>
  );
}
