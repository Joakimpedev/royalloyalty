// One-shot preview for the Royal Loyalty post-uninstall survey email.
//
// Usage (PowerShell):
//   $env:RESEND_API_KEY = "re_..."
//   node scripts/send-uninstall-survey-preview.mjs dealifynordahl@gmail.com

import { Resend } from "resend";

const recipient = process.argv[2];
if (!recipient) {
  console.error("Usage: node scripts/send-uninstall-survey-preview.mjs <email>");
  process.exit(1);
}

const apiKey = process.env.RESEND_API_KEY;
if (!apiKey) {
  console.error("RESEND_API_KEY env var not set.");
  process.exit(1);
}

const SUBJECT = "uninstallment from our app";
const BODY = `Hey, I'm Joakim, one of the founders of Royal Loyalty. Saw you uninstalled and were just wondering if there's something specific that didn't work for you?

Reason I'm asking is because we are currently growing, and actually implement most of the feedback we get. Meaning, if a feature was missing or something was broken, we can usually build for you. Normally takes a day or two.

Just let me know :)

— Joakim`;

const FROM = "Joakim @ Royal Loyalty <noreply@reloop-returns.com>";
const REPLY_TO = "dealifynordahl@gmail.com";

const resend = new Resend(apiKey);
const { data, error } = await resend.emails.send({
  from: FROM, to: recipient, replyTo: REPLY_TO, subject: SUBJECT, text: BODY,
});

if (error) { console.error("Resend error:", error); process.exit(1); }
console.log("Sent:", { messageId: data?.id, to: recipient });
