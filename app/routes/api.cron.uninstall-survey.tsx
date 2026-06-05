// Cron endpoint — sends the founder-style post-uninstall feedback email to
// merchants who uninstalled Royal Loyalty, after a 6h cooling-off window and
// within a 7d backstop.
//
// Auth: x-cron-secret header must match process.env.CRON_SECRET.
// Method: POST.
//
// Optional query params:
//   ?shop=<domain>   Limit to a single shop.
//   ?force=1         Bypass the time window AND the uninstallSurveySentAt
//                    dedup. Still requires ownerEmail set and the shop NOT
//                    currently reinstalled (offline session absent).
//   ?dryRun=1        Skip Resend + DB update.
//
// Dedup: Shop.uninstallSurveySentAt is updated only on a successful send.
// Each shop receives at most one survey, ever.

import type { ActionFunctionArgs } from "react-router";
import { timingSafeEqual } from "node:crypto";
import prisma from "../db.server";
import { sendUninstallSurveyEmail } from "../lib/uninstall-survey-email.server";

const CRON_SECRET = process.env.CRON_SECRET ?? "";

const SEND_DELAY_MS = 6 * 60 * 60 * 1000;
const SEND_BACKSTOP_MS = 7 * 24 * 60 * 60 * 1000;

type SendResult = {
  shop: string;
  outcome: "sent" | "skipped" | "error" | "dryRun";
  reason?: string;
  recipient?: string;
  messageId?: string | null;
};

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

  const now = new Date();
  const windowEnd = new Date(now.getTime() - SEND_DELAY_MS);
  const windowStart = new Date(now.getTime() - SEND_BACKSTOP_MS);

  const candidates = await prisma.shop.findMany({
    where: {
      ownerEmail: { not: null },
      ...(targetShop ? { shopDomain: targetShop } : {}),
      ...(force
        ? { uninstalledAt: { not: null } }
        : {
            uninstallSurveySentAt: null,
            uninstalledAt: { gte: windowStart, lte: windowEnd },
          }),
    },
    select: {
      id: true,
      shopDomain: true,
      ownerEmail: true,
      uninstalledAt: true,
      uninstallSurveySentAt: true,
    },
  });

  const results: SendResult[] = [];

  for (const c of candidates) {
    const shop = c.shopDomain;
    try {
      const installed = await prisma.session.findFirst({
        where: { shop, isOnline: false },
        select: { id: true },
      });
      if (installed) {
        results.push({
          shop,
          outcome: "skipped",
          reason: "currently-reinstalled",
        });
        continue;
      }

      const recipient = c.ownerEmail!;

      if (dryRun) {
        results.push({
          shop,
          outcome: "dryRun",
          recipient,
          reason: `would-send (uninstalledAt=${c.uninstalledAt?.toISOString() ?? "null"})`,
        });
        continue;
      }

      const { messageId } = await sendUninstallSurveyEmail({ recipient });

      await prisma.shop.update({
        where: { id: c.id },
        data: { uninstallSurveySentAt: new Date() },
      });

      results.push({
        shop,
        outcome: "sent",
        recipient,
        messageId,
      });
    } catch (err) {
      console.error(
        `[cron uninstall-survey] unhandled error for ${shop}`,
        err,
      );
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
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    targetShop: targetShop ?? null,
    force,
    dryRunMode: dryRun,
  };
  console.log("[cron uninstall-survey] run complete", summary);

  return Response.json({ ...summary, results });
};

export const ErrorBoundary = () => null;
