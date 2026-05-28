// Store credit / cashback (Phase 4).
//
// Shopify is the financial source of truth via the native Store Credit API.
// Royal mirrors every credit/debit into StoreCreditLedger for history,
// analytics and reconciliation. The Shopify write and the mirror write are not
// atomic — the mirror row is created as PENDING, flipped to OK only after the
// Shopify mutation succeeds, and the reconciliation job (reconcile.server.ts)
// repairs any drift/orphans.
//
// Exact mutations (scope: write_store_credit_account_transactions):
//   storeCreditAccountCredit  — add credit (cashback earn, store-credit reward)
//   storeCreditAccountDebit   — remove credit (refund clawback, manual debit)
// Reads (scope: read_store_credit_account_transactions): the
//   Customer.storeCreditAccounts CONNECTION — there is NO top-level
//   storeCreditAccount query.
import prisma from "../db.server";

type GraphqlClient = (
  query: string,
  options?: { variables?: Record<string, unknown> },
) => Promise<{ json: () => Promise<any> }>;

function toCustomerGid(shopifyCustomerId: string): string {
  if (shopifyCustomerId.startsWith("gid://")) return shopifyCustomerId;
  return `gid://shopify/Customer/${shopifyCustomerId}`;
}

// ---------------------------------------------------------------------------
// Reads — Customer.storeCreditAccounts connection
// ---------------------------------------------------------------------------

const STORE_CREDIT_ACCOUNTS_QUERY = `#graphql
  query StoreCreditAccounts($customerId: ID!) {
    customer(id: $customerId) {
      id
      storeCreditAccounts(first: 10) {
        nodes {
          id
          balance { amount currencyCode }
        }
      }
    }
  }`;

export interface StoreCreditAccount {
  id: string;
  amount: number;
  currencyCode: string;
}

/**
 * Read the customer's store credit accounts (the connection on Customer — NOT a
 * top-level query). Returns [] if the customer has none.
 */
export async function getStoreCreditAccounts(
  graphql: GraphqlClient,
  shopifyCustomerId: string,
): Promise<StoreCreditAccount[]> {
  const resp = await graphql(STORE_CREDIT_ACCOUNTS_QUERY, {
    variables: { customerId: toCustomerGid(shopifyCustomerId) },
  });
  const body = await resp.json();
  const nodes: Array<{
    id: string;
    balance?: { amount?: string; currencyCode?: string };
  }> = body?.data?.customer?.storeCreditAccounts?.nodes ?? [];
  return nodes.map((n) => ({
    id: n.id,
    amount: Number.parseFloat(n.balance?.amount ?? "0") || 0,
    currencyCode: n.balance?.currencyCode ?? "USD",
  }));
}

export async function getStoreCreditBalance(
  graphql: GraphqlClient,
  shopifyCustomerId: string,
  currencyCode: string,
): Promise<number> {
  const accounts = await getStoreCreditAccounts(graphql, shopifyCustomerId);
  return accounts
    .filter((a) => a.currencyCode === currencyCode)
    .reduce((sum, a) => sum + a.amount, 0);
}

// ---------------------------------------------------------------------------
// Writes — credit / debit + mirror
// ---------------------------------------------------------------------------

// NOTE: we deliberately do NOT select `account { id }` here. Reading that
// sub-field requires the `read_store_credit_accounts` scope, which is separate
// from `write_store_credit_account_transactions`. We never use the account id
// in the returned payload — leaving it in caused every cashback write to fail
// with "Access denied for account field". Account-level reads go through the
// dedicated STORE_CREDIT_ACCOUNTS_QUERY (which requires that scope).
const CREDIT_MUTATION = `#graphql
  mutation storeCreditAccountCredit($id: ID!, $creditInput: StoreCreditAccountCreditInput!) {
    storeCreditAccountCredit(id: $id, creditInput: $creditInput) {
      storeCreditAccountTransaction {
        id
        amount { amount currencyCode }
      }
      userErrors { field message }
    }
  }`;

