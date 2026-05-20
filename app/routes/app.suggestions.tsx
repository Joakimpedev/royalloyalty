// Royal Loyalty — AI optimization suggestions (Phase 3 #9).
//
// Lists open/handled AiSuggestion rows produced by the scheduled optimization
// engine (suggestions.server). Suggestions are NEVER auto-applied: the merchant
// accepts (status → applied) or dismisses (status → dismissed) each card.
// Empty state has all 3 required elements (title, distinct subtitle, primary CTA).

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { AppLink } from "../lib/app-navigate";
import { BreadcrumbBackLink } from "../lib/polaris-bindings";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.upsert({
    where: { shopDomain: session.shop },
    update: {},
    create: { shopDomain: session.shop },
    select: { id: true },
  });

  const suggestions = await prisma.aiSuggestion.findMany({
    where: { shopId: shop.id },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  });

  return {
    suggestions: suggestions.map((s) => ({
      id: s.id,
      kind: s.kind,
      title: s.title,
      body: s.body,
      status: s.status,
      createdAt: s.createdAt.toISOString(),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    select: { id: true },
  });
  if (!shop) return { ok: false, error: "Shop not found" };

  const form = await request.formData();
  const id = String(form.get("id") ?? "");
  const intent = form.get("intent");
  if (!id) return { ok: false, error: "Missing suggestion id" };

  // Scope the update to this shop so a forged id cannot touch another store.
  const existing = await prisma.aiSuggestion.findFirst({
    where: { id, shopId: shop.id },
    select: { id: true, status: true },
  });
  if (!existing) return { ok: false, error: "Suggestion not found" };
  if (existing.status !== "open") {
    return { ok: false, error: "Suggestion already handled" };
  }

  const next =
    intent === "accept"
      ? "applied"
      : intent === "dismiss"
        ? "dismissed"
        : null;
  if (!next) return { ok: false, error: "Unknown intent" };

  await prisma.aiSuggestion.update({
    where: { id },
    data: { status: next },
  });
  return { ok: true, id, status: next };
};

export default function Suggestions() {
  const { suggestions } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const busy = fetcher.state !== "idle";

  const act = (id: string, intent: "accept" | "dismiss") =>
    fetcher.submit({ id, intent }, { method: "POST" });

  if (suggestions.length === 0) {
    return (
      <s-page heading="Optimization suggestions">
        <BreadcrumbBackLink href="/app/program" label="Program" />
        <s-section heading="No suggestions yet">
          <s-paragraph>
            As your program collects redemption and earning data, Royal Loyalty
            analyses it and proposes concrete tweaks here — nothing is ever
            applied automatically.
          </s-paragraph>
          <AppLink href="/app/analytics">View program analytics</AppLink>
        </s-section>
      </s-page>
    );
  }

  return (
    <s-page heading="Optimization suggestions">
      <BreadcrumbBackLink href="/app/program" label="Program" />
      <s-section heading="Reviewable suggestions">
        <s-paragraph>
          Each suggestion is computed from your own program data. Review and
          accept or dismiss — nothing changes until you accept.
        </s-paragraph>
        {fetcher.data?.ok === false && (
          <s-banner tone="critical">
            <s-paragraph>{fetcher.data.error}</s-paragraph>
          </s-banner>
        )}
        <s-stack direction="block" gap="base">
          {suggestions.map((s) => (
            <s-box
              key={s.id}
              padding="base"
              borderWidth="base"
              borderRadius="base"
            >
              <s-stack direction="block" gap="base">
                <s-stack direction="inline" gap="base">
                  <s-heading>{s.title}</s-heading>
                  {s.status !== "open" && (
                    <s-badge
                      tone={s.status === "applied" ? "success" : "neutral"}
                    >
                      {s.status}
                    </s-badge>
                  )}
                </s-stack>
                <s-paragraph>{s.body}</s-paragraph>
                {s.status === "open" && (
                  <s-stack direction="inline" gap="base">
                    <s-button
                      onClick={() => act(s.id, "accept")}
                      {...(busy ? { loading: true } : {})}
                    >
                      Accept
                    </s-button>
                    <s-button
                      variant="tertiary"
                      onClick={() => act(s.id, "dismiss")}
                      {...(busy ? { loading: true } : {})}
                    >
                      Dismiss
                    </s-button>
                  </s-stack>
                )}
              </s-stack>
            </s-box>
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}
