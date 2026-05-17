// app_subscriptions/update — billing/plan state (ROYAL-LOYALTY-DEVELOPMENT.md
// Phase 5). Handles ALL paths: activate, upgrade, downgrade, cancel, expire,
// AND the ACTIVE event that restores paid status when a frozen store
// un-freezes (the known HIGH miss). Shop.plan/planStatus updated IMMEDIATELY.
//
// Universal webhook contract (webhooks.server.ts / Phase 1):
//   1. authenticate.webhook() HMAC — throws 401 on invalid (never catch-and-200)
//   2. shouldProcess() dedup on X-Shopify-Event-Id
//   3. bounded work (single shop row read + update), return 200 fast
//   4. no PII in any log line (this payload has no customer PII; safeLog anyway)
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { shouldProcess, safeLog } from "../lib/webhooks.server";
import prisma from "../db.server";
import {
  mapSubscriptionStatus,
  tierFromSubscriptionName,
} from "../lib/billing.server";

// app_subscriptions/update payload (the relevant subset).
interface AppSubscriptionUpdatePayload {
  app_subscription?: {
    admin_graphql_api_id?: string; // gid://shopify/AppSubscription/...
    name?: string; // matches the plan name we set in subscribeToPlan
    status?: string; // ACTIVE | FROZEN | CANCELLED | EXPIRED | DECLINED ...
  };
}

export const action = async ({ request }: ActionFunctionArgs) => {
  // 1. HMAC.
  const { shop, topic, payload } = await authenticate.webhook(request);

  // 2. Dedup.
  const first = await shouldProcess(request, topic);
  if (!first) {
    safeLog(topic, shop, "duplicate delivery ignored");
    return new Response(null, { status: 200 });
  }

  try {
    const sub = (payload as AppSubscriptionUpdatePayload).app_subscription;
    const rawStatus = sub?.status;
    const status = mapSubscriptionStatus(rawStatus);

    const shopRow = await prisma.shop.findUnique({
      where: { shopDomain: shop },
      select: { id: true, plan: true, planStatus: true },
    });
    if (!shopRow) {
      // App may have been uninstalled before this delivery — ack.
      safeLog(topic, shop, "shop not found — ack");
      return new Response(null, { status: 200 });
    }

    if (status === "ACTIVE") {
      // Activate / upgrade / downgrade / un-freeze (FROZEN -> ACTIVE):
      // the subscription name authoritatively determines the plan tier, so an
      // upgrade and a downgrade are the same code path (set plan = the named
      // tier, status ACTIVE). A previously frozen store is restored here.
      const tier = tierFromSubscriptionName(sub?.name);
      await prisma.shop.update({
        where: { id: shopRow.id },
        data: {
          plan: tier,
          planStatus: "ACTIVE",
          subscriptionId: sub?.admin_graphql_api_id ?? null,
        },
      });
      safeLog(topic, shop, `subscription active -> plan set (${tier})`);
    } else if (status === "FROZEN") {
      // Payment issue / store frozen. Keep the plan tier (so an un-freeze ACTIVE
      // event restores it), but mark status FROZEN. Volume gating still uses the
      // plan cap; planStatus is informational + drives the Settings banner.
      await prisma.shop.update({
        where: { id: shopRow.id },
        data: { planStatus: "FROZEN" },
      });
      safeLog(topic, shop, "subscription frozen");
    } else {
      // CANCELLED or EXPIRED (incl. DECLINED): fall back to the Free plan.
      // No subscription remains; the shop keeps every feature, just the Free
      // volume cap. subscriptionId cleared so the Settings UI shows Free.
      await prisma.shop.update({
        where: { id: shopRow.id },
        data: {
          plan: "FREE",
          planStatus: status, // CANCELLED or EXPIRED — surfaced in Settings
          subscriptionId: null,
        },
      });
      safeLog(topic, shop, `subscription ${status.toLowerCase()} -> Free plan`);
    }
  } catch (err) {
    safeLog(topic, shop, "subscription update processing error");
    throw err; // Shopify retries; dedup row prevents an infinite loop
  }

  return new Response(null, { status: 200 });
};
