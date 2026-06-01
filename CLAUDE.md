# Royal Loyalty — agent instructions

## Customer-facing copy MUST go through localization

Any string a customer can see on the storefront — launcher widget, loyalty
page block, customer-account block, cart card, product card, status
messages, error toasts, activity feed labels, tier names, button labels,
etc. — MUST be routed through the localization catalog. NEVER hardcode an
English literal in storefront code.

### Workflow when adding a new customer-facing string

1. Add a key to `app/lib/localization-keys.ts` with `{key, section, label, defaultEn}`.
2. Add the matching English default to the `en` bundle in `app/lib/localization-defaults.ts`.
3. In the storefront code (extensions/loyalty-widget/blocks/*.liquid, assets/loyalty.js), call `R.t("your.key", "English fallback")` or use `data-loc-key="your.key"` on a Liquid element.
4. **Translate the new key for every non-en locale.** This is the step that gets forgotten and produces English fallback for non-English customers.

### Translating a new key for every locale

Run the coverage check first to see exactly what's missing:

```
node scripts/check-locale-coverage.mjs
```

It exits non-zero when any non-en locale is missing a key or has a value
byte-identical to the en value. The output names every gap by locale +
key.

For the actual translation, run the per-locale audit workflow:

```
Workflow({ name: 'audit-locale-coverage' })
```

(or look at `.claude/projects/.../workflows/scripts/` for the script
template, run it via the Workflow tool). It spawns one subagent per locale
that reads its bundle, finds gaps vs en, and returns suggested translations.
Then run `node scripts/apply-locale-fixes.mjs <workflow-output.json>` to merge
the results into `app/lib/localization-defaults.ts`.

Finally re-run the coverage check until it reports `Coverage: clean.`

### What "customer-facing" means concretely

If a string is rendered into any of these files, it's customer-facing:

- `extensions/loyalty-widget/blocks/launcher.liquid`
- `extensions/loyalty-widget/blocks/loyalty-page.liquid`
- `extensions/loyalty-widget/blocks/customer-account.liquid`
- `extensions/loyalty-widget/assets/loyalty.js`
- Any payload field returned from `app/lib/storefront-payload.server.ts` that the storefront prints directly
- Any string the admin onboarding wizard persists into `aiConfigSnapshot.localization.overrides` or `aiConfigSnapshot.branding.*`

Strings inside `app/routes/app.*` admin pages are merchant-facing, not
customer-facing, and don't need localization (the admin is English-only by
design).

### One source of truth for shared copy

The Branding admin page (`/app/branding`) and Localization admin page
(`/app/localization`) both edit the same eight "shared" fields (panel title,
panel subtitle, launcher button label, hero title, hero subtitle, product
heading, product subtext, cart heading). The shared store is
`aiConfigSnapshot.localization.overrides`. Don't reintroduce parallel
storage for these fields. The mapping lives in `COPY_FIELD_MAP` in
`app/routes/app.branding.tsx`.

If you add a new copy field that should appear on both pages, add it to
`COPY_FIELD_MAP` and to the localization catalog as a new key.

### No paid-plan feature gating

Royal's pricing is volume-only — every feature is available on every plan
including FREE. Don't add `if (shop.plan !== "FREE")` checks for feature
access. Volume caps in `app/lib/quota.server.ts` are separate from feature
access and are fine.

## Iframe auth

Never use `target="_top"` or `window.top.location` in admin routes. Use
`shopify:admin/...` URLs with plain anchors. App actions should return
data (not redirect responses) and let the client navigate via
`useAppNavigate`. Server-side redirects from actions strip the session
token and log the merchant out.
