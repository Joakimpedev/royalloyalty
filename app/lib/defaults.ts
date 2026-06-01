// Onboarding defaults — a single source of truth for "what should a new
// merchant's loyalty program look like before they touch anything".
//
// Two principles:
//   1. USD baselines are industry-standard ranges (1 pt per $1 spent, 100 pts
//      = $5 off ≈ 5% effective cashback at the first reward tier, etc).
//      Values denominated in points (signup, birthday, review, follow,
//      newsletter, tier thresholds) are currency-agnostic — a point is a
//      point — and stay the same number in every currency.
//   2. The two money-denominated values (points-per-currency-unit at earn,
//      and the first reward's discount amount) get converted into the shop's
//      currency using a static FX anchor table and rounded to a 1-2-5 ladder
//      so we never display "47.83 kr off".
//
// The anchor table is intentionally static — these are *defaults*, not live
// rates. A 20% FX drift produces the same rounded number for most currencies
// because of the 1-2-5 ladder. Re-check the table once a year.
//
// Currencies not in the table fall back to the USD numbers verbatim (a sane
// default for any unknown ISO code — never crashes, never undefined).

export interface MoneyDefaults {
  /** ISO currency code (e.g. "USD", "NOK", "JPY"). */
  currencyCode: string;
  /** Points awarded per `earnPerCurrency` spent. Baseline = 1. */
  earnPoints: number;
  /** Currency amount that earns `earnPoints` points.
   *  USD baseline is 1 ($1 per 1 point). Scaled per currency. */
  earnPerCurrency: number;
  /** Currency-amount discount on the first (cheapest) reward.
   *  USD baseline is 5 ($5 off). Scaled per currency. */
  firstRewardValue: number;
}

export interface ProgramDefaults extends MoneyDefaults {
  /** Currency-agnostic — same in every currency. */
  firstRewardPoints: number; // 100
  signupPoints: number; // 100
  birthdayPoints: number; // 200
  reviewPoints: number; // 50
  socialFollowPoints: number; // 25
  newsletterPoints: number; // 50

  silverThresholdPoints: number; // 500
  goldThresholdPoints: number; // 2000
  silverEarnMultiplier: number; // 1.25
  goldEarnMultiplier: number; // 1.5
}

// ---------------------------------------------------------------------------
// FX anchor table — approximate value of 1 USD in each currency.
//
// Source: rough mid-2025 spot rates, rounded to a single significant figure
// of stability (we're going to round outputs to a 1-2-5 ladder anyway, so
// rates accurate to ±10% produce identical defaults). Update annually.
// ---------------------------------------------------------------------------

const FX: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.78,
  CAD: 1.36,
  AUD: 1.51,
  NZD: 1.64,
  CHF: 0.88,
  // Nordics
  NOK: 10.5,
  SEK: 10.4,
  DKK: 6.85,
  ISK: 138,
  // Asia
  JPY: 150,
  CNY: 7.2,
  HKD: 7.8,
  SGD: 1.34,
  KRW: 1370,
  TWD: 32,
  INR: 83,
  IDR: 16000,
  MYR: 4.7,
  THB: 35,
  PHP: 57,
  VND: 25000,
  // Middle East / Africa
  AED: 3.67,
  SAR: 3.75,
  ILS: 3.7,
  TRY: 33,
  ZAR: 18.5,
  EGP: 49,
  NGN: 1500,
  // Latin America
  MXN: 18,
  BRL: 5.5,
  ARS: 1000,
  CLP: 950,
  COP: 4000,
  PEN: 3.75,
  // Eastern Europe
  PLN: 4,
  CZK: 23,
  HUF: 360,
  RON: 4.6,
  BGN: 1.8,
  UAH: 41,
};

// ---------------------------------------------------------------------------
// USD baseline — every other currency derives from this.
// ---------------------------------------------------------------------------

const USD_BASELINE = {
  earnPoints: 1, // 1 pt awarded
  earnPerCurrency: 1, // per $1 spent
  firstRewardValue: 5, // $5 off at the first reward
  firstRewardPoints: 100, // → 5% effective cashback
  signupPoints: 100, // = one free first reward on join
  birthdayPoints: 200,
  reviewPoints: 50,
  socialFollowPoints: 25,
  newsletterPoints: 50,
  silverThresholdPoints: 500,
  goldThresholdPoints: 2000,
  silverEarnMultiplier: 1.25,
  goldEarnMultiplier: 1.5,
} as const;

// ---------------------------------------------------------------------------
// 1-2-5 rounding ladder — produces clean numbers (5, 10, 25, 50, 100, 250…)
// at any scale. The ladder is the same one used for chart axes.
// ---------------------------------------------------------------------------

const LADDER_MANTISSA: number[] = [1, 2, 5, 10];

/** Round to nearest 1-2-5 ladder value, with sensible behavior near zero. */
function roundToLadder(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value < 1) return Math.max(1, Math.round(value));

  const exponent = Math.floor(Math.log10(value));
  const scale = Math.pow(10, exponent);
  const mantissa = value / scale;

  let best = LADDER_MANTISSA[0];
  let bestDelta = Math.abs(mantissa - best);
  for (const m of LADDER_MANTISSA) {
    const d = Math.abs(mantissa - m);
    if (d < bestDelta) {
      best = m;
      bestDelta = d;
    }
  }
  return best * scale;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Convert a USD value into target currency and round to a clean number.
 *  Unknown currency codes return the raw USD value unchanged. */
export function convertAndRound(usdValue: number, currencyCode: string): number {
  const rate = FX[currencyCode.toUpperCase()];
  if (!rate) return usdValue;
  return roundToLadder(usdValue * rate);
}

/** Full default program shape for the given currency. Safe for any ISO code. */
export function getDefaultsForCurrency(currencyCode: string): ProgramDefaults {
  return {
    currencyCode: currencyCode.toUpperCase(),
    earnPoints: USD_BASELINE.earnPoints,
    earnPerCurrency: convertAndRound(
      USD_BASELINE.earnPerCurrency,
      currencyCode,
    ),
    firstRewardValue: convertAndRound(
      USD_BASELINE.firstRewardValue,
      currencyCode,
    ),
    firstRewardPoints: USD_BASELINE.firstRewardPoints,
    signupPoints: USD_BASELINE.signupPoints,
    birthdayPoints: USD_BASELINE.birthdayPoints,
    reviewPoints: USD_BASELINE.reviewPoints,
    socialFollowPoints: USD_BASELINE.socialFollowPoints,
    newsletterPoints: USD_BASELINE.newsletterPoints,
    silverThresholdPoints: USD_BASELINE.silverThresholdPoints,
    goldThresholdPoints: USD_BASELINE.goldThresholdPoints,
    silverEarnMultiplier: USD_BASELINE.silverEarnMultiplier,
    goldEarnMultiplier: USD_BASELINE.goldEarnMultiplier,
  };
}
