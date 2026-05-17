// Volume quota. STUB in Phase 1 (returns true). Phase 5 fills real monthly
// loyalty-order logic. Wired into every earn/redeem entry point from day one so
// enforcement is never retrofitted. NOTE: no FEATURE is ever gated — volume only.
import prisma from "../db.server";

export async function canAwardLoyalty(shopId: string): Promise<boolean> {
  // Phase 5 replaces this body with: compare Shop.monthlyLoyaltyOrderCount
  // against the plan cap (FREE 250 / STARTER ~500 / GROWTH ~2000 / PRO high),
  // resetting on Shop.quotaPeriodStart rollover. Until then: allow.
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { isActive: true } });
  return shop?.isActive ?? false;
}
