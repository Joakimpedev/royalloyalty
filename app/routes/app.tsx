import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      {/* Official Shopify React Router template ships <s-app-nav> (Polaris Web
          Components). The dev-plan/audit note preferred <ui-nav-menu> from an
          older App Bridge v4.x context; this template version is authoritative
          for this stack, so we follow it. Reconciliation logged in ACTION-REQUIRED. */}
      <s-app-nav>
        <s-link href="/app" rel="home">Home</s-link>
        <s-link href="/app/onboarding">Setup</s-link>
        <s-link href="/app/program">Program</s-link>
        <s-link href="/app/tiers">VIP Tiers</s-link>
        <s-link href="/app/rewards">Rewards</s-link>
        <s-link href="/app/referrals">Referrals</s-link>
        <s-link href="/app/storecredit">Store Credit</s-link>
        <s-link href="/app/members">Members</s-link>
        <s-link href="/app/analytics">Analytics</s-link>
        <s-link href="/app/suggestions">Suggestions</s-link>
        <s-link href="/app/branding">Branding</s-link>
        <s-link href="/app/integrations">Integrations</s-link>
        <s-link href="/app/import">Import</s-link>
        <s-link href="/app/support">Support</s-link>
        <s-link href="/app/settings">Settings</s-link>
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
