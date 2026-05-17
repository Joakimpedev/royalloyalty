// Integrations (Phase 4, brief §3a.9).
//
// Services: Klaviyo (events: points earned, tier change, reward available —
// must-have), Gorgias, Judge.me, Shopify Flow (triggers + actions), and a
// generic outbound webhook for everything else. Each connected service is one
// Integration row (unique per shopId+service). connect/disconnect from the
// Integrations admin page. No customer PII is logged.
import prisma from "../db.server";

export type IntegrationService =
  | "klaviyo"
  | "gorgias"
  | "judgeme"
  | "flow"
  | "webhook";

export const INTEGRATION_SERVICES: IntegrationService[] = [
  "klaviyo",
  "gorgias",
  "judgeme",
  "flow",
  "webhook",
];

export interface IntegrationConfig {
  // klaviyo
  apiKey?: string;
  listId?: string;
  // gorgias
  domain?: string;
  // judgeme
  shopToken?: string;
  // webhook
  url?: string;
  secret?: string;
}

export interface IntegrationView {
  service: IntegrationService;
  status: string;
  connected: boolean;
  // never expose secrets to the client — only whether they are set
  hasCredentials: boolean;
  meta: { domain?: string; listId?: string; url?: string };
}

export async function listIntegrations(
  shopId: string,
): Promise<IntegrationView[]> {
  const rows = await prisma.integration.findMany({ where: { shopId } });
  const byService = new Map(rows.map((r) => [r.service, r]));
  return INTEGRATION_SERVICES.map((service) => {
    const row = byService.get(service);
    const cfg = (row?.config as IntegrationConfig | null) ?? {};
    return {
      service,
      status: row?.status ?? "disconnected",
      connected: row?.status === "connected",
      hasCredentials: Boolean(
        cfg.apiKey || cfg.url || cfg.shopToken || cfg.domain,
      ),
      meta: { domain: cfg.domain, listId: cfg.listId, url: cfg.url },
    };
  });
}

