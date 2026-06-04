// Cron endpoint — sends the over-cap notification email to merchants whose
// current calendar-month loyalty-order count has exceeded their plan's cap
// and who have not yet been emailed this cycle.
//
// Auth: x-cron-secret header must match process.env.CRON_SECRET.
// Method: POST.
//
// Optional query params:
//   ?shop=<domain>       Limit to a single shop.
//   ?force=1             Bypass the lastOverCapEmailSentAt dedup.
//   ?dryRun=1            Skip Resend + DB update; just list candidates.
//
// Dedup: Shop.lastOverCapEmailSentAt is updated only on a successful send.
// A shop is skipped if it was already emailed in the current calendar month.
//
// Failure isolation: per-shop errors are caught and recorded; one bad shop
// doesn't abort the run.
//
// Cap evaluation goes through getQuotaState() so this never disagrees with
// the in-app gate.

import type { ActionFunctionArgs } from "react-router";
import { timingSafeEqual } from "node:crypto";
import { unauthenticated } from "../shopify.server";
import prisma from "../db.server";
import { getQuotaState } from "../lib/quota.server";
import { sendOverCapEmail } from "../lib/over-cap-email.server";

const CRON_SECRET = process.env.CRON_SECRET ?? "";

type SendResult = {
  shop: string;
  outcome: "sent" | "skipped" | "error" | "dryRun";
  reason?: string;
  recipient?: string;
  messageId?: string | null;
};

function startOfCurrentMonth(): Date {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const secret = request.headers.get("x-cron-secret");
  const secretBuf = Buffer.from(secret ?? "");
  const expectedBuf = Buffer.from(CRON_SECRET);
  if (
    !CRON_SECRET ||
    secretBuf.length !== expectedBuf.length ||
    !timingSafeEqual(secretBuf, expectedBuf)
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.RESEND_API_KEY) {
    return Response.json({ error: "RESEND_API_KEY not set" }, { status: 500 });
  }

  const url = new URL(request.url);
  const targetShop = url.searchParams.get("shop");
  const force = url.searchParams.get("force") === "1";
  const dryRun = url.searchParams.get("dryRun") === "1";

  const cycleStart = startOfCurrentMonth();

  const candidates = await prisma.shop.findMany({
    where: {
      isActive: true,
      ...(targetShop
        ? { shopDomain: targetShop }
        : force
          ? {}
          : {
              OR: [
                { lastOverCapEmailSentAt: null },
                { lastOverCapEmailSentAt: { lt: cycleStart } },
              ],
            }),
    },
    select: {
      id: true,
      shopDomain: true,
      lastOverCapEmailSentAt: true,
    },
  });

  const results: SendResult[] = [];

  for (const c of candidates) {
    const shop = c.shopDomain;
    try {
      if (
        !force &&
        c.lastOverCapEmailSentAt &&
        c.lastOverCapEmailSentAt >= cycleStart
      ) {
        results.push({
          shop,
          outcome: "skipped",
          reason: "already-emailed-this-cycle",
        });
        continue;
      }

      // Need an offline session to authenticate to Shopify for the owner email.
      const installed = await prisma.session.findFirst({
        where: { shop, isOnline: false },
        select: { id: true },
      });
      if (!installed) {
        results.push({ shop, outcome: "skipped", reason: "no-offline-session" });
        continue;
      }

      // Re-verify still over cap using the same logic the in-app gate uses.
      const quota = await getQuotaState(c.id);
      if (!quota) {
        results.push({ shop, outcome: "skipped", reason: "shop-not-found" });
        continue;
      }
      if (quota.cap === null) {
        results.push({ shop, outcome: "skipped", reason: "plan-has-no-cap" });
        continue;
      }
      if (!quota.overCap) {
        results.push({ shop, outcome: "skipped", reason: "no-longer-over-cap" });
        continue;
      }

      let adminCtx;
      try {
        adminCtx = await unauthenticated.admin(shop);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          shop,
          outcome: "error",
          reason: `unauthenticated.admin failed: ${msg.slice(0, 200)}`,
        });
        continue;
      }

      let ownerEmail = "";
      let shopName = shop;
      try {
        const response = await adminCtx.admin.graphql(`#graphql
          query ShopOwnerEmail { shop { name email } }
        `);
        const json = (await response.json()) as {
          data?: { shop?: { name?: string; email?: string } };
        };
        ownerEmail = json.data?.shop?.email ?? "";
        shopName = json.data?.shop?.name ?? shop;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          shop,
          outcome: "error",
          reason: `shop.email fetch failed: ${msg.slice(0, 200)}`,
        });
        continue;
      }

      if (!ownerEmail) {
        results.push({ shop, outcome: "skipped", reason: "owner-email-empty" });
        continue;
      }

      if (dryRun) {
        results.push({
          shop,
          outcome: "dryRun",
          recipient: ownerEmail,
          reason: `would-send (used=${quota.used} cap=${quota.cap})`,
        });
        continue;
      }

      const { messageId } = await sendOverCapEmail({
        recipient: ownerEmail,
        shopName,
        shop,
      });

      await prisma.shop.update({
        where: { id: c.id },
        data: { lastOverCapEmailSentAt: new Date() },
      });

      results.push({
        shop,
        outcome: "sent",
        recipient: ownerEmail,
        messageId,
      });
    } catch (err) {
      console.error(`[cron over-cap-email] unhandled error for ${shop}`, err);
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        shop,
        outcome: "error",
        reason: msg.slice(0, 200),
      });
    }
  }

  const summary = {
    checked: results.length,
    sent: results.filter((r) => r.outcome === "sent").length,
    dryRun: results.filter((r) => r.outcome === "dryRun").length,
    skipped: results.filter((r) => r.outcome === "skipped").length,
    errors: results.filter((r) => r.outcome === "error").length,
    cycleStart: cycleStart.toISOString(),
    targetShop: targetShop ?? null,
    force,
    dryRunMode: dryRun,
  };
  console.log("[cron over-cap-email] run complete", summary);

  return Response.json({ ...summary, results });
};

export const ErrorBoundary = () => null;
