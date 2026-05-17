# Phase 8 — Submission Spec (do AFTER testing; not yet)

You said we're not doing submission/audit yet. This is the spec for when you are. Run the 25-domain compliance audit (Template/COMPLIANCE-AUDIT-PROMPT.md) before submitting — that is the final gate, not done here.

## Feature-reconciliation (do FIRST — Domain 23)
Confirm each shipped and demoable before the listing claims it: points, redemptions (amount/%/free-ship/free-product), referrals+fraud, VIP tiers, storefront widget+loyalty page+product/cart/account, branding, automated emails, POS, integrations (Klaviyo/Gorgias/Judge.me/Flow), multi-language/currency, analytics, support, AI auto-setup, AI optimization, native store credit/cashback, CSV migration. Do NOT list anything not actually working.

## Listing copy (rules baked in)
- Title: `Royal Loyalty: Rewards, Points, VIP & Store Credit`
- Subtitle: ≤60 chars, no pricing/trial/competitor names, no "best/first/only/#1", no stats
- Description: ≤500 chars, functional language only
- Search terms: ≤5
- Support: describe as "in-app support & help docs" — do NOT claim staffed 24/7 chat unless real (Domain 23)

## Assets (you produce)
- Icon 1200×1200: Royal crest — flat quartered sigil, dashed stitch edge tracing the rounded corner, centered loyalty symbol (heart/medal), warm palette (terracotta/cream/sage); no text, no Shopify marks
- 3–6 screenshots 1600×900: real UI only; NO pricing, trial, review quotes, browser chrome, or PII (AI-enforced at submission)
- Demo video 2–3 min: install → AI setup → redemption
- Demo store with realistic data + full-access test credentials

## Pre-submission gates
- [ ] 25-domain compliance audit clean (Template/COMPLIANCE-AUDIT-PROMPT.md)
- [ ] PCD Level 2 form submitted + approved (uses PII-INVENTORY.md, INCIDENT-RESPONSE.md, SUBPROCESSORS.md)
- [ ] Privacy policy public URL live, region matches DATA_REGION verbatim
- [ ] Managed Pricing plans created in Partner Dashboard (Free/Starter $10/Growth/Pro) — finalize Growth/Pro vs live Essent (DEC-04)
- [ ] No excess scopes; API version consistent ×3; billing test mode off in prod; emergency contact set
