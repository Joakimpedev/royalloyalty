# Navigation Audit — every interactive element in the app

**Status:** complete as of commit covering Phases 1–8 + iframe-auth full sweep.

This is the authoritative list of every user-triggered navigation/action in
Royal Loyalty's admin UI. The rule: any clickable element that changes the
displayed URL — directly or via a server response — MUST go through
`useAppNavigate()` or `<AppLink>` from `app/lib/app-navigate.tsx`. Server-side
`redirect()` from form actions is BANNED (it breaks iframe auth — the
follow-up request can land without the session token).

## ✅ Safe patterns (already verified)

### Nav rail — `<s-app-nav>` in `app/routes/app.tsx`
- 6 `<s-link href="/app/...">` items: Home / Program / Members / Branding /
  Analytics / Billing.
- Special-cased by Shopify App Bridge; these are the ONLY `<s-link href=>`
  allowed outside `<AppLink>`.

### Primary-action buttons (`<s-button slot="primary-action">`)
All 11 use `onClick={() => appNav(url)}`:
- `app._index.tsx:130` View analytics
- `app.analytics.tsx:43,72` Set up earn rules / Back to Home
- `app.members.tsx:177` Back to Home
- `app.referrals.tsx:186` Back to Home
- `app.rewards.tsx:200` Back to Home
- `app.billing.tsx` Back to Home
- `app.storecredit.tsx:143` Back to Home
- `app.support.tsx:107` Back to Home
- `app.tiers.tsx:181` Back to Home
- `app.program.tsx:112` Continue to Branding / Back to Home (chain-aware)
- `app.program.earn.$action.tsx:209` Back to Program
- `app.branding.tsx:214` Finish setup / Back to Home (chain-aware)

### Body buttons that navigate
All use `<s-button onClick={() => appNav(url)}>`:
- `app._index.tsx` WelcomeCard Open-theme-editor + Dismiss
- `app._index.tsx` StatusTile audit-card buttons (3 tiles)
- `app._index.tsx` setup-guide active-step button
- `app._index.tsx` empty-state "Set up earn rules"
- `app.analytics.tsx` empty-state "Configure your program"
- `app.members.tsx` empty-state "Configure earn rules"
- `app.referrals.tsx` empty-state "Customize the referral widget"
- `app.support.tsx` "Open documentation" (external https; useAppNavigate opens
  in a new tab via `window.open`)

### List/grid items as clickable cards
- `app.program.tsx` ProgramCatalog tiles: `<button onClick={appNav}>` (not
  `<a href>` — anchor clicks bypass React Router and full-reload the iframe).
- `app.program.tsx` earn-rules list rows: same pattern.

### Body text links (use `<AppLink href=>`)
- `app.import.tsx` "Continue setup"
- `app.onboarding.tsx` "Import from a CSV"
- `app.onboarding.tsx` post-activation checklist items
- `app.suggestions.tsx` "View program analytics"
- `app._index.tsx` collapsed checklist items
- `app.billing.tsx` FAQ "Contact support"

### Form-submit buttons (no navigation — action returns data, not redirect)
All trigger `submit(fd, { method: "POST" })` / `fetcher.submit(...)`. The
action handler returns `{ ok, message }` or similar; the page stays put with
updated `actionData`. Verified safe:
- Save / Discard / Create / Update / Cancel-edit buttons on every form page
  (branding, tiers, rewards, referrals, storecredit, program, program.earn,
  settings, support, suggestions, import).
- Edit / Delete / Toggle row actions on tiers, rewards, referrals.
- Approve / Reject row actions on referrals manual-review queue.
- Reconciliation button on store credit.
- Suggestions Accept / Dismiss.
- Onboarding checklist Dismiss.
- Program "Activate program" button.

### URL search-param updates via `setSearchParams`
- `app.members.tsx` View member / Back to members — `params.set("member", id)`
  / `params.delete("member")` then `setParams(params)`. This routes through
  React Router's history API client-side; the loader is re-fetched via App
  Bridge's wrapped fetch. Verified safe.

### Action handlers that return `{ ok, redirectTo }` (NOT a Response redirect)
- `app.billing.tsx` subscribe / managed_pricing — useEffect picks up
  `redirectTo` and routes via App Bridge `shopify.open()` for `shopify:` URLs
  or `redirect.dispatch({ type: "REMOTE" })` for the appSubscriptionCreate
  confirmation URL.
- `app.program.earn.$action.tsx` save earn rule — useEffect picks up
  `redirectTo` and routes via `appNav()`.
- `app.onboarding.tsx` activate — same pattern as the earn-rule editor.

### Forms — `<Form>` from `react-router`
- `app.support.tsx` contact form — framework-level POST, returns `{ ok }`.
- `auth.login/route.tsx` — outside the embedded app; standard auth flow.
- `_index/route.tsx` — root route; pre-embed.

### Non-navigation patterns (safe by construction)
- `<s-text-field onChange=>`, `<s-checkbox onChange=>`, `<s-select onChange=>`
  — local state updates only.
- `<button onClick={() => setForm(...)}>` — local React state.
- `useBlocker(...)` Leave/Stay buttons in the unsaved-changes banner —
  `blocker.proceed()` / `blocker.reset()` are React Router APIs, no full nav.
- `mailto:` anchors in `app/routes/privacy.tsx` — browser handles, no iframe
  impact.
- `target="_blank"` is acceptable ONLY for genuinely external https:// URLs
  that should open a new tab. `target="_top"` is BANNED everywhere.

## ❌ Patterns that are banned (will be caught in code review)

Any of these is a regression and must be fixed:

1. `<s-button href="/app/...">` or `<s-button href="shopify:...">` — even
   without `target="_top"`, the button does a full-iframe reload on click and
   the new request can land without a session token.
2. `<s-link href=>` outside the nav rail in `app.tsx` — same issue.
3. `<a href="/app/...">` for navigation — anchor clicks bypass React Router.
   Use `<AppLink>` or `<button onClick={appNav}>`.
4. `return redirect("/app/...")` from a form action handler — server-side
   redirects can drop the session token. Return `{ ok: true, redirectTo: ... }`
   and navigate client-side via `appNav` in a useEffect.
5. `window.top.location.href = url`, `window.location.href = url`,
   `target="_top"` on any element — these force-reload the iframe parent
   frame and destroy the embedded session.
6. Raw `<form action=...>` (not the React Router `<Form>`) — would do a
   full-page POST.

## How to extend the app without breaking auth

When adding a new page or button:
1. Import: `import { useAppNavigate, AppLink } from "../lib/app-navigate";`.
2. For programmatic navigation in onClick: `const appNav = useAppNavigate();`
   then `<s-button onClick={() => appNav("/app/whatever")}>`.
3. For text links in body content: `<AppLink href="/app/...">Label</AppLink>`.
4. For form-submit buttons that should NOT navigate, just `submit(fd, {
   method: "POST" })` is fine — the action handler returns data, the page
   updates in place.
5. For form-submit buttons that SHOULD navigate after success: have the
   action return `{ ok: true, redirectTo: "/app/somewhere" }`, then in the
   component `useEffect(() => { if (actionData?.redirectTo) appNav(actionData.redirectTo); }, [actionData])`.
6. Never use `return redirect(...)` in form actions.
7. Never put `href` on `<s-button>`. Never put `href` on `<s-link>` outside
   the nav rail.
