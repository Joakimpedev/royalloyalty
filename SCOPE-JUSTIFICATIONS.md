# Scope Justifications — Royal Loyalty

Every scope in `shopify.app.toml` and its exact GraphQL usage. Provided to Shopify review for the high-scrutiny scopes.

| Scope | High-scrutiny | Why needed | Exact GraphQL | Built in |
|---|---|---|---|---|
| `read_customers` | no | Identify loyalty members; read tags for tier logic | `customer`, `customers` query | Phase 2 |
| `write_customers` | **yes** | Tag customers with their VIP tier for merchant segmentation. **Tagging only — no PII is written or modified.** | `tagsAdd` mutation | Phase 2 |
| `read_orders` | **yes** | Compute points & cashback from order total/line items; reconcile; detect refunds. **60-day window only; read-only.** Live awarding is via the `orders/create` webhook (payload parse needs no scope, but the topic requires the scope declared). | `orders` query (explicit field set: `id,name,createdAt,totalPriceSet,customer{id},lineItems`) | Phase 2/4 |
| `write_discounts` | no | Issue discount codes when a member redeems points | `discountCodeBasicCreate` | Phase 2 |
| `read_products` | no | Free-product rewards, product/collection-scoped earn rules, AI setup catalog read | `products` query | Phase 2/3 |
| `read_store_credit_account_transactions` | no | Display member store-credit balance/history | `Customer.storeCreditAccounts` connection | Phase 4 |
| `write_store_credit_account_transactions` | **yes** | Credit store credit for cashback earn + store-credit reward redemption; debit on clawback. Uses Shopify-native store credit (Shopify holds the financial primitive). | `storeCreditAccountCredit`, `storeCreditAccountDebit` | Phase 4 |
| `read_themes` | no | Detect whether the Royal Loyalty theme app embed is enabled on the live theme, so the Branding admin can surface a green/red status pill next to the Product/Cart widget sections. Read-only inspection of `config/settings_data.json` on the MAIN theme only. | `themes` → `files(filenames:["config/settings_data.json"])` | Phase 7 |

**`read_all_orders` is deliberately NOT requested** — no historical backfill beyond the standard 60-day window; forward awarding via webhook only.

Protected Customer Data: **Level 2** (the app accesses customer name + email — Level 2 is unconditional for those fields). See `INCIDENT-RESPONSE.md`, `PII-INVENTORY.md` (generated Phase 6), `SUBPROCESSORS.md`.
