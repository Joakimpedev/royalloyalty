import type { ActionFunctionArgs } from "react-router";
import { Resend } from "resend";
import { authenticate } from "../shopify.server";
import { C } from "../lib/support-tokens";

// Receives a support request from the bubble / FAQ contact modal and forwards
// it as an email via Resend. The merchant's email goes in the From display
// name + Reply-To so hitting Reply in the inbox goes straight to them.
//
// Addresses are hardcoded on purpose (no env vars): reloop-returns.com is the
// sending "vehicle" verified in Resend, and the Dealify inbox is where every
// app's support mail lands. Only the Resend API key stays a secret env var.

const SUPPORT_INBOX = "dealifynordahl@gmail.com";
const FROM_ADDRESS = "Royal Loyalty Support <noreply@reloop-returns.com>";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  if (request.method !== "POST") {
    return Response.json({ ok: false, error: "Method not allowed" }, { status: 405 });
  }

  const form = await request.formData();
  const email = String(form.get("email") || "").trim();
  const subject = String(form.get("subject") || "").trim();
  const message = String(form.get("message") || "").trim();

  if (!email || !subject || !message) {
    return Response.json({ ok: false, error: "Missing fields" }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ ok: false, error: "Invalid email" }, { status: 400 });
  }
  if (subject.length > 200 || message.length > 5000) {
    return Response.json({ ok: false, error: "Message too long" }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[support-ticket] RESEND_API_KEY not set");
    return Response.json({ ok: false, error: "Email service not configured" }, { status: 500 });
  }

  const resend = new Resend(apiKey);

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; padding: 16px;">
      <div style="background: ${C.navyFaint}; padding: 12px 14px; border-radius: 6px; margin-bottom: 16px;">
        <div style="font-size: 11px; font-weight: 700; color: ${C.accent}; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 4px;">Royal Loyalty support ticket</div>
        <div style="font-size: 13px; color: #111827;"><strong>Shop:</strong> ${escapeHtml(shop)}</div>
        <div style="font-size: 13px; color: #111827;"><strong>From:</strong> ${escapeHtml(email)}</div>
      </div>
      <div style="font-size: 15px; font-weight: 600; color: #111827; margin-bottom: 8px;">${escapeHtml(subject)}</div>
      <div style="font-size: 14px; color: #111827; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(message)}</div>
    </div>
  `;

  const text = `Royal Loyalty support ticket\nShop: ${shop}\nFrom: ${email}\n\nSubject: ${subject}\n\n${message}`;

  // Customer email lives in the display name (we can't put it in the bare
  // From: because the domain isn't ours — would fail SPF/DKIM). Reply-To is
  // the actual customer address, so hitting Reply in Gmail goes to them.
  const fromWithName = `${email} via Royal Loyalty <${stripDisplayName(FROM_ADDRESS)}>`;

  try {
    const { error } = await resend.emails.send({
      from: fromWithName,
      to: SUPPORT_INBOX,
      replyTo: email,
      subject: `[Royal Loyalty support] ${subject}`,
      html,
      text,
      headers: {
        "Reply-To": email,
      },
    });
    if (error) {
      console.error("[support-ticket] resend error", error);
      return Response.json({ ok: false, error: "Failed to send" }, { status: 500 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    console.error("[support-ticket] threw", e);
    return Response.json({ ok: false, error: "Failed to send" }, { status: 500 });
  }
};

function stripDisplayName(addr: string): string {
  const m = addr.match(/<([^>]+)>/);
  return m ? m[1] : addr;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
