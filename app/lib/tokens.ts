// Shared placeholder/token substitution. Used by the admin (live preview)
// AND the storefront extension (server-side render of EarnRule labels) so
// the merchant sees identical output in both places — same source of
// truth, same substitution rules.
//
// Token shape: {{token_name}} — lowercase + underscores. Unknown tokens
// are left intact so unrecognized inputs are visible to the merchant
// instead of silently disappearing.

export interface VariableToken {
  /** Plain-English label shown in the picker dropdown. */
  label: string;
  /** Literal token string written into the field, e.g. "{{points}}". */
  token: string;
}

export interface VariableGroup {
  title: string;
  tokens: VariableToken[];
}

/** Universal tokens — available on every earn rule's content fields. */
const UNIVERSAL_TOKENS: VariableToken[] = [
  { label: "Points awarded", token: "{{points}}" },
  { label: "Currency code", token: "{{currency_code}}" },
  { label: "Currency symbol", token: "{{currency_symbol}}" },
];

/** Per-action token catalogs. The picker shows universal + action-specific. */
export const TOKEN_GROUPS_BY_ACTION: Record<string, VariableGroup[]> = {
  purchase: [
    { title: "Points", tokens: UNIVERSAL_TOKENS },
    {
      title: "Order",
      tokens: [
        {
          label: "Amount spent per point increment",
          token: "{{per_amount}}",
        },
      ],
    },
  ],
  signup: [{ title: "Points", tokens: UNIVERSAL_TOKENS }],
  birthday: [{ title: "Points", tokens: UNIVERSAL_TOKENS }],
  newsletter: [{ title: "Points", tokens: UNIVERSAL_TOKENS }],
  social: [
    { title: "Points", tokens: UNIVERSAL_TOKENS },
    {
      title: "Platform",
      tokens: [{ label: "Platform name", token: "{{platform}}" }],
    },
  ],
  review: [{ title: "Points", tokens: UNIVERSAL_TOKENS }],
  anniversary: [{ title: "Points", tokens: UNIVERSAL_TOKENS }],
};

/**
 * Replace `{{token}}` placeholders with concrete values. Unknown tokens
 * remain literal so the merchant can see which name didn't resolve.
 */
export function substituteTokens(
  input: string,
  ctx: Record<string, string>,
): string {
  return input.replace(
    /\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}/gi,
    (m, name) => {
      const key = String(name).toLowerCase();
      return Object.prototype.hasOwnProperty.call(ctx, key) ? ctx[key] : m;
    },
  );
}

/**
 * Format a money amount using the shop's currency, falling back to a plain
 * "AMOUNT CODE" string if Intl.NumberFormat rejects the input. Returns
 * things like "$1.00" / "kr 1.00" / "€1.00".
 */
export function formatMoneyAmount(
  amount: number,
  currencyCode: string,
  locale?: string,
): string {
  try {
    return new Intl.NumberFormat(locale || "en", {
      style: "currency",
      currency: currencyCode || "USD",
      currencyDisplay: "narrowSymbol",
    }).format(amount);
  } catch {
    return `${amount} ${currencyCode || ""}`.trim();
  }
}

/**
 * Extract the currency symbol (e.g. "kr", "$", "€") from a currency code
 * via Intl.NumberFormat parts. Falls back to the code itself if the
 * runtime doesn't expose a distinct symbol.
 */
export function currencySymbol(currencyCode: string, locale?: string): string {
  try {
    const parts = new Intl.NumberFormat(locale || "en", {
      style: "currency",
      currency: currencyCode || "USD",
      currencyDisplay: "narrowSymbol",
    }).formatToParts(0);
    const sym = parts.find((p) => p.type === "currency");
    return sym?.value ?? currencyCode;
  } catch {
    return currencyCode || "";
  }
}

/** Default copy per action — used when the merchant hasn't customized. */
export const DEFAULT_EARN_COPY: Record<
  string,
  { title: string; descriptionPerDollar?: string; description: string }
> = {
  purchase: {
    title: "Place an order",
    descriptionPerDollar:
      "Earn {{points}} pts for every {{per_amount}} spent",
    description: "Earn {{points}} pts per order",
  },
  signup: {
    title: "Create an account",
    description: "Earn {{points}} pts when you sign up",
  },
  birthday: {
    title: "Celebrate your birthday",
    description: "Earn {{points}} pts on your birthday",
  },
  newsletter: {
    title: "Subscribe to our newsletter",
    description: "Earn {{points}} pts when you subscribe",
  },
  social: {
    title: "Follow on social",
    description: "Earn {{points}} pts when you follow on {{platform}}",
  },
  review: {
    title: "Leave a product review",
    description: "Earn {{points}} pts per review",
  },
  anniversary: {
    title: "Account anniversary",
    description: "Earn {{points}} pts on your loyalty anniversary",
  },
};