const DEBIT_MUTATION = `#graphql
  mutation storeCreditAccountDebit($id: ID!, $debitInput: StoreCreditAccountDebitInput!) {
    storeCreditAccountDebit(id: $id, debitInput: $debitInput) {
      storeCreditAccountTransaction {
        id
        amount { amount currencyCode }
      }
      userErrors { field message }
    }
  }`;

export interface CreditResult {
  ok: boolean;
  ledgerId: string;
  shopifyTxnId?: string;
  error?: string;
}

/**
 * Credit store credit to a customer and mirror it.
 * `id` for the mutation is the CUSTOMER id — Shopify resolves/creates the
 * account in the given currency.
 */
export async function creditStoreCredit(params: {
  graphql: GraphqlClient;
  shopId: string;
  shopifyCustomerId: string;
  amount: number;
  currencyCode: string;
  reason: string;
  orderId?: string;
}): Promise<CreditResult> {
  if (!(params.amount > 0)) {
    return { ok: false, ledgerId: "", error: "Amount must be greater than 0." };
  }

  // 1. Mirror row first, PENDING (so an orphaned Shopify write is detectable
  //    too — the reconcile job repairs both directions).
  const ledger = await prisma.storeCreditLedger.create({
    data: {
      shopId: params.shopId,
      shopifyCustomerId: params.shopifyCustomerId,
      amount: params.amount,
      direction: "credit",
      reason: params.reason,
      orderId: params.orderId ?? null,
      reconcileState: "PENDING",
    },
  });

  try {
    const resp = await params.graphql(CREDIT_MUTATION, {
      variables: {
        id: toCustomerGid(params.shopifyCustomerId),
        creditInput: {
          creditAmount: {
            amount: params.amount.toFixed(2),
            currencyCode: params.currencyCode,
          },
        },
      },
    });
    const body = await resp.json();
    const result = body?.data?.storeCreditAccountCredit;
    const errs = result?.userErrors as
      | Array<{ message: string }>
      | undefined;
    if (errs && errs.length > 0) {
      const msg = errs.map((e) => e.message).join("; ");
      console.warn(
        `[storecredit] credit FAILED userErrors customer=${params.shopifyCustomerId} amount=${params.amount} ${params.currencyCode} reason="${params.reason}" :: ${msg}`,
      );
      await prisma.storeCreditLedger.update({
        where: { id: ledger.id },
        data: { reconcileState: "DRIFT" },
      });
      return { ok: false, ledgerId: ledger.id, error: msg };
    }
    const txnId = result?.storeCreditAccountTransaction?.id as
      | string
      | undefined;
    await prisma.storeCreditLedger.update({
      where: { id: ledger.id },
      data: { shopifyTxnId: txnId ?? null, reconcileState: "OK" },
    });
    return { ok: true, ledgerId: ledger.id, shopifyTxnId: txnId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Store credit write failed.";
    console.warn(
      `[storecredit] credit THREW customer=${params.shopifyCustomerId} amount=${params.amount} ${params.currencyCode} reason="${params.reason}" :: ${msg}`,
    );
    await prisma.storeCreditLedger.update({
      where: { id: ledger.id },
      data: { reconcileState: "DRIFT" },
    });
    return { ok: false, ledgerId: ledger.id, error: msg };
  }
}

/**
 * Debit store credit from a customer's account and mirror it.
 * Debit requires a specific store-credit ACCOUNT id (the connection read gives
 * it). We pick the first account matching the currency.
 */
export async function debitStoreCredit(params: {
  graphql: GraphqlClient;
  shopId: string;
  shopifyCustomerId: string;
  amount: number;
  currencyCode: string;
  reason: string;
  orderId?: string;
  reversedForOrderId?: string;
}): Promise<CreditResult> {
  if (!(params.amount > 0)) {
    return { ok: false, ledgerId: "", error: "Amount must be greater than 0." };
  }

  const accounts = await getStoreCreditAccounts(
    params.graphql,
    params.shopifyCustomerId,
  );
  const account = accounts.find(
    (a) => a.currencyCode === params.currencyCode,
  );

  const ledger = await prisma.storeCreditLedger.create({
    data: {
      shopId: params.shopId,
      shopifyCustomerId: params.shopifyCustomerId,
      amount: params.amount,
      direction: "debit",
      reason: params.reason,
      orderId: params.orderId ?? null,
      reversedForOrderId: params.reversedForOrderId ?? null,
      reconcileState: "PENDING",
    },
  });

  if (!account) {
    await prisma.storeCreditLedger.update({
      where: { id: ledger.id },
      data: { reconcileState: "DRIFT" },
    });
    return {
      ok: false,
      ledgerId: ledger.id,
      error: "No store credit account in this currency to debit.",
    };
  }

  // Cap the debit at the available balance (Shopify rejects over-debit; clamp
  // so a partial clawback still removes what it can).
  const debitAmount = Math.min(params.amount, account.amount);
  if (!(debitAmount > 0)) {
    await prisma.storeCreditLedger.update({
      where: { id: ledger.id },
      data: { reconcileState: "OK", amount: 0 },
    });
    return { ok: true, ledgerId: ledger.id };
  }

  try {
    const resp = await params.graphql(DEBIT_MUTATION, {
      variables: {
        id: account.id,
        debitInput: {
          debitAmount: {
            amount: debitAmount.toFixed(2),
            currencyCode: params.currencyCode,
          },
        },
      },
    });
    const body = await resp.json();
    const result = body?.data?.storeCreditAccountDebit;
    const errs = result?.userErrors as
      | Array<{ message: string }>
      | undefined;
    if (errs && errs.length > 0) {
      await prisma.storeCreditLedger.update({
        where: { id: ledger.id },
        data: { reconcileState: "DRIFT" },
      });
      return {
        ok: false,
        ledgerId: ledger.id,
        error: errs.map((e) => e.message).join("; "),
      };
    }
    const txnId = result?.storeCreditAccountTransaction?.id as
      | string
      | undefined;
    await prisma.storeCreditLedger.update({
      where: { id: ledger.id },
      data: {
        shopifyTxnId: txnId ?? null,
        amount: debitAmount,
        reconcileState: "OK",
      },
    });
    return { ok: true, ledgerId: ledger.id, shopifyTxnId: txnId };
  } catch (err) {
    await prisma.storeCreditLedger.update({
      where: { id: ledger.id },
      data: { reconcileState: "DRIFT" },
    });
    return {
      ok: false,
      ledgerId: ledger.id,
      error: err instanceof Error ? err.message : "Store credit debit failed.",
    };
  }
}

// ---------------------------------------------------------------------------
// Cashback — % of order total -> store credit
// ---------------------------------------------------------------------------

export interface CashbackSettings {
  enabled: boolean;
  percent: number; // e.g. 5 = 5% of order total back as store credit
}

const DEFAULT_CASHBACK: CashbackSettings = { enabled: false, percent: 5 };

export function readCashbackSettings(snapshot: unknown): CashbackSettings {
  const snap =
    snapshot && typeof snapshot === "object"
      ? ((snapshot as Record<string, unknown>).cashback as
          | Partial<CashbackSettings>
          | undefined)
      : undefined;
  return { ...DEFAULT_CASHBACK, ...(snap ?? {}) };
}

export async function getCashbackSettings(
  shopId: string,
): Promise<CashbackSettings> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { aiConfigSnapshot: true },
  });
  return readCashbackSettings(shop?.aiConfigSnapshot);
}

