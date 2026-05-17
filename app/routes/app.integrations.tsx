// Integrations — connect/disconnect Klaviyo, Gorgias, Judge.me, Shopify Flow,
// and a generic outbound webhook. 3-element empty state when nothing connected.
import { useState } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  useLoaderData,
  useActionData,
  useNavigation,
  useSubmit,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  listIntegrations,
  connectIntegration,
  disconnectIntegration,
  type IntegrationService,
} from "../lib/integrations.server";

async function requireShop(shopDomain: string) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Response("Shop not found", { status: 404 });
  return shop;
}

const LABELS: Record<IntegrationService, string> = {
  klaviyo: "Klaviyo",
  gorgias: "Gorgias",
  judgeme: "Judge.me",
  flow: "Shopify Flow",
  webhook: "Outbound webhook",
};

const DESCRIPTIONS: Record<IntegrationService, string> = {
  klaviyo:
    "Send loyalty events (points earned, tier change, reward available) to Klaviyo flows.",
  gorgias:
    "Surface a customer's loyalty status inside Gorgias support tickets.",
  judgeme:
    "Award points for verified product reviews collected with Judge.me.",
  flow: "Use loyalty events as Shopify Flow triggers and expose Flow actions.",
  webhook:
    "Send a signed JSON event to any HTTPS endpoint for custom integrations.",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  return { integrations: await listIntegrations(shop.id) };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const form = await request.formData();
  const intent = String(form.get("_intent"));
  const service = String(form.get("service")) as IntegrationService;

  if (intent === "disconnect") {
    await disconnectIntegration({ shopId: shop.id, service });
    return { ok: true, message: `${LABELS[service]} disconnected.` };
  }

  const config = {
    apiKey: String(form.get("apiKey") ?? "").trim() || undefined,
    listId: String(form.get("listId") ?? "").trim() || undefined,
    domain: String(form.get("domain") ?? "").trim() || undefined,
    shopToken: String(form.get("shopToken") ?? "").trim() || undefined,
    url: String(form.get("url") ?? "").trim() || undefined,
    secret: String(form.get("secret") ?? "").trim() || undefined,
  };
  const res = await connectIntegration({ shopId: shop.id, service, config });
  return res.ok
    ? { ok: true, message: `${LABELS[service]} connected.` }
    : { ok: false, message: res.error ?? "Could not connect." };
};

export default function IntegrationsPage() {
  const { integrations } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const submit = useSubmit();
  const saving = nav.state === "submitting";

  const [open, setOpen] = useState<IntegrationService | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});

  const anyConnected = integrations.some((i) => i.connected);

  const connect = (service: IntegrationService) => {
    const fd = new FormData();
    fd.set("_intent", "connect");
    fd.set("service", service);
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    submit(fd, { method: "POST" });
    setOpen(null);
    setFields({});
  };

  return (
    <s-page heading="Integrations">
      <s-button slot="primary-action" href="/app">
        Back to Home
      </s-button>

      {actionData && !actionData.ok && (
        <s-section>
          <s-banner tone="critical" heading="Could not connect">
            <s-paragraph>{actionData.message}</s-paragraph>
          </s-banner>
        </s-section>
      )}
      {actionData && actionData.ok && (
        <s-section>
          <s-banner tone="success">
            <s-paragraph>{actionData.message}</s-paragraph>
          </s-banner>
        </s-section>
      )}

      {!anyConnected && (
        <s-section heading="Connect your first integration">
          <s-stack direction="block" gap="base">
            <s-heading>No integrations connected yet</s-heading>
            <s-paragraph>
              Connect Klaviyo to power loyalty emails, or wire Royal into your
              support, reviews and automation stack. Pick a service below to get
              started.
            </s-paragraph>
            <s-button variant="primary" onClick={() => setOpen("klaviyo")}>
              Connect Klaviyo
            </s-button>
          </s-stack>
        </s-section>
      )}

      {integrations.map((integ) => (
        <s-section key={integ.service} heading={LABELS[integ.service]}>
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" gap="base">
              <s-badge tone={integ.connected ? "success" : "neutral"}>
                {integ.connected ? "Connected" : "Not connected"}
              </s-badge>
              {integ.meta.domain && (
                <s-text tone="subdued">{integ.meta.domain}</s-text>
              )}
              {integ.meta.url && (
                <s-text tone="subdued">{integ.meta.url}</s-text>
              )}
            </s-stack>
            <s-paragraph>{DESCRIPTIONS[integ.service]}</s-paragraph>

            {open === integ.service && (
              <s-stack direction="block" gap="base">
                {integ.service === "klaviyo" && (
                  <>
                    <s-text-field
                      label="Klaviyo private API key"
                      value={fields.apiKey ?? ""}
                      onChange={(e: { target: { value: string } }) =>
                        setFields((f) => ({ ...f, apiKey: e.target.value }))
                      }
                    />
                    <s-text-field
                      label="List ID (optional)"
                      value={fields.listId ?? ""}
                      onChange={(e: { target: { value: string } }) =>
                        setFields((f) => ({ ...f, listId: e.target.value }))
                      }
                    />
                  </>
                )}
                {integ.service === "gorgias" && (
                  <s-text-field
                    label="Gorgias subdomain"
                    value={fields.domain ?? ""}
                    onChange={(e: { target: { value: string } }) =>
                      setFields((f) => ({ ...f, domain: e.target.value }))
                    }
                  />
                )}
                {integ.service === "judgeme" && (
                  <s-text-field
                    label="Judge.me shop token"
                    value={fields.shopToken ?? ""}
                    onChange={(e: { target: { value: string } }) =>
                      setFields((f) => ({ ...f, shopToken: e.target.value }))
                    }
                  />
                )}
                {integ.service === "flow" && (
                  <s-paragraph>
                    Connecting enables Royal loyalty events as Shopify Flow
                    triggers. No credentials are required.
                  </s-paragraph>
                )}
                {integ.service === "webhook" && (
                  <>
                    <s-text-field
                      label="HTTPS endpoint URL"
                      value={fields.url ?? ""}
                      onChange={(e: { target: { value: string } }) =>
                        setFields((f) => ({ ...f, url: e.target.value }))
                      }
                    />
                    <s-text-field
                      label="Signing secret (optional)"
                      value={fields.secret ?? ""}
                      onChange={(e: { target: { value: string } }) =>
                        setFields((f) => ({ ...f, secret: e.target.value }))
                      }
                    />
                  </>
                )}
                <s-stack direction="inline" gap="base">
                  <s-button
                    variant="primary"
                    onClick={() => connect(integ.service)}
                    {...(saving ? { loading: "" } : {})}
                  >
                    Save connection
                  </s-button>
                  <s-button
                    onClick={() => {
                      setOpen(null);
                      setFields({});
                    }}
                  >
                    Cancel
                  </s-button>
                </s-stack>
              </s-stack>
            )}

            {open !== integ.service && (
              <s-stack direction="inline" gap="base">
                <s-button onClick={() => setOpen(integ.service)}>
                  {integ.connected ? "Edit connection" : "Connect"}
                </s-button>
                {integ.connected && (
                  <s-button
                    tone="critical"
                    onClick={() =>
                      submit(
                        { _intent: "disconnect", service: integ.service },
                        { method: "POST" },
                      )
                    }
                  >
                    Disconnect
                  </s-button>
                )}
              </s-stack>
            )}
          </s-stack>
        </s-section>
      ))}
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
