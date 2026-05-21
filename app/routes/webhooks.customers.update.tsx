// customers/update — earn newsletter-subscribe bonus.
//
// Shopify pushes this webhook on every customer mutation, so we only act
// when the email-marketing consent state is SUBSCRIBED (the customer is
// signed up for marketing emails). `awardForAction` with
// oncePerKey="newsletter" ensures the bonus only fires once per member —
// toggling consent off and back on won't re-credit.
//
// External marketing tools (Mailchimp, Klaviyo, etc.) sync subscriber
// state back to the Shopify customer record via their official Shopify
// apps, so a subscribe via Mailchimp also lands here.
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { shouldProcess, safeLog } from "../lib/webhooks.server";
import { awardForAction, upsertMember } from "../lib/loyalty.server";
import prisma from "../db.server";

interface CustomersUpdatePayload {
  id: number | string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  // REST-style legacy boolean (still present alongside the consent object).
  accepts_marketing?: boolean;
  email_marketing_consent?: {
    state?: string;
    opt_in_level?: string | null;
    consent_updated_at?: string | null;
  } | null;
}

function isSubscribed(p: CustomersUpdatePayload): boolean {
  const state = p.email_marketing_consent?.state;
  if (state && state.toLowerCase() === "subscribed") return true;
  // Older payloads only ship `accepts_marketing`.
  return p.accepts_marketing === true;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  const first = await shouldProcess(request, topic);
  if (!first) {
    safeLog(topic, shop, "duplicate delivery ignored");
    return new Response(null, { status: 200 });
  }

  try {
    const p = payload as CustomersUpdatePayload;
    if (!isSubscribed(p)) {
      safeLog(topic, shop, "customer not subscribed — skipping");
      return new Response(null, { status: 200 });
    }

    const shopRow = await prisma.shop.findUnique({
      where: { shopDomain: shop },
      select: { id: true },
    });
    if (!shopRow || p.id == null) {
      safeLog(topic, shop, "shop or customer id missing");
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
      action: "newsletter",
      oncePerKey: "newsletter",
    });
    safeLog(topic, shop, `newsletter processed (${result.outcome})`);
  } catch (err) {
    safeLog(topic, shop, "newsletter processing error");
    throw err;
  }

  return new Response(null, { status: 200 });
};
