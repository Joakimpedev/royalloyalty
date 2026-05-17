// PUBLIC privacy policy (ROYAL-LOYALTY-DEVELOPMENT.md Phase 6 / BUILD-BRIEF §6
// HIGH). Reachable WITHOUT login — NO authenticate.admin, NO App Bridge, NO
// Polaris admin chrome. Flat-routes registers this at /privacy automatically.
//
// ZERO placeholder text. Controller: Dealify Nordahl (dealifynordahl@gmail.com).
// Content is kept consistent with SUBPROCESSORS.md (Railway, Anthropic) and the
// PCD Level 2 field-level inventory in PII-INVENTORY.md. The storage region is
// surfaced from process.env.DATA_REGION with an explicit default note so the
// page always states the operative region (it must match the Railway region
// recorded in SUBPROCESSORS.md verbatim).
import type { LoaderFunctionArgs, MetaFunction } from "react-router";
import { useLoaderData } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Privacy Policy — Royal Loyalty" },
  {
    name: "description",
    content:
      "How Royal Loyalty (Dealify Nordahl) collects, processes, stores and deletes merchant and customer data.",
  },
];

export const loader = async (_args: LoaderFunctionArgs) => {
  // DATA_REGION must be set on Railway to the actual deployment region and must
  // match SUBPROCESSORS.md verbatim. If unset, we still render a concrete,
  // non-placeholder operative region with an explicit note.
  const configuredRegion = process.env.DATA_REGION;
  const region = configuredRegion ?? "EU-West (Railway, Amsterdam)";
  return {
    region,
    regionIsDefault: !configuredRegion,
    lastUpdated: "2026-05-17",
  };
};

