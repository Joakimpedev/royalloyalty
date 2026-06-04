// Server-only side of the Royal Loyalty over-cap email. Anything that
// touches Resend, process.env at module-load, or the DB lives here.

import { Resend } from "resend";
import {
  OVERCAP_SUBJECT,
  renderOverCapEmailHtml,
  renderOverCapEmailText,
} from "./over-cap-email";

export {
  OVERCAP_SUBJECT,
  renderOverCapEmailHtml,
  renderOverCapEmailText,
} from "./over-cap-email";

export const OVERCAP_FROM_ADDRESS =
  process.env.ROYAL_OVERCAP_FROM_EMAIL ||
  process.env.SUPPORT_FROM_EMAIL ||
  "Royal Loyalty <noreply@reloop-returns.com>";

export function buildOverCapBillingUrl(shop: string): string {
  return `https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY ?? ""}/app/billing`;
}

export function buildOverCapLogoUrl(): string {
  const appOrigin = (process.env.SHOPIFY_APP_URL ?? "").replace(/\/$/, "");
  return appOrigin ? `${appOrigin}/logotrans.png` : "";
}

/**
 * Send a single over-cap email. Throws on Resend error so callers can decide
 * whether to retry or skip. Does NOT touch the database — the caller is
 * responsible for updating Shop.lastOverCapEmailSentAt only on success.
 */
export async function sendOverCapEmail({
  recipient,
  shopName,
  shop,
}: {
  recipient: string;
  shopName: string;
  shop: string;
}): Promise<{ messageId: string | null }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not set");

  const resend = new Resend(apiKey);
  const billingUrl = buildOverCapBillingUrl(shop);
  const logoUrl = buildOverCapLogoUrl();

  const { data, error } = await resend.emails.send({
    from: OVERCAP_FROM_ADDRESS,
    to: recipient,
    subject: OVERCAP_SUBJECT,
    html: renderOverCapEmailHtml({ shopName, billingUrl, logoUrl }),
    text: renderOverCapEmailText({ shopName, billingUrl }),
  });
  if (error) {
    throw new Error(`Resend: ${error.message ?? String(error)}`);
  }
  return { messageId: data?.id ?? null };
}
