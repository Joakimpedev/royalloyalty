// Core loyalty engine (Phase 2).
//
// Responsibilities:
//  - awardForOrder()  : earn on purchase from an orders/create payload
//  - awardForAction() : earn on signup/birthday/newsletter/social/review/anniversary
//  - redeemReward()   : spend points -> Redemption (transitionStatus) + Shopify
//                       discount code via discountCodeBasicCreate
//  - recomputeTier()  : recompute Member.currentTier from the ledger and tag the
//                       Shopify customer with the tier via tagsAdd
//
// Discipline:
//  - Points only ever change through recordPointTransaction().
//  - Redemption status only ever changes through transitionStatus().
//  - Every earn/redeem entry point gates on canAwardLoyalty(shop).
//  - No customer PII is ever logged here (safeLog stays topic+shop+note).
import prisma from "../db.server";
import { recordPointTransaction, getBalance } from "./points.server";
import { transitionStatus } from "./status.server";
import { canAwardLoyalty } from "./quota.server";
import type { OrdersCreatePayload } from "../routes/webhooks.orders.create";

/**
 * Seed the two earn rules that the admin program page synthesizes as
 * "Active by default" (Place an order, Create an account). Called when a
 * shop activates the loyalty program so the storefront-payload sees real
 * DB rows instead of relying on duplicated default logic. Idempotent —
 * skips any action that already has a row, so resyncing or repeated
 * activation calls are safe. Mirrors app/routes/app.program.tsx loader
 * defaults: `purchase` → 1 pt/$1, `signup` → 50 pts one-shot.
 */
export async function seedDefaultEarnRules(shopId: string): Promise<void> {
  const existing = await prisma.earnRule.findMany({
    where: { shopId, action: { in: ["purchase", "signup"] } },
    select: { action: true },
  });
  const have = new Set(existing.map((r) => r.action));
  const toCreate: Array<{
    shopId: string;
    action: string;
    points: number;
    perDollar: boolean;
    enabled: boolean;
  }> = [];
  if (!have.has("purchase")) {
    toCreate.push({
      shopId,
      action: "purchase",
      points: 1,
      perDollar: true,
      enabled: true,
    });
  }
  if (!have.has("signup")) {
    toCreate.push({
      shopId,
      action: "signup",
      points: 50,
      perDollar: false,
      enabled: true,
    });
  }
  if (toCreate.length) {
    await prisma.earnRule.createMany({ data: toCreate });
  }
}

// admin.graphql from authenticate.admin(); kept structurally typed so this file
// does not depend on the Shopify SDK's exact generic surface.
type GraphqlClient = (
  query: string,
  options?: { variables?: Record<string, unknown> },
) => Promise<{ json: () => Promise<any> }>;

export type AwardOutcome =
  | "awarded"
  | "skipped_no_customer"
  | "skipped_no_rule"
  | "skipped_zero_points"
  | "skipped_quota"
  | "skipped_shop_inactive"
  | "duplicate_order";

// ---------------------------------------------------------------------------
// Shop / member helpers
// ---------------------------------------------------------------------------

async function getActiveShop(shopDomain: string) {
  return prisma.shop.findUnique({ where: { shopDomain } });
}

/** Upsert a Member by (shopId, shopifyCustomerId). Never overwrites PII with
 *  empty values; never un-redacts a redacted member. */
export async function upsertMember(params: {
  shopId: string;
  shopifyCustomerId: string;
  email?: string | null;
  name?: string | null;
}) {
  const existing = await prisma.member.findUnique({
    where: {
      shopId_shopifyCustomerId: {
        shopId: params.shopId,
        shopifyCustomerId: params.shopifyCustomerId,
      },
    },
  });

  if (existing) {
    // Do not touch PII on redacted members; do not blank existing PII.
    if (existing.redactedAt) return existing;
    const data: { email?: string; name?: string } = {};
    if (params.email && params.email !== existing.email) data.email = params.email;
    if (params.name && params.name !== existing.name) data.name = params.name;
    if (Object.keys(data).length === 0) return existing;
    return prisma.member.update({ where: { id: existing.id }, data });
  }

  return prisma.member.create({
    data: {
      shopId: params.shopId,
      shopifyCustomerId: params.shopifyCustomerId,
      email: params.email ?? null,
      name: params.name ?? null,
    },
  });
}

