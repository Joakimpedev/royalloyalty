# Royal Loyalty — ACTION REQUIRED (your side)

Everything in this file needs **you** (account access, money, live infra, or a browser). Claude cannot do these. Work top-to-bottom. Items are added as the build proceeds.

Status key: ☐ todo · ☑ done

---

## A. Accounts & money (do first)
- ☐ Shopify Partner account at partners.shopify.com
- ☐ Pay the **$19** one-time App Store registration fee
- ☐ Create a **development store** from the Partner Dashboard (for testing)
- ☐ Create the app record in Partner Dashboard with the EXACT name **`Royal Loyalty`** (not a placeholder — it shows on the merchant OAuth screen). Copy the **Client ID / API key** and **API secret**.
- ☐ GitHub: create a private repo (e.g. `royalloyalty`) and tell Claude the URL, or run `git remote add origin <url>` yourself. (Local commits are already being made.)
- ☐ Railway account at railway.app

## B. Railway — TWO environments (PCD Level 2 requires separate test/prod)
- ☐ Create Railway project `royal-loyalty`
- ☐ Create **two** services/environments: `royal-loyalty-staging` and `royal-loyalty-production`
- ☐ Add a **PostgreSQL** database to each
- ☐ **Pin the region** (recommended: EU-West). Write the chosen region here → `__________`. It must match the privacy policy verbatim (Phase 6).
- ☐ Enable encryption at rest (Railway Postgres default) — confirm.
- ☐ Sign the **Railway DPA** (Data Processing Agreement) now, before any merchant data. (support/legal → DPA)

## C. Environment variables (set on BOTH Railway environments)
See `.env.example` for the full list. Critical ones:
- ☐ `SHOPIFY_API_KEY` = Partner app Client ID
- ☐ `SHOPIFY_API_SECRET` = Partner app secret
- ☐ `SHOPIFY_APP_URL` = the Railway public URL of that environment
- ☐ `SCOPES` = (leave as the value in `.env.example` — already matches shopify.app.toml)
- ☐ `DATABASE_URL` = Railway Postgres connection string (per environment)
- ☐ `ANTHROPIC_API_KEY` = Claude API key (for AI onboarding/optimization — get at console.anthropic.com)
- ☐ **`NODE_ENV=production` MUST be explicitly set on the production environment** (if unset, billing silently runs in test mode and no merchant is ever charged)
- ☐ Sign the **Anthropic DPA** before the AI feature goes live (console.anthropic.com → legal). Add to SUBPROCESSORS.md.

## D. Local toolchain (one-time, to run/verify the app)
- ☐ `cd C:\Users\User\royalloyalty`
- ☐ `npm install`
- ☐ Install Shopify CLI: `npm install -g @shopify/cli`
- ☐ `shopify app config link` (links this code to the Partner app record; sets `client_id`)
- ☐ `npm run setup` (prisma generate + migrate deploy — needs `DATABASE_URL`)
- ☐ `shopify app dev` (runs against your dev store — this is the ONLY way to verify runtime behavior; Claude/agents cannot test CSP, token exchange, webhook delivery, incognito)
- ☐ **Confirm the API version enum**: after `npm install`, if `tsc` errors on `ApiVersion.January26`, set `shopify.server.ts` + `shopify.app.toml` + `.graphqlrc.ts` to the newest enum the SDK exposes (all three identical), then tell Claude.

## E. Shopify Partner Dashboard (browser)
- ☐ Set the **emergency developer contact** (required for submission)
- ☐ Complete the **Protected Customer Data form — LEVEL 2** (the app uses customer name + email → Level 2 is mandatory, not optional). You will need: the field-level PII inventory (Claude generates `PII-INVENTORY.md`), the security incident-response plan (`INCIDENT-RESPONSE.md`), confirmation of separate test/prod + encryption.
- ☐ Managed Pricing: create the plans in Partner Dashboard (Free / Starter $10 / Growth / Pro) — exact Growth/Pro prices TBD in Phase 5; entry $10 locked.
- ☐ Host the **privacy policy** at a public URL (Claude generates the content/route; you confirm the public URL is reachable without login and matches the Railway region).

## F. Submission assets (Phase 8 — Claude specs them, you produce/upload)
- ☐ App icon 1200×1200 (Royal crest — flat quartered sigil, stitched edge, centered loyalty symbol, warm palette; no text/Shopify marks)
- ☐ 3–6 screenshots 1600×900 (real UI, no pricing/trial/review/chrome/PII)
- ☐ Demo video 2–3 min (install → AI setup → redemption)
- ☐ Demo store with realistic data + full-access test credentials

---

## Open product decisions (Claude needs your call when convenient)
- ☐ DEC-01: AI provider = Claude API (default). OK? If not, name the provider.
- ☐ DEC-04: exact Growth/Pro monthly prices (entry Starter $10 locked). Decide in Phase 5 against live Essent tiers.

## Reconciliations Claude made (FYI, no action unless you disagree)
- Nav uses the official Shopify React Router template's `<s-app-nav>` (Polaris Web Components) — the earlier audit note about `ui-nav-menu` was from an older App Bridge v4.x context; the current official template ships `s-app-nav`. Following the official template.
- API version pinned `2026-01` per the dev plan (template shipped `2025-10`) — verify enum on `npm install` (item D).
