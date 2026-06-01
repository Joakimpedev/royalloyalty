// JSON probe for the onboarding wizard's step 4 status indicator. Re-fetched
// every time the page mounts, the tab regains focus, or the document becomes
// visible — so the merchant can flip the embed on in the theme editor, come
// back to this tab, and see the status flip without a manual refresh.

import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { checkAppEmbedEnabled } from "../lib/theme-embed.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const check = await checkAppEmbedEnabled(admin, {
    shop: session.shop,
    accessToken: session.accessToken,
  });
  return { enabled: check.enabled, debug: check.debug };
};
