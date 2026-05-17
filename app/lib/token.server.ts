// Background-job token handling. Expiring offline tokens: access expires hourly,
// refresh tokens are single-use (concurrent refresh = race) and die after 90 days
// inactivity. Every scheduled job (AI optimization, store-credit reconciliation,
// quota rollover) wraps Shopify API calls in withFreshToken().
import prisma from "../db.server";
import shopify from "../shopify.server";

export async function withFreshToken<T>(
  shopDomain: string,
  fn: (admin: any) => Promise<T>,
): Promise<T | null> {
  const session = await prisma.session.findFirst({ where: { shop: shopDomain } });
  if (!session) return null;

  // Dead refresh token (90-day inactivity) — skip with a warning, never crash.
  if (session.refreshTokenExpires && session.refreshTokenExpires < new Date()) {
    console.warn(`[token] ${shopDomain} refresh token expired — skipping job`);
    return null;
  }

  // DB lock so two workers never refresh the single-use token simultaneously.
  if (session.refreshTokenLock && Date.now() - session.refreshTokenLock.getTime() < 60_000) {
    return null; // another worker is refreshing; skip this tick
  }
  await prisma.session.update({
    where: { id: session.id },
    data: { refreshTokenLock: new Date() },
  });
  try {
    const { admin } = await shopify.unauthenticated.admin(shopDomain);
    return await fn(admin);
  } finally {
    await prisma.session.update({
      where: { id: session.id },
      data: { refreshTokenLock: null },
    });
  }
}
