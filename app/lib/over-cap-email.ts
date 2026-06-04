// Pure template + constants for the Royal Loyalty over-cap email.
// No Resend, no DB, no process.env reads — safe to import from client-side
// React components if we ever build an admin preview pane for this email.

export const OVERCAP_SUBJECT =
  "You've reached your Royal Loyalty monthly limit";

// Royal Loyalty brand: navy + gold. The CTA button uses these directly so
// the email stays on-brand without depending on a CSS framework.
export const ROYAL_NAVY = "#1e3a8a";
export const ROYAL_GOLD = "#fbbf24";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderOverCapEmailHtml({
  shopName,
  billingUrl,
  logoUrl,
}: {
  shopName: string;
  billingUrl: string;
  logoUrl: string;
}): string {
  const logoBlock = logoUrl
    ? `<tr>
              <td align="center" style="padding-bottom:8px;">
                <img src="${escapeHtml(logoUrl)}" alt="Royal Loyalty" width="64" height="64" style="display:block;width:64px;height:64px;border:0;outline:none;" />
              </td>
            </tr>
            <tr>
              <td align="center" style="font-size:14px;font-weight:700;color:${ROYAL_NAVY};padding-bottom:20px;letter-spacing:0.2px;">
                Royal Loyalty
              </td>
            </tr>`
    : "";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;">
            ${logoBlock}
            <tr>
              <td>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;">
                  <tr>
                    <td style="font-size:20px;font-weight:700;color:#111827;padding-bottom:16px;">
                      You've reached your Royal Loyalty monthly limit
                    </td>
                  </tr>
                  <tr>
                    <td style="font-size:14px;color:#374151;line-height:1.5;padding-bottom:16px;">
                      Hi,
                    </td>
                  </tr>
                  <tr>
                    <td style="font-size:14px;color:#374151;line-height:1.5;padding-bottom:16px;">
                      Your Shopify store <strong>${escapeHtml(shopName)}</strong> has reached the monthly loyalty-order limit on your current Royal Loyalty plan.
                    </td>
                  </tr>
                  <tr>
                    <td style="font-size:14px;color:#374151;line-height:1.5;padding-bottom:24px;">
                      To keep awarding points, processing redemptions, and tracking referrals without interruption, please upgrade your plan from your Shopify admin:
                    </td>
                  </tr>
                  <tr>
                    <td align="center" style="padding-bottom:24px;">
                      <a href="${escapeHtml(billingUrl)}" style="display:inline-block;background:${ROYAL_NAVY};color:${ROYAL_GOLD};text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:700;font-size:14px;letter-spacing:0.3px;">
                        Open Royal Loyalty in Shopify Admin
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td style="font-size:13px;color:#6b7280;line-height:1.5;padding-bottom:16px;">
                      Members can still view their balance and redeem existing rewards on your storefront. New earn / redeem events pause until next month or until you upgrade.
                    </td>
                  </tr>
                  <tr>
                    <td style="font-size:13px;color:#6b7280;line-height:1.5;padding-top:16px;border-top:1px solid #f3f4f6;">
                      &mdash; The Royal Loyalty team
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderOverCapEmailText({
  shopName,
  billingUrl,
}: {
  shopName: string;
  billingUrl: string;
}): string {
  return `Royal Loyalty

You've reached your Royal Loyalty monthly limit

Hi,

Your Shopify store ${shopName} has reached the monthly loyalty-order limit on your current Royal Loyalty plan.

To keep awarding points, processing redemptions, and tracking referrals without interruption, please upgrade your plan from your Shopify admin:

Open Royal Loyalty in Shopify Admin: ${billingUrl}

Members can still view their balance and redeem existing rewards on your storefront. New earn / redeem events pause until next month or until you upgrade.

— The Royal Loyalty team`;
}