function customerName(first?: string | null, last?: string | null): string | null {
  const n = [first, last].filter(Boolean).join(" ").trim();
  return n.length ? n : null;
}

/** Normalise a Shopify GID or numeric id to a stable string id. */
function normalizeCustomerId(raw: string | number | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw);
  if (s.length === 0) return null;
  // gid://shopify/Customer/123 -> 123 ; bare numeric stays as-is
  const m = s.match(/Customer\/(\d+)/);
  return m ? m[1] : s;
}

function toCustomerGid(shopifyCustomerId: string): string {
  if (shopifyCustomerId.startsWith("gid://")) return shopifyCustomerId;
  return `gid://shopify/Customer/${shopifyCustomerId}`;
}

// ---------------------------------------------------------------------------
// Earn: purchase (orders/create)
// ---------------------------------------------------------------------------

/**
 * Compute and award points for an order.
 *
 * Earn model: the `purchase` EarnRule. If `perDollar` is true, points = floor(
 * orderTotal) * rule.points; otherwise a flat rule.points per qualifying order.
 * The member's current tier multiplier is applied on top.
 *
 * Idempotent per order: a prior EARN row with the same orderId short-circuits.
 * Increments Shop.monthlyLoyaltyOrderCount once per newly-counted order.
 */
export async function awardForOrder(
  shopDomain: string,
  payload: OrdersCreatePayload,
  opts: { adminGraphql?: GraphqlClient } = {},
): Promise<{ outcome: AwardOutcome; points?: number }> {
  const shop = await getActiveShop(shopDomain);
  if (!shop || !shop.isActive) return { outcome: "skipped_shop_inactive" };

  const shopifyCustomerId = normalizeCustomerId(payload.customer?.id ?? null);
  if (!shopifyCustomerId) return { outcome: "skipped_no_customer" };

  const orderId = String(payload.id);

  // Per-order idempotency: already earned for this order?
  const prior = await prisma.pointTransaction.findFirst({
    where: { shopId: shop.id, orderId, type: "EARN" },
    select: { id: true },
  });
  if (prior) return { outcome: "duplicate_order" };

  // Volume quota gate (Phase 1 stub -> Phase 5 real). Never feature-gates.
  const allowed = await canAwardLoyalty(shop.id);
  if (!allowed) return { outcome: "skipped_quota" };

  const rule = await prisma.earnRule.findFirst({
    where: { shopId: shop.id, action: "purchase", enabled: true },
  });
  if (!rule) return { outcome: "skipped_no_rule" };

  const orderTotal = parseMoney(
    payload.current_total_price ??
      payload.total_price ??
      payload.subtotal_price ??
      "0",
  );

  const member = await upsertMember({
    shopId: shop.id,
    shopifyCustomerId,
    email: payload.customer?.email ?? null,
    name: customerName(
      payload.customer?.first_name,
      payload.customer?.last_name,
    ),
  });

  // Tier multiplier (default 1.0 if no tier).
  const tier = member.currentTierId
    ? await prisma.tier.findUnique({ where: { id: member.currentTierId } })
    : null;
  const multiplier = tier?.earnMultiplier ?? 1.0;

  // perAmount lives in the EarnRule.config JSON blob (set on the per-rule
  // editor at /app/program/earn/purchase). When the merchant says "8 points
  // for every kr 5 spent", perAmount=5 and rule.points=8 → 8 pts per 5 kr.
  // Defaults to 1 (8 pts per 1 kr) so existing rules without the config
  // field keep their previous behavior exactly.
  const cfg = (rule.config ?? null) as { perAmount?: number } | null;
  const perAmount = Math.max(1, cfg?.perAmount ?? 1);
  const base = rule.perDollar
    ? Math.floor(orderTotal / perAmount) * rule.points
    : rule.points;
  const points = Math.floor(base * multiplier);

  if (points <= 0) {
    // Still count the loyalty order if a rule applied but rounded to 0? No —
    // a "loyalty order" is one that earned or redeemed. Zero earned => skip.
    return { outcome: "skipped_zero_points" };
  }

  await recordPointTransaction({
    shopId: shop.id,
    memberId: member.id,
    type: "EARN",
    points,
    reason: rule.perDollar
      ? `Purchase: ${rule.points} pt/$ x${multiplier} on order ${payload.name ?? orderId}`
      : `Purchase: flat ${rule.points} x${multiplier} on order ${payload.name ?? orderId}`,
    orderId,
  });

  // Count this as a loyalty order for the month exactly once.
  await prisma.shop.update({
    where: { id: shop.id },
    data: { monthlyLoyaltyOrderCount: { increment: 1 } },
  });

  // Recompute tier off the new balance (DB-only here; Shopify tagging is done
  // when an admin client is available — recomputeTier handles a missing client).
  await recomputeTier(shop.id, member.id);

  // Cashback: configured per-shop, credited as native Shopify store credit
  // via Shopify's storeCreditAccountCredit mutation. No-op when the shop
  // has cashback disabled or when no admin GraphQL client is available
  // (webhook authenticate.webhook can return undefined admin in rare cases).
  if (opts.adminGraphql) {
    try {
      const { awardCashback } = await import("./storecredit.server");
      await awardCashback({
        graphql: opts.adminGraphql,
        shopId: shop.id,
        shopifyCustomerId,
        orderId,
        orderTotal,
        currencyCode: payload.currency ?? shop.currencyCode ?? "USD",
      });
    } catch {
      /* non-fatal — earn already happened */
    }
  }

  return { outcome: "awarded", points };
}

