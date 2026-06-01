// Dev-only: wipe onboarding state for the current shop so the next visit
// to /app/onboarding lands back on the AI-generated preview.
//
// Triggered by the hidden DevPanel on the home page (5-click on the loyalty
// pill → "devmode32" → "Restart onboarding"). Gated to non-prod or when
// DEV_TOOLS_ENABLED=1 is set, so a stray gesture in prod is a no-op.

import type { ActionFunctionArgs } from "react-router";
import { Prisma } from "@prisma/client";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

function devToolsEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.DEV_TOOLS_ENABLED === "1"
  );
}

export const action = async ({ request }: ActionFunctionArgs) => {
  if (!devToolsEnabled()) {
    return new Response("Not found", { status: 404 });
  }

  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    select: { id: true },
  });
  if (!shop) return { ok: false, error: "Shop not found" };

  await prisma.$transaction(async (tx) => {
    await tx.tier.deleteMany({ where: { shopId: shop.id } });
    await tx.earnRule.deleteMany({ where: { shopId: shop.id } });
    await tx.reward.deleteMany({ where: { shopId: shop.id } });
    await tx.shop.update({
      where: { id: shop.id },
      data: { programActivatedAt: null, aiConfigSnapshot: Prisma.JsonNull },
    });
  });

  return { ok: true };
};
