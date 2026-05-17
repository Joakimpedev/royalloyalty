// Royal Loyalty — AI ongoing optimization engine
// (ROYAL-LOYALTY-DEVELOPMENT.md Phase 3 #9 / brief §3b).
//
// A scheduled job (Phase 4 cron wiring) calls runSuggestionsForShop() per shop.
// It computes proposed optimizations from the shop's OWN ledger/analytics
// (e.g. "redemption rate low → lower the cheapest reward threshold") and writes
// AiSuggestion rows with status "open". Suggestions are NEVER auto-applied —
// they surface on the Suggestions page as reviewable cards (accept/dismiss).
//
// Aggregate analytics only are sent to Claude (counts/rates — never customer
// PII). withFreshToken is used for the token-safe context required of every
// scheduled job; this engine itself needs no Shopify API call (it reads the
// local ledger), but it runs inside that token-safe wrapper so the schedule
// contract is uniform and future signal-gathering can call admin safely.

import prisma from "../db.server";
import { withFreshToken } from "./token.server";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-opus-4-7";

interface ShopAnalytics {
  members: number;
  pointsIssued: number;
  pointsRedeemed: number;
  redemptionRate: number; // redeemed / issued
  redeemingMembers: number;
  earningMembers: number;
  cheapestRewardCost: number | null;
  tierCount: number;
  lowestNonBaseTierThreshold: number | null;
}