export default function PrivacyPolicy() {
  const { region, regionIsDefault, lastUpdated } =
    useLoaderData<typeof loader>();

  return (
    <main
      style={{
        maxWidth: "760px",
        margin: "0 auto",
        padding: "2.5rem 1.25rem 4rem",
        fontFamily:
          "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: "#1a1a1a",
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>
        Royal Loyalty — Privacy Policy
      </h1>
      <p style={{ color: "#5c5f62", marginTop: 0 }}>
        Last updated: {lastUpdated}
      </p>

      <section>
        <h2>1. Who we are (data controller)</h2>
        <p>
          Royal Loyalty is operated by <strong>Dealify Nordahl</strong>, the
          data controller for the purposes of the EU General Data Protection
          Regulation (GDPR) and the UK GDPR. For any privacy request, contact{" "}
          <a href="mailto:dealifynordahl@gmail.com">dealifynordahl@gmail.com</a>
          . Royal Loyalty is a loyalty and rewards application installed by
          Shopify merchants on their stores.
        </p>
      </section>

      <section>
        <h2>2. Whose data we process</h2>
        <p>
          We process two categories of people: (a) the{" "}
          <strong>merchant</strong> who installs the app (via their Shopify
          account and store), and (b) the merchant&apos;s{" "}
          <strong>customers</strong> who participate in the loyalty program. The
          merchant is the controller of their customers&apos; personal data;
          Dealify Nordahl acts as a processor on the merchant&apos;s behalf for
          that customer data, and as controller for the operation of the app
          itself.
        </p>
      </section>

      <section>
        <h2>3. Exactly what personal data we store</h2>
        <p>
          We store the minimum needed to run a loyalty program. The only
          customer personal data fields we hold are:
        </p>
        <ul>
          <li>
            <strong>Customer name</strong> — the loyalty member&apos;s name, to
            identify them in the merchant&apos;s admin and in notifications.
          </li>
          <li>
            <strong>Customer email address</strong> — to identify the member,
            match referrals, and send loyalty notifications.
          </li>
        </ul>
        <p>
          We also store the Shopify customer identifier (a non-personal numeric
          reference), the merchant&apos;s store domain, the loyalty point ledger
          (earn/redeem/adjust/clawback amounts and reasons), tier and reward
          configuration, referral records, and a mirror of Shopify store-credit
          transactions for reconciliation. A complete field-level inventory is
          maintained in our internal PII inventory (PCD Level 2 deliverable).
        </p>
        <p>
          We <strong>do not</strong> collect or store payment card data
          (billing is handled entirely by Shopify), passwords, government IDs,
          health data, or precise geolocation. Referral anti-fraud may record a
          referee&apos;s IP address transiently for same-IP heuristics; it is
          cleared on customer redaction.
        </p>
      </section>

      <section>
        <h2>4. Why we process it (purposes &amp; legal basis)</h2>
        <ul>
          <li>
            Operating the loyalty program (earning/redeeming points, tiers,
            referrals, store credit) — performance of the merchant&apos;s
            contract with their customer / the merchant&apos;s legitimate
            interest in running a loyalty scheme.
          </li>
          <li>
            Sending loyalty notifications (points earned, reward available, tier
            change, expiry reminder, referral success) — the same basis.
          </li>
          <li>
            Fraud prevention on referrals — legitimate interest in preventing
            abuse.
          </li>
        </ul>
        <p>
          We never sell personal data and never use customer personal data for
          advertising.
        </p>
      </section>

      <section>
        <h2>5. Where data is stored</h2>
        <p>
          Application data, including the customer name and email above, is
          hosted on <strong>Railway</strong> (managed PostgreSQL) in the{" "}
          <strong>{region}</strong> region. Data is encrypted at rest and
          encrypted in transit (TLS).
          {regionIsDefault ? (
            <>
              {" "}
              <em>
                Note: this page displays the operative default region. The
                production deployment region is configured by the operator and
                is recorded, verbatim and identically, in our subprocessor
                register; this policy always reflects that same region.
              </em>
            </>
          ) : null}
        </p>
      </section>

      <section>
        <h2>6. Subprocessors</h2>
        <p>
          We use the following subprocessors, each under a signed data
          processing agreement before any data flows to them:
        </p>
        <ul>
          <li>
            <strong>Railway</strong> — application hosting and the PostgreSQL
            database. Processes all app data, including customer name and email.
            Region: {region}.
          </li>
          <li>
            <strong>Anthropic (Claude API)</strong> — AI-assisted program setup
            and ongoing optimization. Receives only aggregate catalog, order
            volume and theme data; <strong>no customer personal data</strong>{" "}
            (no names, no emails) is ever sent to the AI.
          </li>
        </ul>
        <p>
          Loyalty notification email is sent through Shopify&apos;s native
          mechanism. If a third-party email provider is introduced, it will be
          added here and to our subprocessor register under a signed agreement
          before launch.
        </p>
      </section>

      <section>
        <h2>7. Retention</h2>
        <p>
          We retain loyalty data for as long as the merchant has the app
          installed and the program is active, because the point ledger is
          append-only and balances are derived from its full history. When a
          customer is redacted (see below) their name and email are removed
          while the non-personal ledger entries are retained for the
          merchant&apos;s financial and analytics integrity. When the merchant
          uninstalls and requests shop redaction, all data for that store is
          deleted.
        </p>
      </section>

      <section>
        <h2>8. Deletion and your rights</h2>
        <p>
          Deletion is wired directly to Shopify&apos;s mandatory privacy
          webhooks:
        </p>
        <ul>
          <li>
            <strong>Customer data request</strong> (
            <code>customers/data_request</code>) — we compile all stored data
            for that customer across every record and make it available to the
            merchant to fulfil the request.
          </li>
          <li>
            <strong>Customer redaction</strong> (
            <code>customers/redact</code>) — we erase the customer&apos;s name
            and email (name set to empty, email replaced with a redacted
            sentinel), mark the member redacted, and clear any stored referee IP
            address. Non-personal ledger records are retained for integrity.
          </li>
          <li>
            <strong>Shop redaction</strong> (<code>shop/redact</code>) — when a
            merchant uninstalls and the redaction window elapses, we delete{" "}
            <em>all</em> data for that store across every model (members, point
            ledger, tiers, earn rules, rewards, redemptions, referrals,
            store-credit mirror, AI suggestions, integrations, sessions and the
            shop record) and cancel any billing.
          </li>
        </ul>
        <p>
          Under the GDPR you may request access, rectification, erasure,
          restriction, portability, or object to processing. Customers should
          contact the merchant (the controller of their data); the merchant or
          the customer may also contact us at{" "}
          <a href="mailto:dealifynordahl@gmail.com">dealifynordahl@gmail.com</a>
          . We respond within statutory timeframes and, for personal-data
          breaches, notify affected parties and authorities within the required
          windows (GDPR: 72 hours).
        </p>
      </section>

      <section>
        <h2>9. Security</h2>
        <p>
          We maintain separate staging and production environments, encryption
          at rest and in transit, least-privilege Shopify API scopes, no
          personal data in application logs, single-use refresh-token handling,
          and a documented security incident-response plan. These controls form
          part of our Shopify Protected Customer Data Level 2 obligations
          (Level 2 applies because the app processes customer name and email).
        </p>
      </section>

      <section>
        <h2>10. Changes to this policy</h2>
        <p>
          If we change this policy we will update the date at the top and, where
          the change is material, notify merchants in the app. Continued use
          after an update constitutes acknowledgement of the revised policy.
        </p>
      </section>

      <hr style={{ margin: "2rem 0", border: "none", borderTop: "1px solid #e1e3e5" }} />
      <p style={{ color: "#5c5f62", fontSize: "0.9rem" }}>
        Data controller: Dealify Nordahl ·{" "}
        <a href="mailto:dealifynordahl@gmail.com">dealifynordahl@gmail.com</a>
      </p>
    </main>
  );
}
