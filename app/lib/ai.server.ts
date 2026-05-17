// Royal Loyalty — AI program generation (Phase 3, COMPETITOR-ONBOARDING-RESEARCH §4.1-4.3).
//
// generateProgram() reads AGGREGATE store signals only (catalog price band,
// 60-day order volume, theme colors — NEVER customer PII) and asks Claude to
// produce a complete proposed loyalty program. Server-side only; the Anthropic
// key never reaches the browser. Prompt caching: the large system block carries
// cache_control so repeated generations across shops reuse the cached prefix.
//
// Anthropic DPA executed before this integration went live (Phase 3 task #1).
// Empty/new-store input falls back to a LABELLED industry-agnostic template —
// never blank, never an error (§4.3).

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-opus-4-7";

// ---------------------------------------------------------------------------
// Proposed-program shape (what the onboarding preview renders as editable cards)
// ---------------------------------------------------------------------------

export interface ProposedEarnRule {
  action:
    | "purchase"
    | "signup"
    | "birthday"
    | "newsletter"
    | "social"
    | "review"
    | "anniversary";
  points: number;
  perDollar: boolean;
  enabled: boolean;
  label: string;
}

export interface ProposedTier {
  name: string;
  thresholdType: "points" | "spend";
  threshold: number;
  earnMultiplier: number;
  perks: string[];
  sortOrder: number;
}

export interface ProposedReward {
  type:
    | "amount_off"
    | "percent_off"
    | "free_shipping"
    | "free_product"
    | "store_credit";
  pointsCost: number;
  value: number | null;
  label: string;
}

export interface ProposedBranding {
  primaryColor: string;
  secondaryColor: string;
  programName: string;
  pointsName: string; // e.g. "Crowns", "Points"
  launcherPosition: "bottom-right" | "bottom-left";
}

export interface ProposedEmail {
  event:
    | "points_earned"
    | "reward_available"
    | "tier_change"
    | "referral_success";
  subject: string;
  body: string;
}

export interface ProposedProgram {
  source: "ai" | "fallback-template";
  rationale: string;
  earnRules: ProposedEarnRule[];
  tiers: ProposedTier[]; // exactly 3 VIP tiers
  rewards: ProposedReward[];
  branding: ProposedBranding;
  emails: ProposedEmail[];
}

export interface ShopSignals {
  productCount: number;
  currencyCode: string;
  priceBand: { min: number; max: number; avg: number };
  orderVolume60d: number;
  avgOrderValue: number;
  topProductTypes: string[];
  themeColors: { primary: string; secondary: string };
  shopName: string;
}

// ---------------------------------------------------------------------------
// 1. Read aggregate store signals via Admin GraphQL (no PII fields requested)
// ---------------------------------------------------------------------------

const CATALOG_QUERY = `#graphql
  query RoyalLoyaltyCatalogSignals {
    shop {
      name
      currencyCode
    }
    products(first: 100, sortKey: UPDATED_AT) {
      nodes {
        productType
        priceRangeV2 {
          minVariantPrice { amount }
          maxVariantPrice { amount }
        }
      }
    }
  }`;

// Explicit field set ONLY (no unlisted customer sub-fields — prevents
// nested-subselection scope-bleed; mirrors Phase 2 reconcile contract).
const ORDERS_QUERY = `#graphql
  query RoyalLoyaltyOrderVolume($q: String!, $cursor: String) {
    orders(first: 250, query: $q, after: $cursor) {
      nodes {
        id
        totalPriceSet { shopMoney { amount } }
      }
      pageInfo { hasNextPage endCursor }
    }
  }`;

interface AdminLike {
  graphql: (
    query: string,
    opts?: { variables?: Record<string, unknown> },
  ) => Promise<{ json: () => Promise<any> }>;
}