function parseMoney(v: string): number {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ---------------------------------------------------------------------------
// Earn: non-purchase actions
// ---------------------------------------------------------------------------

export type EarnAction =
  | "signup"
  | "birthday"
  | "newsletter"
  | "social"
  | "review"
  | "anniversary";

/**
 * Award points for a non-purchase action via the matching EarnRule.
 * `oncePerKey` (e.g. "birthday:2026", "review:<productId>") makes the award
 * idempotent: a prior txn whose reason contains the key is not re-awarded.
 */
export async function awardForAction(params: {
  shopId: string;
  memberId: string;
  action: EarnAction;
  oncePerKey?: string;
}): Promise<{ outcome: AwardOutcome; points?: number }> {
  const shop = await prisma.shop.findUnique({
    where: { id: params.shopId },
    select: { id: true, isActive: true },
  });
  if (!shop || !shop.isActive) return { outcome: "skipped_shop_inactive" };

  const allowed = await canAwardLoyalty(params.shopId);
  if (!allowed) return { outcome: "skipped_quota" };

  const rule = await prisma.earnRule.findFirst({
    where: { shopId: params.shopId, action: params.action, enabled: true },
  });
  if (!rule) return { outcome: "skipped_no_rule" };

  if (params.oncePerKey) {
    const dup = await prisma.pointTransaction.findFirst({
      where: {
        shopId: params.shopId,
        memberId: params.memberId,
        type: "EARN",
        reason: { contains: `[${params.oncePerKey}]` },
      },
      select: { id: true },
    });
    if (dup) return { outcome: "duplicate_order" };
  }

  const member = await prisma.member.findUnique({
    where: { id: params.memberId },
  });
  if (!member) return { outcome: "skipped_no_customer" };

  const tier = member.currentTierId
    ? await prisma.tier.findUnique({ where: { id: member.currentTierId } })
    : null;
  const multiplier = tier?.earnMultiplier ?? 1.0;
  const points = Math.floor(rule.points * multiplier);
  if (points <= 0) return { outcome: "skipped_zero_points" };

  const keyTag = params.oncePerKey ? ` [${params.oncePerKey}]` : "";
  await recordPointTransaction({
    shopId: params.shopId,
    memberId: params.memberId,
    type: "EARN",
    points,
    reason: `Action: ${params.action} (${rule.points} x${multiplier})${keyTag}`,
  });

  await recomputeTier(params.shopId, params.memberId);
  return { outcome: "awarded", points };
}

// ---------------------------------------------------------------------------
// Redeem
// ---------------------------------------------------------------------------

export type RedeemResult =
  | { ok: true; redemptionId: string; discountCode?: string }
  | { ok: false; error: string };

/**
 * Redeem a Reward for a Member.
 *
 * Flow:
 *  1. quota gate + balance check
 *  2. create Redemption (PENDING) and a -points REDEEM ledger row
 *  3. for amount_off / percent_off / free_shipping: create a Shopify discount
 *     code via the `discountCodeBasicCreate` mutation; free_product is handled
 *     as a 100%-off code restricted to the product; store_credit is recorded
 *     here and the actual credit write lands in Phase 4 (no discount code)
 *  4. transitionStatus PENDING -> ACTIVE -> COMPLETED
 *
 * If discount creation fails, the Redemption is moved PENDING -> CANCELLED and
 * a compensating +points ADJUST row restores the balance (ledger stays append-
 * only — we never delete the REDEEM row).
 */
export async function redeemReward(params: {
  shopDomain: string;
  memberId: string;
  rewardId: string;
  admin: { graphql: GraphqlClient };
}): Promise<RedeemResult> {
  const shop = await getActiveShop(params.shopDomain);
  if (!shop || !shop.isActive) return { ok: false, error: "Shop is not active." };

  const allowed = await canAwardLoyalty(shop.id);
  if (!allowed) {
    return {
      ok: false,
      error: "This store has reached its monthly loyalty volume. Redemptions resume next period or after an upgrade.",
    };
  }

  const reward = await prisma.reward.findFirst({
    where: { id: params.rewardId, shopId: shop.id, enabled: true },
  });
  if (!reward) return { ok: false, error: "Reward not found or disabled." };

  const member = await prisma.member.findFirst({
    where: { id: params.memberId, shopId: shop.id },
  });
  if (!member) return { ok: false, error: "Member not found." };
  if (member.redactedAt) {
    return { ok: false, error: "This member's data has been redacted." };
  }

  const balance = await getBalance(shop.id, member.id);
  if (balance < reward.pointsCost) {
    return {
      ok: false,
      error: `Not enough points. Balance ${balance}, reward costs ${reward.pointsCost}.`,
    };
  }

  // 2. Create the redemption record + spend the points.
  const redemption = await prisma.redemption.create({
    data: {
      shopId: shop.id,
      memberId: member.id,
      rewardId: reward.id,
      pointsSpent: reward.pointsCost,
      status: "PENDING",
    },
  });

  await recordPointTransaction({
    shopId: shop.id,
    memberId: member.id,
    type: "REDEEM",
    points: -reward.pointsCost,
    reason: `Redeemed reward ${reward.type} (${reward.pointsCost} pts)`,
  });

  // Count a redemption as a loyalty order for the month.
  await prisma.shop.update({
    where: { id: shop.id },
    data: { monthlyLoyaltyOrderCount: { increment: 1 } },
  });

  try {
    await transitionStatus("redemption", redemption.id, "ACTIVE");

    // Every reward now delivers as Shopify store credit. We force this even
    // for legacy rows where reward.type is amount_off / percent_off / free_
    // shipping — those types are no longer creatable in the admin, but
    // historical rows still exist in shops that activated before the cutover.
    // Treating them all as store-credit avoids minting any new Shopify
    // discount codes (no admin clutter) and is collision-proof against
    // other discount apps' combinesWith settings (store credit applies as
    // a payment method, not a discount).
    //
    // For non-amount reward.value (e.g. an old free_shipping row whose
    // value is null), we skip the Shopify credit call and just complete the
    // redemption — the points are already debited, the customer learns
    // they're holding a legacy reward that no longer has a fulfillment
    // path. In practice every active reward catalog after the cutover
    // stores a numeric value.
    const amount = reward.value ?? 0;
    if (amount > 0) {
      const { redeemStoreCreditReward } = await import("./storecredit.server");
      const res = await redeemStoreCreditReward({
        graphql: params.admin.graphql,
        shopId: shop.id,
        shopifyCustomerId: member.shopifyCustomerId,
        amount,
        currencyCode: shop.currencyCode ?? "USD",
        redemptionId: redemption.id,
      });
      if (!res.ok) {
        throw new Error(res.error ?? "Store credit issue failed.");
      }
    }

    await transitionStatus("redemption", redemption.id, "COMPLETED");
    return { ok: true, redemptionId: redemption.id };
  } catch (err) {
    // Compensate: cancel the redemption and restore points via an append-only
    // ADJUST row (never delete the REDEEM row — the ledger is immutable).
    await transitionStatus("redemption", redemption.id, "CANCELLED").catch(
      () => undefined,
    );
    await recordPointTransaction({
      shopId: shop.id,
      memberId: member.id,
      type: "ADJUST",
      points: reward.pointsCost,
      reason: `Reversal: redemption ${redemption.id} failed`,
    });
    const msg = err instanceof Error ? err.message : "Discount creation failed.";
    return { ok: false, error: msg };
  }
}

/**
 * Mark any of the shop's Redemption rows whose discountCode appears in the
 * order's `discount_codes[]` as used. Called from the orders/create webhook
 * AFTER awardForOrder so the customer-facing active-codes list filters used
 * codes out automatically.
 *
 * Idempotent: a redemption already marked used keeps its original usedAt.
 * Returns the number of rows updated (0 when the order had no recognized
 * Royal Loyalty codes).
 */
export async function markRedemptionsUsedByOrder(
  shopDomain: string,
  payload: OrdersCreatePayload,
): Promise<number> {
  const codes = (payload.discount_codes ?? [])
    .map((d) => (d?.code ?? "").trim())
    .filter((c) => c.length > 0);
  if (!codes.length) return 0;

  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  });
  if (!shop) return 0;

  const orderId = String(payload.id);
  const result = await prisma.redemption.updateMany({
    where: {
      shopId: shop.id,
      discountCode: { in: codes },
      usedAt: null,
    },
    data: {
      usedAt: new Date(),
      usedOrderId: orderId,
    },
  });
  return result.count;
}

