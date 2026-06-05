import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { shouldProcess, safeLog } from "../lib/webhooks.server";
import { cancelActiveSubscription } from "../lib/billing.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic, admin } = await authenticate.webhook(request);

  if (!(await shouldProcess(request, topic))) {
    return new Response();
  }
  safeLog(topic, shop, "uninstall received");

  // Primary cancel point — the offline token is still valid here, so cancel any
  // active billing subscription before tearing down sessions (shop/redact is a
  // defensive backstop). Best-effort; never block the 200.
  try {
    if (admin) {
      await cancelActiveSubscription(admin.graphql);
    }
  } catch (e) {
    safeLog(topic, shop, "billing cancel skipped on uninstall");
  }

  // Idempotent — webhook may fire multiple times / after uninstall.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }
  await db.shop.updateMany({
    where: { shopDomain: shop },
    data: { isActive: false, uninstalledAt: new Date() },
  });

  return new Response();
};