async function readThemeColors(
  admin: AdminLike,
): Promise<{ primary: string; secondary: string }> {
  // Published OnlineStore theme settings_data.json carries the merchant's
  // brand colors. Best-effort: any failure → neutral royal default.
  const fallback = { primary: "#7B2D8E", secondary: "#F4E9B8" };
  try {
    const res = await admin.graphql(
      `#graphql
        query RoyalLoyaltyTheme {
          themes(first: 1, roles: [MAIN]) {
            nodes {
              files(filenames: ["config/settings_data.json"]) {
                nodes { body { ... on OnlineStoreThemeFileBodyText { content } } }
              }
            }
          }
        }`,
    );
    const json = await res.json();
    const content: string | undefined =
      json?.data?.themes?.nodes?.[0]?.files?.nodes?.[0]?.body?.content;
    if (!content) return fallback;
    const parsed = JSON.parse(content);
    const settings = parsed?.current?.settings ?? parsed?.presets ?? {};
    const hexes: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string" && /^#?[0-9a-fA-F]{6}$/.test(v)) {
        hexes.push(v.startsWith("#") ? v : `#${v}`);
      } else if (v && typeof v === "object") {
        Object.values(v as Record<string, unknown>).forEach(walk);
      }
    };
    walk(settings);
    return {
      primary: hexes[0] ?? fallback.primary,
      secondary: hexes[1] ?? fallback.secondary,
    };
  } catch {
    return fallback;
  }
}

export async function collectShopSignals(
  admin: AdminLike,
): Promise<ShopSignals> {
  const catalogRes = await admin.graphql(CATALOG_QUERY);
  const catalogJson = await catalogRes.json();
  const shop = catalogJson?.data?.shop ?? {};
  const products: any[] = catalogJson?.data?.products?.nodes ?? [];

  const prices: number[] = [];
  const typeCounts = new Map<string, number>();
  for (const p of products) {
    const min = parseFloat(p?.priceRangeV2?.minVariantPrice?.amount ?? "0");
    const max = parseFloat(p?.priceRangeV2?.maxVariantPrice?.amount ?? "0");
    if (min > 0) prices.push(min);
    if (max > 0) prices.push(max);
    const t = (p?.productType ?? "").trim();
    if (t) typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
  }

  // 60-day window order volume (paginated, capped at 4 pages = 1000 orders —
  // enough for an AOV/volume tier signal without unbounded crawl).
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  let cursor: string | null = null;
  let orderCount = 0;
  let revenue = 0;
  for (let page = 0; page < 4; page++) {
    const res = await admin.graphql(ORDERS_QUERY, {
      variables: { q: `created_at:>=${since}`, cursor },
    });
    const json = await res.json();
    const conn = json?.data?.orders;
    const nodes: any[] = conn?.nodes ?? [];
    for (const o of nodes) {
      orderCount++;
      revenue += parseFloat(o?.totalPriceSet?.shopMoney?.amount ?? "0");
    }
    if (!conn?.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }

  prices.sort((a, b) => a - b);
  const avgPrice =
    prices.length > 0
      ? prices.reduce((s, v) => s + v, 0) / prices.length
      : 0;
  const topProductTypes = [...typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t]) => t);

  return {
    productCount: products.length,
    currencyCode: shop.currencyCode ?? "USD",
    priceBand: {
      min: prices[0] ?? 0,
      max: prices[prices.length - 1] ?? 0,
      avg: Math.round(avgPrice * 100) / 100,
    },
    orderVolume60d: orderCount,
    avgOrderValue:
      orderCount > 0 ? Math.round((revenue / orderCount) * 100) / 100 : 0,
    topProductTypes,
    themeColors: await readThemeColors(admin),
    shopName: shop.name ?? "your store",
  };
}

// ---------------------------------------------------------------------------
// 2. Industry-agnostic fallback template (never blank, never error)
// ---------------------------------------------------------------------------