/**
 * Create a Shopify basic discount code for a redemption reward.
 * GraphQL mutation: `discountCodeBasicCreate`.
 */
async function createDiscountCode(
  graphql: GraphqlClient,
  reward: { type: string; value: number | null; productId: string | null },
): Promise<string> {
  const code = `ROYAL-${randomCode()}`;
  const now = new Date().toISOString();

  // Build the customerGets value per reward type.
  let customerGets: Record<string, unknown>;
  if (reward.type === "percent_off") {
    customerGets = {
      value: { percentage: clampPercent((reward.value ?? 0) / 100) },
      items: { all: true },
    };
  } else if (reward.type === "amount_off") {
    customerGets = {
      value: {
        discountAmount: {
          amount: (reward.value ?? 0).toFixed(2),
          appliesOnEachItem: false,
        },
      },
      items: { all: true },
    };
  } else if (reward.type === "free_shipping") {
    customerGets = {
      value: { percentage: 0 },
      items: { all: true },
    };
  } else if (reward.type === "free_product") {
    // 100% off, restricted to the specific product variant set.
    customerGets = {
      value: { percentage: 1.0 },
      items: reward.productId
        ? { products: { productsToAdd: [reward.productId] } }
        : { all: true },
    };
  } else {
    customerGets = { value: { percentage: 0 }, items: { all: true } };
  }

  // Allow our reward codes to stack with whatever other discounts the
  // merchant runs (auto-discounts for logged-in customers, sale codes,
  // etc.). Shopify silently DROPS a code at checkout if its combinesWith
  // is false against another already-applied discount, which is what
  // caused redeemed codes to "disappear" when a logged-in 10% auto-code
  // was already active. Stacking only works if BOTH discounts allow it;
  // the merchant can still set their other discounts to be exclusive.
  const combinesWith = {
    orderDiscounts: true,
    productDiscounts: true,
    shippingDiscounts: true,
  };

  const basicCodeDiscount: Record<string, unknown> = {
    title: `Royal Loyalty reward (${reward.type})`,
    code,
    startsAt: now,
    customerSelection: { all: true },
    customerGets,
    appliesOncePerCustomer: true,
    usageLimit: 1,
    combinesWith,
  };

  if (reward.type === "free_shipping") {
    basicCodeDiscount.customerGets = { items: { all: true }, value: { percentage: 0 } };
  }

  const MUTATION = `#graphql
    mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode { id }
        userErrors { field message }
      }
    }`;

  const resp = await graphql(MUTATION, {
    variables: { basicCodeDiscount },
  });
  const body = await resp.json();
  const result = body?.data?.discountCodeBasicCreate;
  const errs = result?.userErrors as Array<{ message: string }> | undefined;
  if (errs && errs.length > 0) {
    throw new Error(`Discount creation failed: ${errs.map((e) => e.message).join("; ")}`);
  }
  if (!result?.codeDiscountNode?.id) {
    throw new Error("Discount creation failed: no discount returned.");
  }
  return code;
}

