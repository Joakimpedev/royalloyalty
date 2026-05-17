# Subprocessors — Royal Loyalty

GDPR Art. 28: every subprocessor needs a signed DPA before any merchant data flows to it. Controller: **Dealify Nordahl** (dealifynordahl@gmail.com).

| Subprocessor | Purpose | Data | DPA status | Region |
|---|---|---|---|---|
| Railway | App hosting + PostgreSQL database | All app data incl. member PII (name/email), point ledger | ☐ **sign before storing data** (ACTION-REQUIRED §B) | (set in ACTION-REQUIRED §B) |
| Anthropic (Claude API) | AI program auto-setup & ongoing optimization | Aggregate catalog/volume/theme data only — **no customer PII sent** | ☐ **sign before Phase 3 goes live** (ACTION-REQUIRED §C) | per Anthropic DPA |
| (email mechanism — TBD Phase 4) | Loyalty notification emails | Member email + name | ☐ if a 3rd-party provider is used, sign DPA before launch | TBD |

Privacy policy (Phase 6) must list exactly these and match the Railway region verbatim.
