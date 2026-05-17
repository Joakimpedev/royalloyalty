# Phase 7 — Testing Checklist (run on your dev store)

These require a running app (`shopify app dev` against a dev store) — agents cannot verify runtime. Work top to bottom once ACTION-REQUIRED §A–D are done.

## Functional
- [ ] Install on a clean dev store → AI onboarding renders a proposed program → edit a card → Activate → program live
- [ ] Empty store (no products/orders) → AI falls back to the labeled default template (no blank/error)
- [ ] Place a test order → `orders/create` → points awarded to the member; `monthlyLoyaltyOrderCount` increments once
- [ ] Redeem a reward → discount code created (`discountCodeBasicCreate`) and applies at checkout
- [ ] VIP tier auto-moves when threshold crossed; customer tagged
- [ ] Referral: generate link → referred order → both rewarded; self-referral blocked; same-IP flagged; holdback delays payout
- [ ] Store credit: cashback credits via `storeCreditAccountCredit`; balance shows; reflected in `StoreCreditLedger`
- [ ] Refund (`refunds/create`) and cancel (`orders/cancelled`) → single clawback; partial-refund-then-cancel does NOT double-claw
- [ ] CSV import: map → dry-run preview → commit → ledger correct; imported historical orders do NOT trigger awards
- [ ] Uninstall → sessions deleted, shop inactive, billing subscription cancelled; reinstall works (Token Exchange)
- [ ] All GDPR webhooks: send test payloads → data_request returns all data; redact anonymises + sets redactedAt; shop/redact deletes everything; 401 on bad HMAC
- [ ] `app_subscriptions/update`: subscribe/upgrade/downgrade/cancel; freeze then unfreeze → ACTIVE restores paid

## Security / auth
- [ ] App works in Chrome incognito (no third-party cookies)
- [ ] CSP `frame-ancestors` set per shop
- [ ] No REST calls anywhere (GraphQL only)
- [ ] API version identical in shopify.server.ts, shopify.app.toml, .graphqlrc.ts (confirm enum compiles — ACTION-REQUIRED §D)
- [ ] Expiring offline token refresh works; concurrent-refresh lock holds
- [ ] Webhook HMAC validated; `X-Shopify-Event-Id` dedup prevents double-processing
- [ ] `NODE_ENV=production` set in prod so billing is live

## UI
- [ ] Nav renders desktop + mobile; modals work (verify App Bridge init)
- [ ] Save bar + unsaved-changes block on every form (Program, Tiers, Rewards, Branding, Onboarding, Settings, Support)
- [ ] Every list page has a 3-element empty state on a clean store
- [ ] No fixed-pixel layouts breaking mobile
- [ ] Volume-cap messaging is neutral/informational (no fear framing, no hidden data)

## Storefront / extensions
- [ ] Theme App Extension on Dawn: launcher, loyalty page, product points, cart redeem, account block all work via App Proxy
- [ ] Theme extension Lighthouse delta ≤10 points
- [ ] POS extension: balance lookup, earn, redeem
- [ ] App Proxy requests validate the signature (reject tampered)
