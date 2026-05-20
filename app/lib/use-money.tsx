// Currency hook for components — reads the shop's currency + locale that
// were loaded ONCE by app.tsx (the parent layout loader) and shares them
// across every child route via React Router's data layer. No extra Shopify
// calls; no per-loader plumbing required.
//
// Usage:
//   const fmt = useMoney();
//   <s-text>{fmt(reward.value)}</s-text>     // → "kr 5.00" / "$5.00" / etc.
//   <s-text>{fmt(1)}</s-text>                // → "$1.00" or "kr 1,00"
//
// For "per $1" / "per kr 1" copy:
//   `Customers earn ${points} points for every ${fmt(1)} spent.`

import { useCallback } from "react";
import { useRouteLoaderData } from "react-router";

// Intl.NumberFormat works identically in Node and the browser — no need to
// pull this from i18n.server.ts (which would drag a server-only import into
// the client bundle).
export function formatMoney(
  amount: number,
  currencyCode: string,
  locale: string,
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currencyCode,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currencyCode}`;
  }
}

type MaybeMoneyData = {
  money?: { currencyCode: string; locale: string };
};

// flatRoutes' route IDs aren't fully consistent across versions — depending
// on the setup, `app/routes/app.tsx` can be registered as "routes/app" OR
// "app". Try both so the hook resolves regardless. If neither is reachable
// (e.g. the page renders outside the /app layout, or the parent loader
// hasn't run yet), fall back to USD/en as a last resort.
export function useShopMoney(): { currencyCode: string; locale: string } {
  const a = useRouteLoaderData("routes/app") as MaybeMoneyData | undefined;
  if (a?.money) return a.money;
  const b = useRouteLoaderData("app") as MaybeMoneyData | undefined;
  if (b?.money) return b.money;
  return { currencyCode: "USD", locale: "en" };
}

/**
 * Returns a function that formats a number in the shop's currency.
 * Stable across renders. Use this for any money display in admin components.
 */
export function useMoney(): (amount: number) => string {
  const { currencyCode, locale } = useShopMoney();
  return useCallback(
    (amount: number) => formatMoney(amount, currencyCode, locale),
    [currencyCode, locale],
  );
}
