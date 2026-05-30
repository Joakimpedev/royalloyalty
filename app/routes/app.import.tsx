// Royal Loyalty — CSV migration import UI (Phase 3 #5).
//
// First-class "import from another loyalty app" surface. Flow stages:
//   upload → map columns → preview/dry-run → commit.
// All ledger writes go through recordPointTransaction(type=IMPORT) in
// migration.server — imported historical orders NEVER retro-trigger the
// orders/create award path. Empty state with all 3 elements (title, distinct
// subtitle, primary CTA) shown before any file is chosen.

import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { AppLink } from "../lib/app-navigate";
import { PageTitle } from "../lib/polaris-bindings";
import {
  buildPreview,
  commitImport,
  parseCsv,
  suggestMapping,
  type ColumnMapping,
  type ImportColumn,
} from "../lib/migration.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await prisma.shop.upsert({
    where: { shopDomain: session.shop },
    update: {},
    create: { shopDomain: session.shop },
  });
  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await prisma.shop.findUnique({
    where: { shopDomain: session.shop },
    select: { id: true },
  });
  if (!shop) return { ok: false, error: "Shop not found" };

  const form = await request.formData();
  const intent = form.get("intent");
  const csvText = String(form.get("csv") ?? "");
  if (!csvText.trim()) return { ok: false, error: "No CSV content provided" };

  const parsed = parseCsv(csvText);
  if (parsed.headers.length === 0) {
    return { ok: false, error: "CSV has no header row" };
  }

  if (intent === "analyze") {
    return {
      ok: true,
      stage: "map" as const,
      headers: parsed.headers,
      mapping: suggestMapping(parsed.headers),
      rowCount: parsed.rows.length,
    };
  }

  const mapping: ColumnMapping = JSON.parse(
    String(form.get("mapping") ?? "{}"),
  );

  if (intent === "preview") {
    const preview = await buildPreview(shop.id, parsed, mapping);
    return { ok: true, stage: "preview" as const, preview };
  }

  if (intent === "commit") {
    const result = await commitImport(shop.id, parsed, mapping);
    return { ok: true, stage: "done" as const, result };
  }

  return { ok: false, error: "Unknown intent" };
};

const COLUMN_OPTIONS: (ImportColumn | "ignore")[] = [
  "email",
  "name",
  "shopifyCustomerId",
  "points",
  "ignore",
];

export default function ImportPage() {
  const fetcher = useFetcher<typeof action>();
  const [csv, setCsv] = useState("");
  const [mapping, setMapping] = useState<ColumnMapping>({});

  const data = fetcher.data;
  const stage = data?.ok ? data.stage : "upload";
  const busy = fetcher.state !== "idle";

  // Seed mapping from server suggestion when entering the map stage.
  if (data?.ok && data.stage === "map" && Object.keys(mapping).length === 0) {
    setMapping(data.mapping);
  }

  const submit = (intent: string, extra: Record<string, string> = {}) =>
    fetcher.submit(
      { intent, csv, mapping: JSON.stringify(mapping), ...extra },
      { method: "POST" },
    );

  return (
    <s-page>
      <PageTitle
        title="Import members & balances"
        subtitle="Bring existing customers and their point balances over from another loyalty app"
        backHref="/app/billing"
      />
      {data?.ok === false && (
        <s-banner tone="critical">
          <s-paragraph>{data.error}</s-paragraph>
        </s-banner>
      )}

      {/* Empty / upload state — 3 required elements */}
      {stage === "upload" && (
        <s-section heading="Bring your members with you">
          <s-paragraph>
            Switching from another loyalty app? Import your existing members and
            their point balances so no customer loses progress. Imported
            balances are written directly to the ledger — historical orders are
            never re-awarded.
          </s-paragraph>
          <s-text-area
            label="Paste CSV (members + point balances)"
            value={csv}
            onInput={(e: any) => setCsv(e.target.value)}
          />
          <s-button
            onClick={() => submit("analyze")}
            {...(busy ? { loading: true } : {})}
            {...(csv.trim() ? {} : { disabled: true })}
          >
            Analyze CSV
          </s-button>
        </s-section>
      )}

      {/* Column mapping */}
      {stage === "map" && data?.ok && data.stage === "map" && (
        <s-section heading="Map your columns">
          <s-paragraph>
            We detected {data.rowCount} data rows. Confirm how each column maps.
            A row needs at least an email or a customer ID, plus a points
            balance.
          </s-paragraph>
          <s-stack direction="block" gap="base">
            {data.headers.map((h) => (
              <s-stack key={h} direction="inline" gap="base">
                <s-text>{h}</s-text>
                <s-select
                  label="Maps to"
                  value={mapping[h] ?? "ignore"}
                  onChange={(e: any) =>
                    setMapping((m) => ({ ...m, [h]: e.target.value }))
                  }
                >
                  {COLUMN_OPTIONS.map((o) => (
                    <s-option key={o} value={o}>
                      {o}
                    </s-option>
                  ))}
                </s-select>
              </s-stack>
            ))}
          </s-stack>
          <s-button
            onClick={() => submit("preview")}
            {...(busy ? { loading: true } : {})}
          >
            Preview import (dry run)
          </s-button>
        </s-section>
      )}

      {/* Dry-run preview */}
      {stage === "preview" && data?.ok && data.stage === "preview" && (
        <s-section heading="Dry-run preview — nothing has been written yet">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              {data.preview.validRows} valid rows · {data.preview.skippedRows}{" "}
              skipped · {data.preview.totalPoints} total points ·{" "}
              {data.preview.newMembers} new members ·{" "}
              {data.preview.existingMembers} matched to existing members.
            </s-paragraph>
            <s-box
              padding="base"
              borderWidth="base"
              borderRadius="base"
              background="subdued"
            >
              <table style={{ width: "100%", fontSize: "0.85rem" }}>
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Email</th>
                    <th>Name</th>
                    <th>Customer ID</th>
                    <th>Points</th>
                    <th>Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {data.preview.sample.map((r) => (
                    <tr key={r.rowNumber}>
                      <td>{r.rowNumber}</td>
                      <td>{r.email ?? "—"}</td>
                      <td>{r.name ?? "—"}</td>
                      <td>{r.shopifyCustomerId ?? "—"}</td>
                      <td>{r.points}</td>
                      <td>
                        {r.errors.length ? r.errors.join("; ") : "ok"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </s-box>
            {data.preview.skippedRows > 0 && (
              <s-banner tone="warning">
                <s-paragraph>
                  {data.preview.skippedRows} rows have issues and will be
                  skipped. Fix the source CSV and re-analyze if you need them.
                </s-paragraph>
              </s-banner>
            )}
            <s-button
              onClick={() => submit("commit")}
              {...(busy ? { loading: true } : {})}
              {...(data.preview.validRows > 0 ? {} : { disabled: true })}
            >
              Commit import ({data.preview.validRows} rows)
            </s-button>
          </s-stack>
        </s-section>
      )}

      {/* Done */}
      {stage === "done" && data?.ok && data.stage === "done" && (
        <s-section heading="Import complete">
          <s-banner tone="success">
            <s-paragraph>
              {data.result.membersCreated} members created,{" "}
              {data.result.membersMatched} matched,{" "}
              {data.result.ledgerRowsWritten} balance entries written (
              {data.result.pointsImported} points). {data.result.skipped} rows
              skipped. No historical orders were re-awarded.
            </s-paragraph>
          </s-banner>
          <AppLink href="/app/onboarding">Continue setup</AppLink>
        </s-section>
      )}
    </s-page>
  );
}
