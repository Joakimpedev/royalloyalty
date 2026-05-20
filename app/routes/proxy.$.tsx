// App Proxy endpoint — serves the Theme App Extension widget and POS extension.
//
// Path layout (Shopify rewrites /apps/{prefix}/{...sub} → /proxy/{...sub}):
//   /loyalty/balance     storefront widget data (balance + everything the
//                        launcher / loyalty page / cart-redeem / customer-
//                        account block need to render: tier, earn rules,
//                        rewards, referral link, recent activity, branding)
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
import {
  buildStorefrontLoyaltyPayload,
  type StorefrontPayload,
} from "../lib/storefront-payload.server";

function jsonCors(payload: unknown, status = 200) {
  // App Proxy responses are same-origin to the storefront; no wildcard CORS.
  return data(payload as any, { status });
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
  // panel, loyalty page, cart-redeem block, and customer-account block.
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
      const { redeemReward } = await import("../lib/loyalty.server");
      const result = await redeemReward({
        shopId: ctx.shop.id,
        memberId: ctx.member?.id,
        shopifyCustomerId: customerId,
        rewardId: String(body.rewardId ?? ""),
      } as any);
      return jsonCors({ ok: true, result });
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