export interface ComputedSuggestion {
  kind: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 1. Aggregate analytics from the local ledger (no PII)
// ---------------------------------------------------------------------------

async function computeAnalytics(shopId: string): Promise<ShopAnalytics> {
  const [
    members,
    issuedAgg,
    redeemedAgg,
    redeemers,
    earners,
    cheapestReward,
    tiers,
  ] = await Promise.all([
    prisma.member.count({ where: { shopId } }),
    prisma.pointTransaction.aggregate({
      where: { shopId, type: { in: ["EARN", "IMPORT"] } },
      _sum: { points: true },
    }),
    prisma.pointTransaction.aggregate({
      where: { shopId, type: "REDEEM" },
      _sum: { points: true },
    }),
    prisma.pointTransaction.findMany({
      where: { shopId, type: "REDEEM" },
      distinct: ["memberId"],
      select: { memberId: true },
    }),
    prisma.pointTransaction.findMany({
      where: { shopId, type: { in: ["EARN", "IMPORT"] } },
      distinct: ["memberId"],
      select: { memberId: true },
    }),
    prisma.reward.findFirst({
      where: { shopId, enabled: true },
      orderBy: { pointsCost: "asc" },
      select: { pointsCost: true },
    }),
    prisma.tier.findMany({
      where: { shopId },
      orderBy: { threshold: "asc" },
      select: { threshold: true },
    }),
  ]);

  const issued = issuedAgg._sum.points ?? 0;
  const redeemed = Math.abs(redeemedAgg._sum.points ?? 0);
  const nonBase = tiers.filter((t) => t.threshold > 0);

  return {
    members,
    pointsIssued: issued,
    pointsRedeemed: redeemed,
    redemptionRate: issued > 0 ? redeemed / issued : 0,
    redeemingMembers: redeemers.length,
    earningMembers: earners.length,
    cheapestRewardCost: cheapestReward?.pointsCost ?? null,
    tierCount: tiers.length,
    lowestNonBaseTierThreshold: nonBase.length ? nonBase[0].threshold : null,
  };
}

// ---------------------------------------------------------------------------
// 2. Deterministic rule layer (guarantees a suggestion for known inputs —
//    Phase 7 test relies on a known-input store producing a deterministic card)
// ---------------------------------------------------------------------------

function deterministicSuggestions(a: ShopAnalytics): ComputedSuggestion[] {
  const out: ComputedSuggestion[] = [];

  // Low redemption rate with meaningful issuance → suggest lowering the
  // cheapest reward threshold.
  if (
    a.pointsIssued >= 1000 &&
    a.redemptionRate < 0.1 &&
    a.cheapestRewardCost &&
    a.cheapestRewardCost > 100
  ) {
    const suggested = Math.max(100, Math.round((a.cheapestRewardCost * 0.7) / 50) * 50);
    out.push({
      kind: "lower_reward_threshold",
      title: "Redemption rate is low — make the first reward easier to reach",
      body:
        `Only ${(a.redemptionRate * 100).toFixed(1)}% of issued points have been ` +
        `redeemed. Your cheapest reward costs ${a.cheapestRewardCost} points. ` +
        `Lowering it to about ${suggested} points typically lifts redemption and ` +
        `repeat purchases without materially raising liability.`,
      payload: {
        currentCost: a.cheapestRewardCost,
        suggestedCost: suggested,
      },
    });
  }

  // Many earners, almost no redeemers → first-reward visibility / threshold.
  if (
    a.earningMembers >= 20 &&
    a.redeemingMembers / Math.max(1, a.earningMembers) < 0.05
  ) {
    out.push({
      kind: "activate_redeemers",
      title: "Members are earning but not redeeming",
      body:
        `${a.earningMembers} members have earned points but only ` +
        `${a.redeemingMembers} have redeemed. Consider a reminder email when a ` +
        `member first crosses your cheapest reward threshold, or a small ` +
        `welcome reward to trigger the first redemption habit.`,
      payload: {
        earningMembers: a.earningMembers,
        redeemingMembers: a.redeemingMembers,
      },
    });
  }

  // Lowest VIP tier unreachable relative to issuance per member.
  if (
    a.lowestNonBaseTierThreshold &&
    a.members >= 10 &&
    a.pointsIssued / a.members < a.lowestNonBaseTierThreshold * 0.25
  ) {
    const suggested = Math.max(
      100,
      Math.round((a.pointsIssued / a.members) * 1.5),
    );
    out.push({
      kind: "lower_tier_threshold",
      title: "Your first VIP tier may be out of reach",
      body:
        `Average points per member is ` +
        `${Math.round(a.pointsIssued / a.members)}, but your first VIP tier ` +
        `requires ${a.lowestNonBaseTierThreshold}. Few members will ever reach ` +
        `it. Lowering the first tier to about ${suggested} points keeps the ` +
        `VIP ladder motivating.`,
      payload: {
        currentThreshold: a.lowestNonBaseTierThreshold,
        suggestedThreshold: suggested,
      },
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// 3. Optional Claude layer for a qualitative narrative suggestion
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a Shopify loyalty-program optimization analyst for "Royal Loyalty".
Given AGGREGATE program analytics (never customer data), produce AT MOST ONE
high-value optimization suggestion the merchant can review and accept.
Output STRICT JSON ONLY: {"kind":string,"title":string,"body":string} or the
literal {"kind":"none"} if the program looks healthy. Be specific and concrete;
reference the numbers; do not invent data not provided.`;

async function aiSuggestion(
  a: ShopAnalytics,
): Promise<ComputedSuggestion | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
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
        max_tokens: 600,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [
          { role: "user", content: JSON.stringify({ analytics: a }) },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text: string | undefined = data?.content?.[0]?.text;
    if (!text) return null;
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed?.kind || parsed.kind === "none") return null;
    return {
      kind: `ai_${String(parsed.kind).slice(0, 40)}`,
      title: String(parsed.title ?? "Optimization opportunity").slice(0, 160),
      body: String(parsed.body ?? ""),
      payload: { generatedBy: "claude" },
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 4. Public entry point — called from the scheduled job (Phase 4)
// ---------------------------------------------------------------------------

/**
 * Compute and persist open AiSuggestion rows for one shop. De-duplicates: an
 * identical (kind) suggestion already "open" is not duplicated on the next run.
 * Returns the suggestions written. NEVER auto-applies anything.
 *
 * Uses withFreshToken to honour the uniform scheduled-job token contract even
 * though the analytics are local — keeps every Phase 4 job consistent and lets
 * future signal collection safely call the Admin API.
 */
export async function runSuggestionsForShop(
  shopDomain: string,
): Promise<ComputedSuggestion[]> {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  });
  if (!shop) return [];

  const written = await withFreshToken(shopDomain, async () => {
    const analytics = await computeAnalytics(shop.id);

    const candidates: ComputedSuggestion[] = [...deterministicSuggestions(analytics)];
    const ai = await aiSuggestion(analytics);
    if (ai) candidates.push(ai);

    const result: ComputedSuggestion[] = [];
    for (const c of candidates) {
      const dupe = await prisma.aiSuggestion.findFirst({
        where: { shopId: shop.id, kind: c.kind, status: "open" },
        select: { id: true },
      });
      if (dupe) continue;
      await prisma.aiSuggestion.create({
        data: {
          shopId: shop.id,
          kind: c.kind,
          title: c.title,
          body: c.body,
          payload: c.payload as object,
          status: "open",
        },
      });
      result.push(c);
    }
    return result;
  });

  return written ?? [];
}

/** Run the optimization engine for every active shop (scheduled-job fan-out). */
export async function runSuggestionsForAllShops(): Promise<void> {
  const shops = await prisma.shop.findMany({
    where: { isActive: true },
    select: { shopDomain: true },
  });
  for (const s of shops) {
    try {
      await runSuggestionsForShop(s.shopDomain);
    } catch (e) {
      console.warn(
        `[suggestions] failed for ${s.shopDomain}: ${(e as Error).message}`,
      );
    }
  }
}
