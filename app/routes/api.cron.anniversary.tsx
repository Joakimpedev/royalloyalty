// POST /api/cron/anniversary — daily anniversary points runner.
//
// Authentication: shared-secret header `X-Cron-Token` matched against the
// CRON_SECRET environment variable. No Shopify session — this is an
// out-of-band call from a scheduler (Railway cron, GitHub Actions, etc.).
//
// Setup (Railway):
//   - Add CRON_SECRET to the app's env vars (any long random string)
//   - In the Railway dashboard, create a cron service that hits this URL
//     once per day with the matching header:
//       curl -X POST https://your-app/api/cron/anniversary \
//            -H "X-Cron-Token: $CRON_SECRET"
//
// Response: 200 with a JSON report on success, 401 on bad token.
import type { ActionFunctionArgs } from "react-router";
import { runAnniversaryCron } from "../lib/cron.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    // Fail closed when no secret is configured — better to alert the
    // operator than to leave the endpoint open.
    return new Response("CRON_SECRET not configured", { status: 503 });
  }
  const provided = request.headers.get("x-cron-token");
  if (provided !== expected) {
    return new Response("Unauthorized", { status: 401 });
  }

  const report = await runAnniversaryCron();
  return Response.json({ ok: true, ...report });
};
