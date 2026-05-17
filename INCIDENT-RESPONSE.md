# Security Incident Response Plan — Royal Loyalty

PCD Level 2 deliverable (required because the app processes customer name + email). One page is sufficient for Shopify; finalized in Phase 6.

**Controller:** Dealify Nordahl — dealifynordahl@gmail.com

## Scope of sensitive data
Member name + email (loyalty identity, referral emails, notifications). Point ledger, store-credit mirror. No payment data (Shopify Billing only). No health data.

## Detection
- Railway service/error alerting; application error boundaries; anomalous webhook/auth failure logging (no PII in logs).

## Response steps
1. **Contain** — revoke compromised credentials/tokens; rotate `SHOPIFY_API_SECRET`, `DATABASE_URL`, `ANTHROPIC_API_KEY`; isolate the affected Railway environment.
2. **Assess** — scope which shops/members' PII was exposed using the field-level PII inventory (`PII-INVENTORY.md`).
3. **Notify** — affected merchants and, where required, Shopify and data-protection authorities within statutory windows (GDPR 72h).
4. **Eradicate & recover** — patch root cause; restore from encrypted backup; verify integrity.
5. **Post-incident** — written review; update this plan and the compliance database.

## Preventive baseline
Separate staging/production Railway environments; encryption at rest (Railway Postgres) + TLS in transit; secrets only via env (never committed/logged); least-privilege scopes; no PII in logs; single-use refresh-token DB lock.

_Status: stub created Phase 0; finalized with the field-level PII inventory in Phase 6._
