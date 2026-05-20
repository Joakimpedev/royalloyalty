// Source of truth for shop-level currency + locale. The schema has had
// `Shop.currencyCode` and `Shop.primaryLocale` since Phase 1, but nothing was
// actually populating them — every reader was falling back to "USD" + "en",
// so a Norwegian or German shop displayed kr/EUR amounts as "$5". This file
// fixes both the bootstrap (fetch on first authenticated load if null) and
// the refresh (the shop/update webhook calls back into refreshShopFromAdmin).
//
// All money displayed in the admin and in transactional emails should pass
// through formatCurrency() from i18n.server.ts with values resolved by
// loadShopMoneyContext() below.

import prisma from "../db.server";
import {
  formatCurrency,
  normalizeLocale,
  type LocaleCode,
} from "./i18n.server";

const SHOP_QUERY = `#graphql
  query RoyalLoyaltyShopContext {
    shop {
      currencyCode
    }
    shopLocales {
      locale
      primary
    }
  }`;

interface AdminLike {
  graphql: (
    query: string,
    opts?: { variables?: Record<string, unknown> },
  ) => Promise<{ json: () => Promise<any> }>;
}

export interface ShopContext {
  currencyCode: string;
  locale: LocaleCode;
}

/**
 * Fetch shop currency + primary locale from Shopify Admin API and upsert into
 * the Shop record. Idempotent — safe to call on every authenticated load if
 * the cached values are missing, and again from the shop/update webhook.
 *
 * Errors are swallowed: if the call fails, the existing Shop row stays as-is
 * (or remains null if first install). The lazy-refresh in
 * loadShopMoneyContext() will retry on the next request.
 */
export async function refreshShopFromAdmin(
  admin: AdminLike,
  shopDomain: string,
): Promise<ShopContext | null> {
  try {
    const res = await admin.graphql(SHOP_QUERY);
    const json = await res.json();
    const currencyCode: string | undefined = json?.data?.shop?.currencyCode;
    const locales: Array<{ locale?: string; primary?: boolean }> =
      json?.data?.shopLocales ?? [];
    const primary = locales.find((l) => l.primary) ?? locales[0];
    const localeRaw = primary?.locale ?? "en";

    if (!currencyCode) return null;

    const normalizedLocale = normalizeLocale(localeRaw);

    await prisma.shop.upsert({
      where: { shopDomain },
      update: {
        currencyCode,
        primaryLocale: localeRaw,
      },
      create: {
        shopDomain,
        currencyCode,
        primaryLocale: localeRaw,
      },
    });

    return { currencyCode, locale: normalizedLocale };
  } catch {
    return null;
  }
}

/**
 * Read the shop context for a route loader. ALWAYS fetches from Shopify Admin
 * API first so the displayed currency reflects the merchant's current store
 * settings — if they change the shop currency in Shopify admin, the very
 * next page load in our app shows the new currency. The fetched value is
 * also written through to the DB so background contexts that don't have an
 * admin session (notifications.server.ts when firing transactional emails
 * from order/refund webhooks) can still read a recent value.
 *
 * If the Admin API call fails (rate-limited, network blip, brand-new install
 * before the session is fully provisioned), falls back to the last cached
 * value in the DB. If neither exists, falls back to USD/en as the last resort.
 *
 * Cost: one extra GraphQL call per admin page load. The query is tiny and
 * the latency is hidden behind the standard Shopify-admin-iframe load.
 */
export async function loadShopMoneyContext(
  admin: AdminLike,
  shopDomain: string,
): Promise<ShopContext> {
  // 1. Try a live fetch — write-through cache so the DB is always recent.
  const fresh = await refreshShopFromAdmin(admin, shopDomain);
  if (fresh) return fresh;

  // 2. Live fetch failed — fall back to the last cached value if we have one.
  const cached = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { currencyCode: true, primaryLocale: true },
  });
  if (cached?.currencyCode) {
    return {
      currencyCode: cached.currencyCode,
      locale: normalizeLocale(cached.primaryLocale ?? "en"),
    };
  }

  // 3. No fresh, no cache — last-resort default. The next successful admin
  // load will overwrite this with the real shop currency.
  return { currencyCode: "USD", locale: "en" };
}

/**
 * Convenience: format a money amount with the current shop context. Use this
 * in server-side renders (loader return values) when you want a pre-formatted
 * string instead of pushing the currency context into the component tree.
 */
export function formatMoney(amount: number, ctx: ShopContext): string {
  return formatCurrency(amount, ctx.currencyCode, ctx.locale);
}