export function fallbackTemplate(signals?: Partial<ShopSignals>): ProposedProgram {
  const primary = signals?.themeColors?.primary ?? "#7B2D8E";
  const secondary = signals?.themeColors?.secondary ?? "#F4E9B8";
  return {
    source: "fallback-template",
    rationale:
      "Industry-agnostic best-practice template. Your store had little or no " +
      "catalog/order history to personalise from yet, so this is a proven " +
      "starting point — every value below is editable before you activate.",
    earnRules: [
      { action: "purchase", points: 1, perDollar: true, enabled: true, label: "Earn 1 point per $1 spent" },
      { action: "signup", points: 100, perDollar: false, enabled: true, label: "100 points for joining" },
      { action: "birthday", points: 200, perDollar: false, enabled: true, label: "200 points on your birthday" },
      { action: "newsletter", points: 50, perDollar: false, enabled: true, label: "50 points for newsletter signup" },
      { action: "social", points: 50, perDollar: false, enabled: true, label: "50 points for a social follow" },
      { action: "review", points: 75, perDollar: false, enabled: true, label: "75 points for a product review" },
      { action: "anniversary", points: 150, perDollar: false, enabled: false, label: "150 points on your join anniversary" },
    ],
    tiers: [
      { name: "Bronze", thresholdType: "points", threshold: 0, earnMultiplier: 1.0, perks: ["Earn points on every order"], sortOrder: 0 },
      { name: "Silver", thresholdType: "points", threshold: 500, earnMultiplier: 1.25, perks: ["1.25x points", "Early access to sales"], sortOrder: 1 },
      { name: "Gold", thresholdType: "points", threshold: 1500, earnMultiplier: 1.5, perks: ["1.5x points", "Free shipping", "VIP support"], sortOrder: 2 },
    ],
    rewards: [
      { type: "amount_off", pointsCost: 500, value: 5, label: "$5 off" },
      { type: "amount_off", pointsCost: 1000, value: 10, label: "$10 off" },
      { type: "percent_off", pointsCost: 1500, value: 15, label: "15% off" },
      { type: "free_shipping", pointsCost: 750, value: null, label: "Free shipping" },
    ],
    branding: {
      primaryColor: primary,
      secondaryColor: secondary,
      programName: "Rewards",
      pointsName: "Points",
      launcherPosition: "bottom-right",
    },
    emails: [
      { event: "points_earned", subject: "You just earned points!", body: "Thanks for your order — your points balance has been updated. Keep earning toward your next reward." },
      { event: "reward_available", subject: "A reward is waiting for you", body: "You have enough points to redeem a reward. Visit your account to claim it before your next order." },
      { event: "tier_change", subject: "Welcome to a new tier", body: "Congratulations — you've reached a new VIP tier and unlocked new perks. Thank you for being a loyal customer." },
      { event: "referral_success", subject: "Your referral paid off", body: "A friend you referred just made their first order. Your referral reward has been added to your account." },
    ],
  };
}

// ---------------------------------------------------------------------------
// 3. Claude call (prompt-cached system block; aggregate data only)
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a Shopify loyalty-program strategist for the "Royal Loyalty" app.
Given AGGREGATE store signals (never customer data), design a complete, ready-to-activate
loyalty program tuned to the store's price band, order volume and brand.

Rules:
- Output STRICT JSON ONLY, no prose, matching the schema given in the user message.
- Exactly 3 VIP tiers, ascending thresholds, the first tier threshold = 0.
- Earn rule actions limited to: purchase, signup, birthday, newsletter, social, review, anniversary.
- Reward types limited to: amount_off, percent_off, free_shipping, free_product, store_credit.
- Scale point costs and earn rates to the store's average order value so a typical
  customer reaches their first reward within ~3-5 orders (not too easy, not unreachable).