function clampPercent(p: number): number {
  if (!Number.isFinite(p)) return 0;
  if (p < 0) return 0;
  if (p > 1) return 1;
  return p;
}

function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tier recomputation
// ---------------------------------------------------------------------------

/**
 * Recompute a member's tier from the ledger and (when an admin GraphQL client
 * is supplied) tag the Shopify customer with the tier name via `tagsAdd`.
 *
 * Tier selection: highest tier whose threshold the member meets. For
 * thresholdType "points" the metric is the current points balance; for "spend"
 * it is the lifetime gross earned points as a proxy (spend-based thresholds map
 * to cumulative earn under the per-$ rule — exact spend reconciliation is the
 * Phase 4 `orders` job; this keeps tiering live without an extra scope call).
 *
 * Returns the new tier id (or null) and whether it changed.
 */
export async function recomputeTier(
  shopId: string,
  memberId: string,
  admin?: { graphql: GraphqlClient },
): Promise<{ tierId: string | null; changed: boolean }> {
  const member = await prisma.member.findUnique({ where: { id: memberId } });
  if (!member) return { tierId: null, changed: false };

  const tiers = await prisma.tier.findMany({
    where: { shopId },
    orderBy: { threshold: "asc" },
  });
  if (tiers.length === 0) return { tierId: member.currentTierId, changed: false };

  const balance = await getBalance(shopId, memberId);

  // Lifetime positive earn (proxy for spend-threshold tiers).
  const earned = await prisma.pointTransaction.aggregate({
    where: { shopId, memberId, points: { gt: 0 }, type: { in: ["EARN", "IMPORT"] } },
    _sum: { points: true },
  });
  const lifetimeEarned = earned._sum.points ?? 0;

  let selected: string | null = null;
  for (const t of tiers) {
    const metric = t.thresholdType === "spend" ? lifetimeEarned : balance;
    if (metric >= t.threshold) selected = t.id;
  }

  const changed = selected !== member.currentTierId;
  if (changed) {
    await prisma.member.update({
      where: { id: memberId },
      data: { currentTierId: selected },
    });
  }

  // Tag the Shopify customer with the new tier (best-effort; never blocks the
  // ledger). Only when an admin client is available (admin UI / jobs).
  if (changed && selected && admin) {
    const tier = tiers.find((t) => t.id === selected);
    if (tier) {
      try {
        await tagCustomerTier(admin.graphql, member.shopifyCustomerId, tier.name);
      } catch {
        // Tagging is non-critical; the DB tier is the source of truth.
      }
    }
  }

  return { tierId: selected, changed };
}