export async function saveCashbackSettings(
  shopId: string,
  next: CashbackSettings,
): Promise<void> {
  const shop = await prisma.shop.findUnique({
    where: { id: shopId },
    select: { aiConfigSnapshot: true },
  });
  const base =
    shop?.aiConfigSnapshot && typeof shop.aiConfigSnapshot === "object"
      ? (shop.aiConfigSnapshot as Record<string, unknown>)
      : {};
  await prisma.shop.update({
    where: { id: shopId },
    data: { aiConfigSnapshot: { ...base, cashback: next } },
  });
}

/**
 * Award cashback for an order: percent of order total credited as store credit.
 * Idempotent per order via the StoreCreditLedger orderId mirror row.
 */
export async function awardCashback(params: {
  graphql: GraphqlClient;
  shopId: string;
  shopifyCustomerId: string;
  orderId: string;
  orderTotal: number;
  currencyCode: string;
}): Promise<{ ok: boolean; amount?: number; reason?: string }> {
  const settings = await getCashbackSettings(params.shopId);
  if (!settings.enabled || settings.percent <= 0)
    return { ok: false, reason: "disabled" };

  const dup = await prisma.storeCreditLedger.findFirst({
    where: {
      shopId: params.shopId,
      orderId: params.orderId,
      direction: "credit",
      reason: { contains: "[cashback]" },
    },
    select: { id: true },
  });
  if (dup) return { ok: false, reason: "duplicate" };

  const amount =
    Math.round(params.orderTotal * (settings.percent / 100) * 100) / 100;
  if (!(amount > 0)) return { ok: false, reason: "zero" };

  const res = await creditStoreCredit({
    graphql: params.graphql,
    shopId: params.shopId,
    shopifyCustomerId: params.shopifyCustomerId,
    amount,
    currencyCode: params.currencyCode,
    reason: `Cashback ${settings.percent}% on order ${params.orderId} [cashback]`,
    orderId: params.orderId,
  });
  return res.ok
    ? { ok: true, amount }
    : { ok: false, reason: res.error ?? "credit_failed" };
}

