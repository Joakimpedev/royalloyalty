// Server-only side of the Royal Loyalty post-uninstall survey email.

import { Resend } from "resend";
import {
  UNINSTALL_SURVEY_SUBJECT,
  renderUninstallSurveyEmailText,
} from "./uninstall-survey-email";

export {
  UNINSTALL_SURVEY_SUBJECT,
  renderUninstallSurveyEmailText,
} from "./uninstall-survey-email";

export const UNINSTALL_SURVEY_FROM_ADDRESS =
  process.env.ROYAL_UNINSTALL_SURVEY_FROM_EMAIL ||
  process.env.SUPPORT_FROM_EMAIL ||
  "Joakim @ Royal Loyalty <noreply@reloop-returns.com>";

export const UNINSTALL_SURVEY_REPLY_TO =
  process.env.ROYAL_UNINSTALL_SURVEY_REPLY_TO ||
  "dealifynordahl@gmail.com";

export async function sendUninstallSurveyEmail({
  recipient,
}: {
  recipient: string;
}): Promise<{ messageId: string | null }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not set");

  const resend = new Resend(apiKey);

  const { data, error } = await resend.emails.send({
    from: UNINSTALL_SURVEY_FROM_ADDRESS,
    to: recipient,
    replyTo: UNINSTALL_SURVEY_REPLY_TO,
    subject: UNINSTALL_SURVEY_SUBJECT,
    text: renderUninstallSurveyEmailText(),
  });
  if (error) {
    throw new Error(`Resend: ${error.message ?? String(error)}`);
  }
  return { messageId: data?.id ?? null };
}
