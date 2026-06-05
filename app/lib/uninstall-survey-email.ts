// Pure subject + body for the Royal Loyalty post-uninstall survey email.
// Plain text only — deliberately formatted to look like a personal note
// from a founder, not a system email.

export const UNINSTALL_SURVEY_SUBJECT = "uninstallment from our app";

export function renderUninstallSurveyEmailText(): string {
  return `Hey, I'm Joakim, one of the founders of Royal Loyalty. Saw you uninstalled and were just wondering if there's something specific that didn't work for you?

Reason I'm asking is because we are currently growing, and actually implement most of the feedback we get. Meaning, if a feature was missing or something was broken, we can usually build for you. Normally takes a day or two.

Just let me know :)

— Joakim`;
}