/**
 * Redeem a store-credit reward: convert points (already debited by the loyalty
 * engine) into store credit for the customer. Mirrors as a credit row.
 */
export async function redeemStoreCreditReward(params: {
  graphql: GraphqlClient;
  shopId: string;
  shopifyCustomerId: string;
  amount: number;
  currencyCode: string;
  redemptionId: string;
}): Promise<CreditResult> {
  return creditStoreCredit({
    graphql: params.graphql,
    shopId: params.shopId,
    shopifyCustomerId: params.shopifyCustomerId,
    amount: params.amount,
    currencyCode: params.currencyCode,
    reason: `Store credit reward [redemption:${params.redemptionId}]`,
  });
}

/**
 * Clawback store credit awarded for an order (refund / cancel). Per-order
 * idempotent via the mirror's reversedForOrderId. Reverses every credit row
 * tied to the order that has not already been reversed.
 */
export async function clawbackStoreCreditForOrder(params: {
  graphql: GraphqlClient;
  shopId: string;
  orderId: string;
}): Promise<{ ok: boolean; reversed: number }> {
  // Already reversed? (per-order idempotency)
  const priorReversal = await prisma.storeCreditLedger.findFirst({
    where: {
      shopId: params.shopId,
      reversedForOrderId: params.orderId,
      direction: "debit",
    },
    select: { id: true },
  });
  if (priorReversal) return { ok: true, reversed: 0 };

  const credits = await prisma.storeCreditLedger.findMany({
    where: {
      shopId: params.shopId,
      orderId: params.orderId,
      direction: "credit",
    },
  });
  let reversed = 0;
  for (const c of credits) {
    const res = await debitStoreCredit({
      graphql: params.graphql,
      shopId: params.shopId,
      shopifyCustomerId: c.shopifyCustomerId,
      amount: c.amount,
      currencyCode: "USD",
      reason: `Clawback for order ${params.orderId}`,
      orderId: params.orderId,
      reversedForOrderId: params.orderId,
    });
    if (res.ok) reversed++;
  }
  return { ok: true, reversed };
}
