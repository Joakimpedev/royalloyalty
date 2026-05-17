// App Proxy endpoint — serves the Theme App Extension widget and POS extension.
// Shopify forwards {shop}/apps/royal/* → /proxy/* with a signed query string;
// authenticate.public.appProxy validates that signature (HMAC) per request.
// No admin session here (customer-facing); shop is derived from the proxy auth.
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { getBalance } from "../lib/points.server";

function jsonCors(payload: unknown, status = 200) {
  // App Proxy responses are same-origin to the storefront; no wildcard CORS.
  return data(payload as any, { status });
}

async function memberFor(shopDomain: string, customerId: string | null) {
  if (!customerId) return null;
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) return null;
  const member = await prisma.member.findUnique({
    where: { shopId_shopifyCustomerId: { shopId: shop.id, shopifyCustomerId: customerId } },
  });
  return member ? { shop, member } : { shop, member: null };
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.public.appProxy(request);
  const shopDomain = session?.shop;
  if (!shopDomain) return jsonCors({ error: "unauthorized" }, 401);

  const sub = params["*"] || "";
  const url = new URL(request.url);
  const customerId = url.searchParams.get("logged_in_customer_id");

  if (sub === "balance" || sub === "pos/balance") {
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

  const sub = params["*"] || "";
  const body = await request.json().catch(() => ({}) as any);
  const customerId = String(body.customerId ?? "") || null;
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
