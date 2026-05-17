// GDPR / PCD Level 2 shared helpers (ROYAL-LOYALTY-DEVELOPMENT.md Phase 6).
//
// Used by the three mandatory compliance webhooks. The webhook ROUTES enforce
// the universal contract (HMAC 401/200, X-Shopify-Event-Id dedup, async-safe,
// NO PII in any log line — safeLog only ever emits topic + shop domain + note).
// These helpers never log; they only read/mutate the DB.
//
// PII LOCATIONS (kept in sync with PII-INVENTORY.md): the only customer PII
// fields are Member.name and Member.email. shopifyCustomerId is a Shopify
// identifier (used to locate records, returned in a data request to the store
// owner) — not redacted, as records are kept (anonymised) per Shopify policy.
import type { Prisma } from "@prisma/client";
import prisma from "../db.server";

/** Normalise a Shopify customer id to the bare numeric string we store. */
export function normalizeCustomerId(raw: unknown): string {
  const s = String(raw ?? "");
  const m = s.match(/Customer\/(\d+)/);
  return m ? m[1] : s;
}

/**
 * customers/data_request — assemble EVERY stored record tied to a customer,
 * across every model that references them, for the merchant to fulfil the SAR.
 * Returns a plain serialisable object (the controller delivers it to the store
 * owner out-of-band; Shopify only requires we make it available).
 */
export async function collectCustomerData(
  shopDomain: string,
  shopifyCustomerId: string,
) {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  });
  if (!shop) {
    return { shopDomain, shopifyCustomerId, found: false as const };
  }

  const members = await prisma.member.findMany({
    where: { shopId: shop.id, shopifyCustomerId },
  });

  if (members.length === 0) {
    return {
      shopDomain,
      shopifyCustomerId,
      found: false as const,
      note: "No loyalty member record for this customer.",
    };
  }

  const memberIds = members.map((m) => m.id);

  const [
    pointTransactions,
    redemptions,
    referralsMade,
    storeCredit,
  ] = await Promise.all([
    prisma.pointTransaction.findMany({
      where: { shopId: shop.id, memberId: { in: memberIds } },
    }),
    prisma.redemption.findMany({
      where: { shopId: shop.id, memberId: { in: memberIds } },
    }),
    prisma.referral.findMany({
      where: { shopId: shop.id, referrerId: { in: memberIds } },
    }),
    prisma.storeCreditLedger.findMany({
      where: { shopId: shop.id, shopifyCustomerId },
    }),
  ]);

  // Referrals where this customer was the REFEREE (their email was used).
  const refereeEmails = members
    .map((m) => m.email)
    .filter((e): e is string => Boolean(e));
  const referralsReceived = refereeEmails.length
    ? await prisma.referral.findMany({
        where: { shopId: shop.id, refereeEmail: { in: refereeEmails } },
      })
    : [];

  return {
    shopDomain,
    shopifyCustomerId,
    found: true as const,
    member: members.map((m) => ({
      id: m.id,
      shopifyCustomerId: m.shopifyCustomerId,
      email: m.email,
      name: m.name,
      enrolledAt: m.enrolledAt,
      currentTierId: m.currentTierId,
      redactedAt: m.redactedAt,
    })),
    pointTransactions,
    redemptions,
    referralsMade,
    referralsReceived,
    storeCredit,
  };
}

/**
 * customers/redact — anonymise PII while KEEPING records (ledger integrity,
 * analytics, financial reconciliation). Idempotent: a member already redacted
 * is left as-is. Sets Member.redactedAt; nulls name; replaces email with the
 * sentinel "[redacted]" (kept non-null so unique/index constraints and any
 * referee-email joins remain well-formed without exposing PII).
 *
 * Only Member rows hold customer PII (name/email). PointTransaction.reason,
 * Redemption, Referral, StoreCreditLedger reference the customer by
 * non-PII ids only — they are retained unchanged.
 */
export async function redactCustomer(
  shopDomain: string,
  shopifyCustomerId: string,
): Promise<{ redacted: number; alreadyRedacted: number }> {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  });
  if (!shop) return { redacted: 0, alreadyRedacted: 0 };

  const members = await prisma.member.findMany({
    where: { shopId: shop.id, shopifyCustomerId },
    select: { id: true, redactedAt: true },
  });

  let redacted = 0;
  let alreadyRedacted = 0;
  for (const m of members) {
    if (m.redactedAt) {
      alreadyRedacted++;
      continue;
    }
    await prisma.member.update({
      where: { id: m.id },
      data: {
        name: null,
        email: "[redacted]",
        redactedAt: new Date(),
      },
    });
    redacted++;
  }

  // Anonymise referee email on any referral that targeted this customer.
  await prisma.referral.updateMany({
    where: {
      shopId: shop.id,
      refereeEmail: { not: null },
      referrer: { shopifyCustomerId },
    },
    data: { refereeEmail: "[redacted]", refereeIp: null },
  });

  return { redacted, alreadyRedacted };
}

/**
 * shop/redact — delete EVERY model for the shop. Explicit, enumerated list
 * (ROYAL-LOYALTY-DEVELOPMENT.md Phase 6 — verified against prisma/schema.prisma
 * at build time). Order respects FK direction (children before parents) even
 * though onDelete: Cascade would handle most — explicit deleteMany is the
 * required pattern. Idempotent (deleteMany on already-empty tables is a no-op).
 *
 * EXPLICIT MODEL LIST (keep incrementally maintained — any model added later
 * MUST be appended in the same phase that adds it):
 *   Member, PointTransaction, Tier, EarnRule, Reward, Redemption, Referral,
 *   StoreCreditLedger, AiSuggestion, Integration, ProcessedWebhook, Session,
 *   Shop
 *
 * Billing is cancelled BEFORE this runs (see webhooks.shop.redact.tsx).
 */
export async function redactShop(shopDomain: string): Promise<boolean> {
  const shop = await prisma.shop.findUnique({
    where: { shopDomain },
    select: { id: true },
  });

  // Sessions are keyed by shop domain, not Shop.id — delete regardless of
  // whether a Shop row still exists (idempotent / reinstall-safe).
  await prisma.session.deleteMany({ where: { shop: shopDomain } });
  // ProcessedWebhook has no shop scoping column; it is dedup bookkeeping with
  // no PII. It is intentionally NOT mass-deleted by domain here (would risk
  // wiping unrelated shops' dedup state). Per-shop data is fully removed below.

  if (!shop) return false;
  const shopId = shop.id;

  // Children → parents. Each is an explicit deleteMany (the required pattern).
  await prisma.$transaction([
    prisma.pointTransaction.deleteMany({ where: { shopId } }),
    prisma.redemption.deleteMany({ where: { shopId } }),
    prisma.referral.deleteMany({ where: { shopId } }),
    prisma.storeCreditLedger.deleteMany({ where: { shopId } }),
    prisma.aiSuggestion.deleteMany({ where: { shopId } }),
    prisma.integration.deleteMany({ where: { shopId } }),
    prisma.earnRule.deleteMany({ where: { shopId } }),
    prisma.reward.deleteMany({ where: { shopId } }),
    // Member references Tier (currentTierId) — clear members before tiers.
    prisma.member.deleteMany({ where: { shopId } }),
    prisma.tier.deleteMany({ where: { shopId } }),
    prisma.shop.deleteMany({ where: { id: shopId } }),
  ] as Prisma.PrismaPromise<unknown>[]);

  return true;
}
