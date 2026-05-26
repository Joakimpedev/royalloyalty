# Royal Loyalty — Storefront QA Checklist

Customer-facing test pass. Walk through this on a real store with the app installed and the theme app embed enabled.

---

## Launcher (floating widget)

- [ ] Appears on every storefront page once theme app embed is enabled
- [ ] Position matches branding setting (bottom-right / bottom-left)
- [ ] Bubble color + text color match branding
- [ ] Crown icon + launcher text render correctly
- [ ] Hover lifts the pill slightly (no jank)
- [ ] Click opens the panel
- [ ] Close (X) button closes the panel
- [ ] Escape key closes the panel
- [ ] Click outside doesn't accidentally trigger checkout / other theme buttons

## Panel (modal)

- [ ] Typography looks consistent with the panel design, NOT the host theme (no giant serif headings bleeding in)
- [ ] Logged-out: shows "Sign in to see your points and rewards." + Sign-in link
- [ ] Sign-in link goes to `/account/login`
- [ ] Logged-in non-member: shows "Sign up to start earning" prompt
- [ ] Logged-in member: shows current balance + points name
- [ ] Cashback line shows if cashback enabled ("Earn X% back as store credit on every order.")
- [ ] Custom panel title from branding admin applies (overrides theme-editor default)
- [ ] Custom launcher text from branding admin applies
- [ ] No console errors

## Rewards list (in panel)

- [ ] Rewards load (no red diagnostic block)
- [ ] Each reward shows label + point cost
- [ ] Currency in labels matches the shop's currency (e.g. `$5 off`, `kr 5 off`)
- [ ] Rewards above current balance show Redeem button disabled with "Not enough points yet" tooltip
- [ ] Affordable rewards show Redeem enabled
- [ ] Click Redeem on an affordable reward:
  - [ ] Button disables, status shows "Redeeming…"
  - [ ] On success: status shows code (if discount code reward)
  - [ ] Points deducted from balance after refresh
  - [ ] Code appears under "Your active codes"
- [ ] If no rewards configured: "No rewards available yet — check back soon."

## Active codes (in panel)

- [ ] Shows after a redemption
- [ ] Each card shows: reward label, points spent, the code
- [ ] Copy button copies code to clipboard, briefly says "Copied!"
- [ ] Apply to cart button navigates to `/discount/CODE?redirect=/cart`
- [ ] Hidden when no active codes

## Earn — order

- [ ] Place a test order while signed in
- [ ] Order points appear on the member's balance after webhook fires (give it a few seconds)
- [ ] Amount matches earn rule (flat or per-$)
- [ ] If member is in a tier: multiplier applied

## Earn — signup

- [ ] Sign up as a new customer
- [ ] Signup bonus lands in balance on first panel open

## Earn — birthday / anniversary / newsletter / social / review

For each rule the merchant has enabled in admin:

- [ ] Trigger the action (e.g. follow on social and click the Follow button)
- [ ] Points awarded once
- [ ] Second click does NOT double-award
- [ ] Disabled rules don't award and don't appear in the widget

## Earn — refund / cancel

- [ ] Cancel a paid order → points reverse on the member
- [ ] Refund part of an order → points partially reverse

## Redeem — by type

- [ ] **Amount off** → discount code reduces order by $ at checkout
- [ ] **Percent off** → discount code reduces order by % at checkout
- [ ] **Free shipping** → shipping is $0 at checkout
- [ ] **Free product** → correct product added free
- [ ] **Store credit** → balance appears in customer's Shopify account and applies at checkout
- [ ] Insufficient balance: Redeem button cannot fire

## Loyalty page block (dedicated /loyalty page if you've added the block)

- [ ] Page renders the full program: earn rules list, rewards list, tier progress, referral section
- [ ] Earn rules show titles + point values
- [ ] Rewards sorted by point cost ascending
- [ ] Tier section shows current tier + progress to next tier (if tiers configured)
- [ ] Referral section shows the customer's unique link + share buttons (if referrals enabled)
- [ ] "Points" wording matches the custom points name from branding

## Customer account block (Shopify /account)

- [ ] Loyalty block visible on the account page
- [ ] Shows balance + tier badge
- [ ] Shows recent activity (earns + redemptions)
- [ ] Link through to the full loyalty page works

## Product page injection (if `productEnabled` in branding)

- [ ] On a PDP, a "Earn X points with this purchase" card renders above Add to Cart
- [ ] Point count matches the product price × purchase earn rule
- [ ] Card uses the configured accent color
- [ ] Heading + subtext use the configured templates (`{points}` / `{balance}` / `{more}`)
- [ ] No duplicate card if the page re-renders

## Cart injection (if `cartEnabled` in branding)

- [ ] On `/cart` and in the cart drawer, a "Use your points" card renders above the Checkout button
- [ ] Logged-out: shows "Sign in to apply your points to this order." with sign-in link
- [ ] Logged-in: shows balance, "+X points for this order", "+X store credit" if cashback enabled
- [ ] Affordable rewards listed as clickable buttons
- [ ] Click a reward → applies discount and redirects to `/cart` with code applied
- [ ] Active codes (if any) show above the reward list with Copy + Apply
- [ ] Card survives cart drawer re-render (MutationObserver re-inject)

## Referrals

- [ ] Open the referral link from the widget while signed in
- [ ] Copy it to another browser / incognito
- [ ] Visit storefront with `?ref=CODE` → cookie `royal_ref` set for 30 days
- [ ] Sign up as a new customer in that session
- [ ] Place a qualifying order (above holdback if configured)
- [ ] After holdback elapses (or merchant approves): both referrer and referee get points
- [ ] Self-referral (same email) is rejected
- [ ] Same-IP behavior matches setting (block vs flag-for-review)

## Cashback

- [ ] Place a test order
- [ ] Store credit issued at the configured % of the order
- [ ] Credit visible in the Shopify customer account
- [ ] Credit usable at next checkout

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

- [ ] No console errors on any storefront page
- [ ] Widget loads within ~500ms, no layout shift
- [ ] Disabling theme app embed → widget cleanly disappears, no broken markup
- [ ] Mobile width: launcher + panel render without overflow
- [ ] Reduced-motion preference honored (no large animations)
- [ ] If `/loyalty/balance` ever 4xx/5xx: red diagnostic block surfaces the URL + status + body snippet inside the panel (debug aid — should not appear in normal use)

---

## Smoke pass (run this end-to-end first)

1. [ ] Sign up as a new test customer → signup bonus lands
2. [ ] Place a $100 test order at 1 pt/$1 → 100 points appear
3. [ ] Open panel → see balance → redeem the cheapest reward
4. [ ] Code applies at checkout / discount link works
5. [ ] Cancel the order → points reverse correctly
6. [ ] Share the referral link → friend signs up + buys → both rewarded after holdback
7. [ ] Cashback at configured % → store credit visible in Shopify account
