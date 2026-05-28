# Royal Loyalty — Storefront QA Checklist

Customer-facing test pass. Walk through this on a real store with the app installed and the theme app embed enabled.

---

## Launcher (floating widget)

- [x] Appears on every storefront page once theme app embed is enabled
- [x] Position matches branding setting (bottom-right / bottom-left)
- [x] Bubble color + text color match branding
- [x] Crown icon + launcher text render correctly
- [x] Hover lifts the pill slightly (no jank)
- [x] Click opens the panel
- [x] Close (X) button closes the panel
- [x] Escape key closes the panel
- [x] Click outside doesn't accidentally trigger checkout / other theme buttons

## Panel (modal)

- [x] Typography looks consistent with the panel design, NOT the host theme (no giant serif headings bleeding in)
- [x] Logged-out: shows the visitor status card with sign-in CTA (SSR'd, paints on first frame)
- [x] Sign-in link goes to `/account/login`
- [x] Logged-in non-member: shows the same balance dashboard as members, at 0 (auto-enrolls on first earn event — no separate prompt)
- [x] Logged-in member: shows current balance + points name + tier pill + Next Reward progress bar
- [x] Cashback line shows if cashback enabled ("Earn X% back as store credit on every order.")
- [x] Custom panel title from branding admin applies (overrides theme-editor default, SSR'd via shop metafield)
- [x] Custom launcher text from branding admin applies (SSR'd via shop metafield)
- [x] Live store credit balance pill shows when customer has any (between points and cashback line)
- [x] No console errors

## Rewards list (in panel)

- [x] Rewards load (no red diagnostic block)
- [x] Each reward shows label + point cost
- [x] Currency in labels matches the shop's currency (e.g. `$5 off`, `kr 5 off`)
- [x] Rewards above current balance show Redeem button disabled with "Not enough points yet" tooltip
- [x] Affordable rewards show Redeem enabled
- [x] Click Redeem on an affordable reward:
  - [x] Button disables, status shows "Redeeming…"
  - [x] On success: status shows "Reward applied — store credit added to your account."
  - [x] Points deducted from balance after refresh
  - [x] Customer's Shopify store credit balance increases by the reward value
- [x] If no rewards configured: "No rewards available yet — check back soon."

## Active codes (in panel)

**REMOVED**: rewards now deliver as Shopify store credit, no discount codes are minted.
Section retained in source as historical reference only.

## Earn — order

- [x] Place a test order while signed in
- [x] Order points appear on the member's balance after webhook fires (give it a few seconds)
- [x] Amount matches earn rule (flat or per-$)
- [ ] If member is in a tier: multiplier applied  *(tier promotion untested overall)*

## Earn — signup

- [x] Sign up as a new customer
- [x] Signup bonus lands in balance on first panel open

## Earn — birthday / anniversary / newsletter / social / review

For each rule the merchant has enabled in admin:

- [x] Trigger the action (e.g. follow on social and click the Follow button)
- [x] Points awarded once
- [x] Second click does NOT double-award
- [x] Disabled rules don't award and don't appear in the widget

## Earn — refund / cancel

- [x] Cancel a paid order → points reverse on the member
- [x] Refund part of an order → points partially reverse

## Redeem — store credit only (post-rewrite)

- [x] **Store credit** → customer's Shopify store credit balance increases by the reward value, applies at checkout as a payment method
- [x] Insufficient balance: Redeem button cannot fire
- [x] No new entry created in Shopify admin → Discounts (no more discount-code minting)
- [x] Reward stacks with other discounts at checkout (store credit is a payment method, not subject to combinesWith)

## Loyalty page block (dedicated /loyalty page if you've added the block)

- [x] Page renders the full program: earn rules list, rewards list, tier progress, referral section
- [x] Earn rules show titles + point values
- [x] Rewards sorted by point cost ascending
- [ ] Tier section shows current tier + progress to next tier (if tiers configured)  *(tier promotion untested overall)*
- [x] Referral section shows the customer's unique link + share buttons (if referrals enabled)
- [x] "Points" wording matches the custom points name from branding

## Customer account block (Shopify /account)

- [x] Loyalty block visible on the account page
- [x] Shows balance + tier badge
- [x] Shows recent activity (earns + redemptions)
- [x] Link through to the full loyalty page works

## Product page injection (if `productEnabled` in branding)

- [x] On a PDP, a "Earn X points with this purchase" card renders above Add to Cart
- [x] Point count matches the product price × purchase earn rule
- [x] Card uses the configured accent color
- [x] Heading + subtext use the configured templates (`{points}` / `{balance}` / `{more}`)
- [x] No duplicate card if the page re-renders

## Cart injection (if `cartEnabled` in branding)

- [x] On `/cart` and in the cart drawer, a "Use your points" card renders above the Checkout button
- [x] Logged-out: shows "Sign in to apply your points to this order." with sign-in link
- [x] Logged-in: shows balance, "+X points for this order", "+X store credit" if cashback enabled
- [x] Live store credit balance line shows when customer has any
- [x] Affordable rewards listed as clickable buttons
- [x] Click a reward → store credit applied silently, no redirect, no code; status reads "Reward applied — store credit added to your account."
- [x] Card survives cart drawer re-render (MutationObserver re-inject)

## Referrals

- [x] Open the referral link from the widget while signed in
- [x] Copy it to another browser / incognito
- [x] Visit storefront with `?ref=CODE` → cookie `royal_ref` set for 30 days
- [x] Sign up as a new customer in that session
- [x] Place a qualifying order (above holdback if configured)
- [x] After holdback elapses (or merchant approves): both referrer and referee get points
- [x] Self-referral (same email) is rejected
- [x] Same-IP behavior matches setting (block vs flag-for-review)

## Cashback

- [x] Place a test order
- [x] Store credit issued at the configured % of the order
- [x] Credit visible in the Shopify customer account
- [x] Credit usable at next checkout

## Tier promotion

- [ ] Earn enough points / spend to cross a tier threshold
- [ ] Tier badge updates in the widget on next load
- [ ] Next order earns at the new tier's multiplier
- [ ] Customer never demoted below previous tier without a rule change

## POS extension (if you'll use it)

- [ ] Tile on POS home shows balance when a customer is on the cart
- [ ] Modal balance lookup by phone / email works
- [ ] Manual award points at register (amount + reason)
- [ ] Redeem reward at register applies discount + deducts points

## Sanity

- [x] No console errors on any storefront page
- [x] Widget loads within ~500ms, no layout shift
- [x] Disabling theme app embed → widget cleanly disappears, no broken markup
- [x] Mobile width: launcher + panel render without overflow
- [x] Reduced-motion preference honored (no large animations)
- [x] If `/loyalty/balance` ever 4xx/5xx: red diagnostic block surfaces the URL + status + body snippet inside the panel (debug aid — should not appear in normal use)

---

## Smoke pass (run this end-to-end first)

1. [ ] Sign up as a new test customer → signup bonus lands
2. [ ] Place a $100 test order at 1 pt/$1 → 100 points appear
3. [ ] Open panel → see balance → redeem the cheapest reward
4. [ ] Code applies at checkout / discount link works
5. [ ] Cancel the order → points reverse correctly
6. [ ] Share the referral link → friend signs up + buys → both rewarded after holdback
7. [ ] Cashback at configured % → store credit visible in Shopify account