- Reward "value" is a number for amount_off (currency)/percent_off (percent), null otherwise.
- Colors must be 6-digit hex with leading '#'. Use the supplied theme colors when present.
- programName/pointsName: short, brand-appropriate, no trademarked terms.
- Provide 4 default transactional emails (points_earned, reward_available, tier_change, referral_success).
- "rationale": one short paragraph explaining the choices, plain language for the merchant.`;

interface ClaudeResult {
  ok: boolean;
  program?: ProposedProgram;
}

async function callClaude(signals: ShopSignals): Promise<ClaudeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false };

  const userMessage = JSON.stringify({
    instruction:
      "Design the loyalty program. Respond with JSON matching exactly this TypeScript shape (no markdown fences): " +
      "{ source:'ai', rationale:string, earnRules:[{action,points,perDollar,enabled,label}], " +
      "tiers:[{name,thresholdType,threshold,earnMultiplier,perks:string[],sortOrder}] (length 3), " +
      "rewards:[{type,pointsCost,value,label}], " +
      "branding:{primaryColor,secondaryColor,programName,pointsName,launcherPosition}, " +
      "emails:[{event,subject,body}] }",
    storeSignals: signals,
  });

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            // Prompt caching: the static strategist prompt is the cached prefix
            // reused across every shop's generation.
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!res.ok) return { ok: false };
    const data = await res.json();
    const text: string | undefined = data?.content?.[0]?.text;
    if (!text) return { ok: false };

    // Strip any accidental fencing then parse.
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned) as ProposedProgram;
    parsed.source = "ai";
    return { ok: true, program: normalize(parsed, signals) };
  } catch {
    return { ok: false };
  }
}

// Defensive normalisation so a malformed-but-parseable AI response can never
// produce an invalid program (always exactly 3 tiers, valid hex, etc.).
function normalize(p: ProposedProgram, signals: ShopSignals): ProposedProgram {
  const tpl = fallbackTemplate(signals);
  const hex = (v: string | undefined, dflt: string) =>
    typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : dflt;

  let tiers = Array.isArray(p.tiers) ? p.tiers.slice(0, 3) : [];
  while (tiers.length < 3) tiers.push(tpl.tiers[tiers.length]);
  tiers = tiers
    .map((t, i) => ({
      name: String(t?.name ?? tpl.tiers[i].name).slice(0, 40),
      thresholdType: t?.thresholdType === "spend" ? "spend" : "points",
      threshold: Math.max(0, Math.round(Number(t?.threshold ?? tpl.tiers[i].threshold))),
      earnMultiplier: Math.max(1, Number(t?.earnMultiplier ?? 1)),
      perks: Array.isArray(t?.perks) ? t.perks.map(String) : tpl.tiers[i].perks,
      sortOrder: i,
    }))
    .sort((a, b) => a.threshold - b.threshold)
    .map((t, i) => ({ ...t, sortOrder: i, threshold: i === 0 ? 0 : t.threshold }));

  return {
    source: "ai",
    rationale: String(p.rationale ?? tpl.rationale),
    earnRules:
      Array.isArray(p.earnRules) && p.earnRules.length > 0
        ? p.earnRules.map((r) => ({
            action: r.action,
            points: Math.max(0, Math.round(Number(r.points ?? 0))),
            perDollar: Boolean(r.perDollar),
            enabled: r.enabled !== false,
            label: String(r.label ?? r.action),
          }))
        : tpl.earnRules,
    tiers,
    rewards:
      Array.isArray(p.rewards) && p.rewards.length > 0
        ? p.rewards.map((rw) => ({
            type: rw.type,
            pointsCost: Math.max(1, Math.round(Number(rw.pointsCost ?? 100))),
            value:
              rw.value === null || rw.value === undefined
                ? null
                : Number(rw.value),
            label: String(rw.label ?? rw.type),
          }))
        : tpl.rewards,
    branding: {
      primaryColor: hex(p.branding?.primaryColor, tpl.branding.primaryColor),
      secondaryColor: hex(
        p.branding?.secondaryColor,
        tpl.branding.secondaryColor,
      ),
      programName: String(p.branding?.programName ?? tpl.branding.programName).slice(0, 40),
      pointsName: String(p.branding?.pointsName ?? tpl.branding.pointsName).slice(0, 20),
      launcherPosition:
        p.branding?.launcherPosition === "bottom-left"
          ? "bottom-left"
          : "bottom-right",
    },
    emails:
      Array.isArray(p.emails) && p.emails.length > 0
        ? p.emails.map((e) => ({
            event: e.event,
            subject: String(e.subject ?? "").slice(0, 120),
            body: String(e.body ?? ""),
          }))
        : tpl.emails,
  };
}

// ---------------------------------------------------------------------------
// 4. Public entry point used by the onboarding loader
// ---------------------------------------------------------------------------

/**
 * Produce a complete proposed program from the store's own aggregate data.
 * Never throws, never returns blank: empty/new store OR any AI failure →
 * labelled industry-agnostic fallback template.
 */
export async function generateProgram(
  admin: AdminLike,
): Promise<{ program: ProposedProgram; signals: ShopSignals }> {
  let signals: ShopSignals;
  try {
    signals = await collectShopSignals(admin);
  } catch {
    const fb = fallbackTemplate();
    return {
      program: fb,
      signals: {
        productCount: 0,
        currencyCode: "USD",
        priceBand: { min: 0, max: 0, avg: 0 },
        orderVolume60d: 0,
        avgOrderValue: 0,
        topProductTypes: [],
        themeColors: fb.branding && {
          primary: fb.branding.primaryColor,
          secondary: fb.branding.secondaryColor,
        },
        shopName: "your store",
      },
    };
  }

  // Empty/new store: not enough to personalise → labelled template (§4.3).
  if (signals.productCount === 0 && signals.orderVolume60d === 0) {
    return { program: fallbackTemplate(signals), signals };
  }

  const ai = await callClaude(signals);
  if (ai.ok && ai.program) return { program: ai.program, signals };
  return { program: fallbackTemplate(signals), signals };
}