/**
 * Recompute tier assignment for every non-redacted member of a shop. Call
 * this after any tier mutation (create / update / delete / first-seed) so
 * existing members land in the right tier without waiting for their next
 * earn event. Idempotent — members already on the correct tier are not
 * touched. Failures per member are swallowed; the function never throws.
 *
 * Performance note: O(N) DB round trips per call (one recomputeTier per
 * member). At typical shop sizes (< few thousand members) this finishes
 * inside a request. Move to a background job if a shop grows past that.
 */
export async function recomputeAllTiers(
  shopId: string,
  admin?: { graphql: GraphqlClient },
): Promise<{ scanned: number; changed: number }> {
  const members = await prisma.member.findMany({
    where: { shopId, redactedAt: null },
    select: { id: true },
  });
  let changed = 0;
  await Promise.all(
    members.map(async (m) => {
      try {
        const res = await recomputeTier(shopId, m.id, admin);
        if (res.changed) changed++;
      } catch {
        /* per-member error is non-fatal */
      }
    }),
  );
  return { scanned: members.length, changed };
}

/**
 * Tag a Shopify customer with their tier. GraphQL mutation: `tagsAdd`.
 */
async function tagCustomerTier(
  graphql: GraphqlClient,
  shopifyCustomerId: string,
  tierName: string,
): Promise<void> {
  const MUTATION = `#graphql
    mutation tagsAdd($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        node { id }
        userErrors { field message }
      }
    }`;
  const resp = await graphql(MUTATION, {
    variables: {
      id: toCustomerGid(shopifyCustomerId),
      tags: [`Royal: ${tierName}`],
    },
  });
  const body = await resp.json();
  const errs = body?.data?.tagsAdd?.userErrors as
    | Array<{ message: string }>
    | undefined;
  if (errs && errs.length > 0) {
    throw new Error(errs.map((e) => e.message).join("; "));
  }
}