function validate(
  service: IntegrationService,
  config: IntegrationConfig,
): string | null {
  switch (service) {
    case "klaviyo":
      if (!config.apiKey) return "Klaviyo private API key is required.";
      return null;
    case "gorgias":
      if (!config.domain) return "Your Gorgias subdomain is required.";
      return null;
    case "judgeme":
      if (!config.shopToken) return "Your Judge.me shop token is required.";
      return null;
    case "flow":
      // Flow has no credentials — connecting just enables trigger emission.
      return null;
    case "webhook":
      if (!config.url || !/^https:\/\//.test(config.url))
        return "A valid https:// webhook URL is required.";
      return null;
    default:
      return "Unknown service.";
  }
}

export async function connectIntegration(params: {
  shopId: string;
  service: IntegrationService;
  config: IntegrationConfig;
}): Promise<{ ok: boolean; error?: string }> {
  const err = validate(params.service, params.config);
  if (err) return { ok: false, error: err };

  await prisma.integration.upsert({
    where: {
      shopId_service: { shopId: params.shopId, service: params.service },
    },
    create: {
      shopId: params.shopId,
      service: params.service,
      status: "connected",
      config: params.config as object,
    },
    update: { status: "connected", config: params.config as object },
  });
  return { ok: true };
}

export async function disconnectIntegration(params: {
  shopId: string;
  service: IntegrationService;
}): Promise<{ ok: boolean }> {
  await prisma.integration.updateMany({
    where: { shopId: params.shopId, service: params.service },
    data: { status: "disconnected" },
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Event dispatch — fan an event out to every connected service
// ---------------------------------------------------------------------------

// Map our internal notification events to Klaviyo metric names. Klaviyo is the
// must-have: points earned, tier change, reward available.
const KLAVIYO_METRIC: Record<string, string> = {
  points_earned: "Royal Loyalty - Points Earned",
  tier_change: "Royal Loyalty - Tier Changed",
  reward_available: "Royal Loyalty - Reward Available",
  expiry_reminder: "Royal Loyalty - Points Expiring",
  referral_success: "Royal Loyalty - Referral Success",
};

async function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function hmacHex(secret: string, payload: string): string {
  // Lazy require so this module stays usable in any runtime; crypto is in Node.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require("crypto") as typeof import("crypto");
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Dispatch an internal event to all connected integrations for a shop.
 * Best-effort; never throws (the caller is in a loyalty-critical path).
 * `data.customerId` is the Shopify customer id (not PII per the plan: an id).
 */
export async function dispatchIntegrationEvent(
  shopDomain: string,
  event: string,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
      select: { id: true },
    });
    if (!shop) return;

    const integrations = await prisma.integration.findMany({
      where: { shopId: shop.id, status: "connected" },
    });

    for (const integ of integrations) {
      const cfg = (integ.config as IntegrationConfig | null) ?? {};
      if (integ.service === "klaviyo" && cfg.apiKey) {
        // Klaviyo Events API (server-side track).
        await postJson(
          "https://a.klaviyo.com/api/events/",
          {
            data: {
              type: "event",
              attributes: {
                metric: { data: { type: "metric", attributes: { name: KLAVIYO_METRIC[event] ?? event } } },
                properties: data,
                profile: {
                  data: {
                    type: "profile",
                    attributes: { external_id: String(data.customerId ?? "") },
                  },
                },
              },
            },
          },
          {
            Authorization: `Klaviyo-API-Key ${cfg.apiKey}`,
            revision: "2024-10-15",
          },
        );
      } else if (integ.service === "gorgias" && cfg.domain) {
        // Gorgias: post a customer event/note (loyalty context for support).
        await postJson(
          `https://${cfg.domain}.gorgias.com/api/events`,
          { type: `royal_loyalty.${event}`, data },
          {},
        );
      } else if (integ.service === "judgeme") {
        // Judge.me has no inbound event API for loyalty; the integration is
        // primarily inbound (review -> points) handled by an EarnRule. Nothing
        // to push outbound here; presence keeps the connect/disconnect UI real.
      } else if (integ.service === "webhook" && cfg.url) {
        const payload = JSON.stringify({
          event: `royal_loyalty/${event}`,
          shop: shopDomain,
          data,
          sentAt: new Date().toISOString(),
        });
        const headers: Record<string, string> = {};
        if (cfg.secret) {
          headers["X-Royal-Signature"] = hmacHex(cfg.secret, payload);
        }
        await postJson(cfg.url, JSON.parse(payload), headers);
      }
      // "flow" is a Shopify-side trigger: emitted via the Flow trigger
      // extension (extensions/loyalty-flow) — no outbound HTTP from here.
    }
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Shopify Flow — trigger + action contract
// ---------------------------------------------------------------------------
//
// Triggers (Flow LISTENS): points_earned, tier_change, reward_available,
//   referral_success — emitted via the flowTriggerReceive Admin mutation.
// Actions (Flow CALLS this app): "Adjust points" / "Add store credit" — handled
//   by the Flow action extension's run endpoint. The contract is declared here
//   so call sites and the extension agree on the shape.

export interface FlowTriggerPayload {
  trigger_id: string; // matches the trigger handle in the Flow extension TOML
  resources: { customer_id: string };
  properties: Record<string, string | number>;
}

const FLOW_TRIGGER_MUTATION = `#graphql
  mutation flowTriggerReceive($handle: String!, $payload: JSON!) {
    flowTriggerReceive(handle: $handle, payload: $payload) {
      userErrors { field message }
    }
  }`;

/**
 * Emit a Shopify Flow trigger. Best-effort; only fires when the "flow"
 * integration is connected for the shop.
 */
export async function emitFlowTrigger(params: {
  graphql: (
    q: string,
    o?: { variables?: Record<string, unknown> },
  ) => Promise<{ json: () => Promise<any> }>;
  shopId: string;
  handle: string;
  payload: FlowTriggerPayload;
}): Promise<void> {
  try {
    const flow = await prisma.integration.findFirst({
      where: {
        shopId: params.shopId,
        service: "flow",
        status: "connected",
      },
      select: { id: true },
    });
    if (!flow) return;
    await params.graphql(FLOW_TRIGGER_MUTATION, {
      variables: { handle: params.handle, payload: params.payload },
    });
  } catch {
    // best-effort
  }
}
