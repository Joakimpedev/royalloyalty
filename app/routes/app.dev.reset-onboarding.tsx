// Wipes onboarding state for the current shop so the next visit to
// /app/onboarding lands back on the AI-generated preview.
//
// Triggered by the hidden DevPanel on the home page (5-click on the loyalty
// pill → "devmode32" → "Restart onboarding"). Reachable in prod too — the
// gesture + password + Shopify admin auth + per-shop scope are the gate.

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Prisma } from "@prisma/client";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// GET → JSON probe so the dev panel can surface a useful diagnostic if
// something is wrong (auth, routing). The actual reset only runs on POST.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return { ok: true, route: "dev.reset-onboarding", shop: session.shop };
};

export const action = async ({ request }: ActionFunctionArgs) => {
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
