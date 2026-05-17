# Field-Level PII Inventory — Royal Loyalty

**PCD Level 2 deliverable.** Level 2 applies unconditionally because the app
processes customer **name + email** (not tied to the store-credit scopes — see
`SCOPE-JUSTIFICATIONS.md`). Controller: **Dealify Nordahl** —
dealifynordahl@gmail.com. Generated against `prisma/schema.prisma` (Phase 6,
2026-05-17). Keep this in sync with the privacy policy (`app/routes/privacy.tsx`)
and `SUBPROCESSORS.md`.

## Customer personal data (the only true customer PII)

| Model.column | PII type | Purpose | Retention | Redaction mechanism |
|---|---|---|---|---|
| `Member.name` | Customer name (PII) | Identify the loyalty member in admin and notifications | While app installed + program active (append-only ledger needs the member) | `customers/redact` → set to `null` (`gdpr.server.ts` `redactCustomer`); `shop/redact` → row deleted |
| `Member.email` | Customer email (PII) | Identify member, match referrals, send loyalty notifications | Same as above | `customers/redact` → set to `"[redacted]"` (kept non-null for constraints/joins); `shop/redact` → row deleted |
| `Referral.refereeEmail` | Customer email (PII — the invited friend) | Match a referral to the referee on their qualifying order | Until referral resolved / customer redacted | `customers/redact` → set to `"[redacted]"`; `shop/redact` → row deleted |
| `Referral.refereeIp` | IP address (PII — transient anti-fraud) | Same-IP self-referral fraud heuristic | Transient; cleared on redaction | `customers/redact` → set to `null`; `shop/redact` → row deleted |

## Customer-linked identifiers (Shopify references — not personal data on their own, but link to a person)

| Model.column | Type | Purpose | Retention | Redaction mechanism |
|---|---|---|---|---|
| `Member.shopifyCustomerId` | Shopify customer ID | Locate the member; key store-credit/ledger to a customer | While app installed | Kept (anonymised member retains it for ledger integrity); deleted on `shop/redact` |
| `StoreCreditLedger.shopifyCustomerId` | Shopify customer ID | Mirror/reconcile native Shopify store credit | While app installed | Deleted on `shop/redact` (retained on `customers/redact` — financial reconciliation, no PII) |
| `PointTransaction.memberId` / `Redemption.memberId` / `Referral.referrerId` | Internal FK to `Member` | Append-only ledger / redemption / referral records | While app installed | Retained on `customers/redact` (no PII; member is anonymised); deleted on `shop/redact` |

## Merchant / operational data (not customer PII)

| Model.column | Type | Purpose | Retention | Deletion |
|---|---|---|---|---|
| `Shop.shopDomain` | Store domain | Tenant identity | While installed | `shop/redact` deletes the `Shop` row |
| `Session.*` (`accessToken`, `refreshToken`, `email`, `firstName`, `lastName`) | Shopify OAuth session + merchant-user fields | Authenticated Admin API access | Until uninstall | `app/uninstalled` + `shop/redact` `deleteMany({ shop })` |
| `Shop.plan/planStatus/subscriptionId/monthlyLoyaltyOrderCount/quotaPeriodStart` | Billing / quota state | Volume-gated billing | While installed | Deleted with `Shop` on `shop/redact` |
| `PointTransaction.reason` | Free-text reason | Audit of ledger entries | While installed | No customer PII written into reason by design (order ids only); deleted on `shop/redact` |
| `AiSuggestion.*`, `EarnRule.*`, `Reward.*`, `Tier.*`, `Integration.config` | Program configuration | Run the program / integrations | While installed | Deleted on `shop/redact` |
| `ProcessedWebhook.eventId` | Webhook dedup id | Idempotency | Bookkeeping | Not customer-scoped; no PII |

## Data sent to subprocessors

| Subprocessor | PII sent | Note |
|---|---|---|
| Railway (host + PostgreSQL) | All of the above incl. `Member.name`/`Member.email` | Encryption at rest + TLS in transit; region per `SUBPROCESSORS.md` (must match `privacy.tsx` / `DATA_REGION`) |
| Anthropic (Claude API) | **None** — aggregate catalog/volume/theme only | No name, no email, no customer identifiers ever sent |
| Shopify (native email) | `Member.name`, `Member.email` for notification delivery | Shopify-native mechanism; no third-party email subprocessor in v1 |

## Redaction guarantees

- `customers/redact` is **idempotent** — an already-redacted member (`redactedAt` set) is skipped (`gdpr.server.ts`).
- `customers/redact` **keeps records, removes PII** — ledger/redemption/referral rows retained for the merchant's financial + analytics integrity; only name/email/refereeEmail/refereeIp are erased.
- `shop/redact` deletes the **explicit enumerated model list** (verified against `prisma/schema.prisma`): `Member, PointTransaction, Tier, EarnRule, Reward, Redemption, Referral, StoreCreditLedger, AiSuggestion, Integration, Session, Shop`. Any model added in a later phase MUST be appended to `redactShop()` in `app/lib/gdpr.server.ts` in the same phase that adds it.
- No customer PII is written to any log line (`safeLog` in `webhooks.server.ts` emits only topic + shop domain + a non-PII note).
