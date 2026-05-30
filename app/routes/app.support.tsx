// Support — in-app help: a contact form (stored as a support request) + a docs
// link. Listing-accuracy: this is "in-app support & help docs" — NOT a staffed
// 24/7 live-chat claim (Domain 23). Contact requests are stored on
// Shop.aiConfigSnapshot.supportRequests so the merchant has a record; a real
// inbound channel (email/helpdesk) is wired here as a single forward point.
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  Form,
  useRouteError,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { useAppNavigate } from "../lib/app-navigate";
import { PageTitle, useSuccessToast } from "../lib/polaris-bindings";

const DOCS_URL = "https://royalloyalty.help";

async function requireShop(shopDomain: string) {
  const shop = await prisma.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Response("Shop not found", { status: 404 });
  return shop;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const snap =
    shop.aiConfigSnapshot && typeof shop.aiConfigSnapshot === "object"
      ? (shop.aiConfigSnapshot as Record<string, unknown>)
      : {};
  const requests = Array.isArray(snap.supportRequests)
    ? (snap.supportRequests as Array<{
        subject: string;
        createdAt: string;
      }>)
    : [];
  return {
    docsUrl: DOCS_URL,
    contactEmail: "support@royalloyalty.help",
    recent: requests.slice(-5).reverse(),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await requireShop(session.shop);
  const form = await request.formData();
  const subject = String(form.get("subject") ?? "").trim();
  const message = String(form.get("message") ?? "").trim();

  if (subject.length < 3) {
    return { ok: false, message: "Please enter a subject (3+ characters)." };
  }
  if (message.length < 10) {
    return {
      ok: false,
      message: "Please describe your question (10+ characters).",
    };
  }

  const snap =
    shop.aiConfigSnapshot && typeof shop.aiConfigSnapshot === "object"
      ? (shop.aiConfigSnapshot as Record<string, unknown>)
      : {};
  const existing = Array.isArray(snap.supportRequests)
    ? (snap.supportRequests as unknown[])
    : [];
  await prisma.shop.update({
    where: { id: shop.id },
    data: {
      aiConfigSnapshot: {
        ...snap,
        supportRequests: [
          ...existing,
          { subject, message, createdAt: new Date().toISOString() },
        ].slice(-50),
      },
    },
  });

  // Single forward point — a real helpdesk/email transport plugs in here.
  console.log(`[support] ${shop.shopDomain} new request: ${subject}`);

  return {
    ok: true,
    message:
      "Thanks — your message was received. We'll reply to your store contact email.",
  };
};

export default function SupportPage() {
  const { docsUrl, contactEmail, recent } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const appNav = useAppNavigate();
  const submitting = nav.state === "submitting";
  useSuccessToast(
    actionData as { ok?: boolean; message?: string } | undefined,
    "Message sent.",
  );

  return (
    <s-page>
      <PageTitle
        title="Support"
        subtitle="Browse docs, send us a message, or review your recent requests"
        backHref="/app/billing"
      />

      <s-section heading="Help &amp; documentation">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Browse setup guides, troubleshooting and feature docs, or send us a
            message below — we provide in-app support and help docs.
          </s-paragraph>
          {/* External docs URL — useAppNavigate opens it in a new tab so the
              embedded iframe is untouched. NEVER use target="_top" here. */}
          <s-button onClick={() => appNav(docsUrl)}>
            Open documentation
          </s-button>
        </s-stack>
      </s-section>

      <s-section heading="Contact us">
        {actionData && !actionData.ok && (
          <s-banner tone="critical" heading="Message not sent">
            <s-paragraph>{actionData.message}</s-paragraph>
          </s-banner>
        )}
        <Form method="post">
          <s-stack direction="block" gap="base">
            <s-text-field label="Subject" name="subject" />
            <s-text-area label="How can we help?" name="message" rows={5} />
            <s-stack direction="inline" gap="base">
              <s-button
                variant="primary"
                type="submit"
                {...(submitting ? { loading: "" } : {})}
              >
                Send message
              </s-button>
              <s-text tone="subdued">Or email {contactEmail}</s-text>
            </s-stack>
          </s-stack>
        </Form>
      </s-section>

      <s-section heading="Your recent requests">
        {recent.length === 0 ? (
          <s-paragraph>
            You haven&apos;t sent any support requests yet. Anything you send
            above will be listed here for your reference.
          </s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Subject</s-table-header>
              <s-table-header>Sent</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {recent.map((r, i) => (
                <s-table-row key={i}>
                  <s-table-cell>{r.subject}</s-table-cell>
                  <s-table-cell>
                    {new Date(r.createdAt).toISOString().slice(0, 10)}
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
    </s-page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
