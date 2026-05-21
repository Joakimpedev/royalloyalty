// customers/create — earn signup bonus.
//
// Fires when a new customer record is created in the shop (typical paths:
// storefront account signup, checkout's "create account" toggle, manual
// admin add, sync from an external CRM). We upsert a Member row, then run
// awardForAction with oncePerKey="signup" so the bonus is awarded exactly
// once per (member) — re-triggering customers/create on the same id
// (rare but possible via app re-installs) won't double-credit.
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { shouldProcess, safeLog } from "../lib/webhooks.server";
import { awardForAction, upsertMember } from "../lib/loyalty.server";
import prisma from "../db.server";

interface CustomersCreatePayload {
  id: number | string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  const first = await shouldProcess(request, topic);
  if (!first) {
    safeLog(topic, shop, "duplicate delivery ignored");
    return new Response(null, { status: 200 });
  }

  try {
    const p = payload as CustomersCreatePayload;
    const shopRow = await prisma.shop.findUnique({
      where: { shopDomain: shop },
      select: { id: true },
    });
    if (!shopRow) {
      safeLog(topic, shop, "shop not found — skipping");
      return new Response(null, { status: 200 });
    }
    if (p.id == null) {
      safeLog(topic, shop, "payload missing customer id");
      return new Response(null, { status: 200 });
    }

    const member = await upsertMember({
      shopId: shopRow.id,
      shopifyCustomerId: String(p.id),
      email: p.email ?? null,
      name:
        [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || null,
    });

    const result = await awardForAction({
      shopId: shopRow.id,
      memberId: member.id,
      action: "signup",
      oncePerKey: "signup",
    });
    safeLog(topic, shop, `signup processed (${result.outcome})`);
  } catch (err) {
    safeLog(topic, shop, "signup processing error");
    throw err;
  }

  return new Response(null, { status: 200 });
};
