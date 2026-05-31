// App Proxy endpoint — serves the Theme App Extension widget and POS extension.
//
// Path layout (Shopify rewrites /apps/{prefix}/{...sub} → /proxy/{...sub}):
//   /loyalty/balance     storefront widget data (balance + everything the
//                        launcher / loyalty page / customer-account block /
//                        product+cart injections need to render: tier, earn
//                        rules, rewards, referral link, recent activity,
//                        branding)
//   /loyalty/redeem      storefront reward redemption
//   /pos/balance         POS extension balance lookup
//   /pos/redeem          POS reward redemption
//   /pos/earn            POS award-on-sale
//
// Legacy `/balance` and `/redeem` without the loyalty/ prefix also resolve so
// any in-flight storefront JS that calls those paths keeps working.
//
// authenticate.public.appProxy validates the Shopify HMAC signature per
// request. No admin session here — shop is derived from the proxy auth.
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getBalance } from "../lib/points.server";
import { withFreshToken } from "../lib/token.server";
import {
  buildStorefrontLoyaltyPayload,
  type StorefrontPayload,
} from "../lib/storefront-payload.server";

function jsonCors(payload: unknown, status = 200) {
  // App Proxy responses are same-origin to the storefront; no wildcard CORS.
  // no-store: Shopify's app proxy will otherwise cache the JSON, so a freshly
  // saved branding / rewards change won't show up on the storefront until the
  // edge cache expires.
  return data(payload as any, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function memberFor(shopDomain: string, customerId: string | null) {
  if (!customerId) return null;
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return null;
  const member = await prisma.member.findUnique({
    where: {
      shopId_shopifyCustomerId: {
        shopId: shop.id,
        shopifyCustomerId: customerId,
      },
    },
  });
  return { shop, member };
}

// Strip the optional `loyalty/` prefix the storefront JS uses so we accept
// either `loyalty/balance` or `balance` (pos/* stays as-is).
function normalizeSub(raw: string | undefined): string {
  const sub = raw || "";
  return sub.startsWith("loyalty/") ? sub.slice("loyalty/".length) : sub;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  const shopDomain = session?.shop;
  if (!shopDomain) return jsonCors({ error: "unauthorized" }, 401);

  const sub = normalizeSub(params["*"]);
  const url = new URL(request.url);
  const customerId = url.searchParams.get("logged_in_customer_id");

  // Storefront widget data — single rich payload powering the launcher
  // panel, the dedicated loyalty page block, the customer-account block,
  // and the launcher-driven product/cart injections.
  if (sub === "balance") {
    const shop = await prisma.shop.findUnique({ where: { shopDomain } });
    if (!shop) return jsonCors({ error: "shop_not_found" }, 404);

    const payload: StorefrontPayload = await buildStorefrontLoyaltyPayload({
      shop,
      shopDomain,
      shopifyCustomerId: customerId,
    });
    return jsonCors(payload);
  }

  // POS — leaner payload, doesn't need branding or rewards beyond points.
  if (sub === "pos/balance") {
    const ctx = await memberFor(shopDomain, customerId);
    if (!ctx?.member) return jsonCors({ points: 0, enrolled: false });
    const points = await getBalance(ctx.shop.id, ctx.member.id);
    return jsonCors({ points, enrolled: true });
  }

  // POS localization — POS extension calls this once on mount to fetch
  // the active locale's bundle, then resolves every UI string with t().
  if (sub === "pos/localization") {
    const { readLocalization, buildResolvedBundle } = await import(
      "../lib/localization"
    );
    const shop = await prisma.shop.findUnique({ where: { shopDomain } });
    if (!shop) return jsonCors({ error: "shop_not_found" }, 404);
    const config = readLocalization(shop.aiConfigSnapshot);
    const bundle = buildResolvedBundle(config, config.defaultLocale);
    const { LOCALE_INDEX } = await import("../lib/localization-locales");
    const meta = LOCALE_INDEX.get(config.defaultLocale);
    return jsonCors({
      bundle,
      locale: {
        code: config.defaultLocale,
        rtl: Boolean(meta?.rtl),
      },
    });
  }

  return jsonCors({ error: "not_found" }, 404);
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  const shopDomain = session?.shop;
  if (!shopDomain) return jsonCors({ error: "unauthorized" }, 401);

  const sub = normalizeSub(params["*"]);
  const body = await request.json().catch(() => ({}) as any);
  // Shopify App Proxy appends `logged_in_customer_id` to the signed query
  // string for every authenticated request (GET and POST). Reading from the
  // URL is therefore authoritative; falling back to body.customerId for POS
  // calls that come from non-proxy contexts.
  const url = new URL(request.url);
  const customerId =
    url.searchParams.get("logged_in_customer_id") ||
    (typeof body.customerId === "string" ? body.customerId : null);
  const ctx = await memberFor(shopDomain, customerId);
  if (!ctx) return jsonCors({ error: "shop_not_found" }, 404);

  // redeem / pos/redeem / pos/earn are delegated to the engine libs. They are
  // imported lazily so a missing optional export never breaks the whole route;
  // server-side validation (member, points, plan/quota) happens inside them.
  try {
    if (sub === "redeem" || sub === "pos/redeem") {
      // Redemption needs an Admin GraphQL client to mint the Shopify
      // discount code (amount_off / percent_off / free_shipping) or credit
      // a store credit account (store_credit). The proxy auth only validates
      // the storefront HMAC, so we grab the offline admin session via
      // withFreshToken — same pattern as the store-credit balance read on
      // /loyalty/balance.
      if (!ctx.member) {
        return jsonCors(
          { ok: true, result: { ok: false, error: "Not enrolled yet." } },
        );
      }
      const { redeemReward } = await import("../lib/loyalty.server");
      const result = await withFreshToken(shopDomain, async (admin) =>
        redeemReward({
          shopDomain,
          memberId: ctx.member!.id,
          rewardId: String(body.rewardId ?? ""),
          admin: { graphql: admin.graphql },
        }),
      );
      if (!result) {
        return jsonCors({
          ok: true,
          result: {
            ok: false,
            error: "Could not reach Shopify right now — please try again.",
          },
        });
      }
      return jsonCors({ ok: true, result });
    }
    if (sub === "loyalty/claim-referral") {
      // Storefront detected `royal_ref` cookie + a logged-in customer and
      // is asking us to record the attribution + issue the welcome store
      // credit. App Proxy already supplied the customerId via query string.
      if (!customerId) {
        return jsonCors({ ok: false, error: "no_customer" }, 401);
      }
      const code = typeof body.code === "string" ? body.code.trim() : "";
      if (!code) return jsonCors({ ok: false, error: "no_code" }, 400);

      // We need the customer's email and the shop currency; pull them now.
      const shop = await prisma.shop.findUnique({
        where: { shopDomain },
        select: { id: true, currencyCode: true },
      });
      if (!shop) return jsonCors({ ok: false, error: "shop_not_found" }, 404);

      const { claimReferral } = await import("../lib/referrals.server");
      const result = await withFreshToken(shopDomain, async (admin) => {
        // Read the customer's email server-side from Shopify so we don't
        // trust client-submitted values.
        let customerEmail: string | null = null;
        try {
          const r = await admin.graphql(
            `#graphql
            query refClaimCustomer($id: ID!) {
              customer(id: $id) { email }
            }`,
            {
              variables: {
                id: `gid://shopify/Customer/${customerId}`,
              },
            },
          );
          const j = (await r.json()) as any;
          customerEmail = j?.data?.customer?.email ?? null;
        } catch {
          /* email is best-effort; the claim still proceeds without it */
        }
        return claimReferral({
          shopId: shop.id,
          shopifyCustomerId: String(customerId),
          customerEmail,
          code,
          graphql: admin.graphql,
          shopCurrencyCode: shop.currencyCode ?? "USD",
        });
      });
      if (!result) {
        return jsonCors({
          ok: false,
          error: "Could not reach Shopify right now.",
        });
      }
      return jsonCors(result);
    }
    if (sub === "loyalty/claim-social") {
      // Self-report social follow: customer clicked the Follow button on
      // the storefront. We trust the click (industry standard pattern;
      // every loyalty app does this since there's no API to verify a
      // real follow). awardForAction's oncePerKey="social-<platform>"
      // guard makes the claim once-per-member-per-platform.
      if (!ctx.member) {
        return jsonCors({ ok: false, error: "not_enrolled" }, 401);
      }
      const platform = String(body.platform ?? "").toLowerCase();
      const allowed = ["instagram", "tiktok", "x", "facebook", "youtube"];
      if (!allowed.includes(platform)) {
        return jsonCors({ ok: false, error: "unknown_platform" }, 400);
      }
      const rule = await import("../db.server").then((m) =>
        m.default.earnRule.findFirst({
          where: { shopId: ctx.shop.id, action: "social", enabled: true },
        }),
      );
      const platformCfg = (
        (rule?.config as { platforms?: Array<Record<string, unknown>> } | null)
          ?.platforms ?? []
      ).find(
        (p) => p && (p as { id?: string }).id === platform,
      ) as
        | {
            id: string;
            handle: string;
            label: string;
            points: number;
            enabled: boolean;
          }
        | undefined;
      if (!platformCfg || !platformCfg.enabled) {
        return jsonCors({ ok: false, error: "platform_disabled" }, 400);
      }
      const { awardForAction } = await import("../lib/loyalty.server");
      // We override the rule's `points` value by writing a custom
      // ledger row via a special key — but the simplest path is to
      // temporarily flip the rule's points. To avoid that race we call
      // awardForAction which uses rule.points; for per-platform pricing
      // we record a manual ledger entry instead.
      const { recordPointTransaction } = await import("../lib/points.server");
      const prisma = (await import("../db.server")).default;
      const oncePerKey = `social-${platform}`;
      const dup = await prisma.pointTransaction.findFirst({
        where: {
          shopId: ctx.shop.id,
          memberId: ctx.member.id,
          type: "EARN",
          reason: { contains: `[${oncePerKey}]` },
        },
        select: { id: true },
      });
      if (dup) return jsonCors({ ok: true, outcome: "duplicate" });
      // Reuse awardForAction for quota + tier multiplier + recompute,
      // but we only want it when rule.points > 0. Since rule.points is
      // the legacy field and not used for social, we skip it and write
      // the platform-specific points directly.
      const member = await prisma.member.findUnique({
        where: { id: ctx.member.id },
      });
      if (!member) return jsonCors({ ok: false, error: "no_member" }, 400);
      const tier = member.currentTierId
        ? await prisma.tier.findUnique({
            where: { id: member.currentTierId },
          })
        : null;
      const multiplier = tier?.earnMultiplier ?? 1.0;
      const points = Math.floor(platformCfg.points * multiplier);
      if (points <= 0) return jsonCors({ ok: true, outcome: "zero_points" });
      await recordPointTransaction({
        shopId: ctx.shop.id,
        memberId: ctx.member.id,
        type: "EARN",
        points,
        reason: `Action: social (${platformCfg.points} x${multiplier}) [${oncePerKey}]`,
      });
      // Best-effort tier recompute (matches awardForAction behavior).
      try {
        const { recomputeTier } = await import("../lib/loyalty.server");
        await recomputeTier(ctx.shop.id, ctx.member.id);
      } catch {
        /* non-fatal */
      }
      // awardForAction will also be a no-op for any future call thanks to
      // the [social-<platform>] marker in the reason field.
      void awardForAction;
      return jsonCors({ ok: true, outcome: "awarded", points });
    }

    if (sub === "pos/earn") {
      const { awardForAction } = await import("../lib/loyalty.server");
      const result = await awardForAction({
        shopId: ctx.shop.id,
        shopifyCustomerId: customerId,
        action: "purchase",
        context: body,
      } as any);
      return jsonCors({ ok: true, result });
    }
  } catch (e: any) {
    return jsonCors({ ok: false, error: e?.message ?? "error" }, 400);
  }

  return jsonCors({ error: "not_found" }, 404);
};
