import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";
import { loadShopMoneyContext } from "../lib/shop-context.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Bootstrap (and lazy-refresh) the shop's currency + primary locale on every
  // authenticated load. The first authenticated render hits Shopify's Admin
  // API once and persists the values; subsequent loads read straight from the
  // DB. The shop/update webhook also calls refreshShopFromAdmin to keep this
  // current if the merchant switches their store currency. The shape returned
  // here is meant to be the currency for *display* — server-side billing
  // amounts (Shopify Billing API) intentionally stay in USD; see billing.server.ts.
  const money = await loadShopMoneyContext(admin, session.shop);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "", money };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      {/* Official Shopify React Router template ships <s-app-nav> (Polaris Web
          Components). The dev-plan/audit note preferred <ui-nav-menu> from an
          older App Bridge v4.x context; this template version is authoritative
          for this stack, so we follow it. Reconciliation logged in ACTION-REQUIRED. */}
      {/* Nav compressed to 6 items (was 15) per competitor analysis: Program is a
          catalog landing that folds Earn/Redeem/Referrals/VIP/Store Credit/Suggestions;
          Settings absorbs Billing/Import/Support; Integrations removed entirely.
          Setup/onboarding is a flow reached from Home, not a nav destination. */}
      <s-app-nav>
        <s-link href="/app" rel="home">Home</s-link>
        <s-link href="/app/program">Program</s-link>
        <s-link href="/app/members">Members</s-link>
        <s-link href="/app/branding">Branding</s-link>
        <s-link href="/app/localization">Localization</s-link>
        <s-link href="/app/analytics">Analytics</s-link>
        <s-link href="/app/billing">Billing</s-link>
      </s-app-nav>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
