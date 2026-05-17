// Royal Loyalty — CSV migration import
// (ROYAL-LOYALTY-DEVELOPMENT.md Phase 3 #5 / COMPETITOR-ONBOARDING-RESEARCH §4.4).
//
// First-class "import from another loyalty app" path: CSV of members + point
// balances. Flow: parse → column mapping → preview → dry-run → commit.
//
// CRITICAL competitor-bug guard: imported balances are written DIRECTLY to the
// append-only ledger via recordPointTransaction(type=IMPORT). We NEVER replay
// historical orders through the orders/create award path — imported historical
// orders must not retroactively trigger point awards (documented competitor
// bug that blocked a merchant). This module never touches the orders webhook
// path; it only inserts IMPORT ledger rows.

import prisma from "../db.server";
import { recordPointTransaction } from "./points.server";

export type ImportColumn = "email" | "name" | "shopifyCustomerId" | "points";

export interface ColumnMapping {
  // header name in the uploaded CSV  ->  canonical field
  [csvHeader: string]: ImportColumn | "ignore";
}

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export interface MappedRow {
  rowNumber: number;
  email: string | null;
  name: string | null;
  shopifyCustomerId: string | null;
  points: number;
  errors: string[];
}

export interface ImportPreview {
  totalRows: number;
  validRows: number;
  skippedRows: number;
  totalPoints: number;
  newMembers: number;
  existingMembers: number;
  sample: MappedRow[]; // first 20 mapped rows for the preview table
}

export interface CommitResult {
  membersCreated: number;
  membersMatched: number;
  ledgerRowsWritten: number;
  pointsImported: number;
  skipped: number;
}

// ---------------------------------------------------------------------------
// 1. CSV parsing (RFC-4180-ish: quoted fields, escaped quotes, CRLF)
// ---------------------------------------------------------------------------

export function parseCsv(text: string): ParsedCsv {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  // Strip BOM.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((v) => v.trim() !== "") || rows.length === 0) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  // trailing field/row (no final newline)
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((v) => v.trim() !== "")) rows.push(row);
  }

  if (rows.length === 0) return { headers: [], rows: [] };
  const headers = rows[0].map((h) => h.trim());
  return { headers, rows: rows.slice(1) };
}

/** Best-effort automatic mapping from common competitor export header names. */
export function suggestMapping(headers: string[]): ColumnMapping {
  const map: ColumnMapping = {};
  for (const h of headers) {
    const k = h.trim().toLowerCase();
    if (/(^|[^a-z])e-?mail([^a-z]|$)/.test(k)) map[h] = "email";
    else if (k.includes("customer") && (k.includes("id") || k.includes("gid")))
      map[h] = "shopifyCustomerId";
    else if (k === "name" || k.includes("full name") || k.includes("customer name"))
      map[h] = "name";
    else if (
      k.includes("point") ||
      k.includes("balance") ||
      k.includes("reward point")
    )
      map[h] = "points";
    else map[h] = "ignore";
  }
  return map;
}

// ---------------------------------------------------------------------------
// 2. Apply mapping → validated rows
// ---------------------------------------------------------------------------

function mapRows(parsed: ParsedCsv, mapping: ColumnMapping): MappedRow[] {
  const idx: Partial<Record<ImportColumn, number>> = {};
  parsed.headers.forEach((h, i) => {
    const target = mapping[h];
    if (target && target !== "ignore" && idx[target] === undefined) {
      idx[target] = i;
    }
  });

  return parsed.rows.map((cols, r) => {
    const get = (f: ImportColumn) =>
      idx[f] !== undefined ? (cols[idx[f]!] ?? "").trim() : "";
    const email = get("email") || null;
    const name = get("name") || null;
    const shopifyCustomerId = get("shopifyCustomerId") || null;
    const rawPoints = get("points");

    const errors: string[] = [];
    const points = Math.round(Number(rawPoints || "0"));
    if (rawPoints !== "" && !Number.isFinite(Number(rawPoints))) {
      errors.push(`Points value "${rawPoints}" is not a number`);
    }
    if (points < 0) errors.push("Negative point balance");
    if (!email && !shopifyCustomerId) {
      errors.push("Row has neither an email nor a customer ID — cannot match");
    }

    return {
      rowNumber: r + 2, // +1 for header, +1 for 1-based
      email,
      name,
      shopifyCustomerId,
      points: Number.isFinite(points) ? Math.max(0, points) : 0,
      errors,
    };
  });
}

// ---------------------------------------------------------------------------
// 3. Preview / dry-run (no writes)
// ---------------------------------------------------------------------------

export async function buildPreview(
  shopId: string,
  parsed: ParsedCsv,
  mapping: ColumnMapping,
): Promise<ImportPreview> {
  const mapped = mapRows(parsed, mapping);
  const valid = mapped.filter((m) => m.errors.length === 0);

  // Determine which valid rows already have a Member (match priority:
  // shopifyCustomerId, then email).
  const customerIds = valid
    .map((m) => m.shopifyCustomerId)
    .filter((v): v is string => !!v);
  const emails = valid
    .map((m) => m.email?.toLowerCase())
    .filter((v): v is string => !!v);

  const existing = await prisma.member.findMany({
    where: {
      shopId,
      OR: [
        customerIds.length ? { shopifyCustomerId: { in: customerIds } } : undefined,
        emails.length ? { email: { in: emails, mode: "insensitive" } } : undefined,
      ].filter(Boolean) as object[],
    },
    select: { shopifyCustomerId: true, email: true },
  });
  const existCustomerSet = new Set(existing.map((e) => e.shopifyCustomerId));
  const existEmailSet = new Set(
    existing.map((e) => e.email?.toLowerCase()).filter(Boolean) as string[],
  );

  let existingMembers = 0;
  for (const m of valid) {
    const hit =
      (m.shopifyCustomerId && existCustomerSet.has(m.shopifyCustomerId)) ||
      (m.email && existEmailSet.has(m.email.toLowerCase()));
    if (hit) existingMembers++;
  }

  return {
    totalRows: mapped.length,
    validRows: valid.length,
    skippedRows: mapped.length - valid.length,
    totalPoints: valid.reduce((s, m) => s + m.points, 0),
    newMembers: valid.length - existingMembers,
    existingMembers,
    sample: mapped.slice(0, 20),
  };
}

// ---------------------------------------------------------------------------
// 4. Commit — writes Member rows + IMPORT ledger entries ONLY
// ---------------------------------------------------------------------------

/**
 * Commit the import. For each valid row:
 *  - match an existing Member (by shopifyCustomerId then email) or create one
 *  - write a single PointTransaction(type=IMPORT) carrying the historical
 *    balance via recordPointTransaction — the only ledger writer.
 *
 * It NEVER calls the orders/create award path: imported historical orders do
 * not retro-trigger awards (the documented competitor bug). Rows with a 0
 * balance still create/match the member but skip the ledger write.
 */
export async function commitImport(
  shopId: string,
  parsed: ParsedCsv,
  mapping: ColumnMapping,
): Promise<CommitResult> {
  const mapped = mapRows(parsed, mapping);
  const valid = mapped.filter((m) => m.errors.length === 0);

  let membersCreated = 0;
  let membersMatched = 0;
  let ledgerRowsWritten = 0;
  let pointsImported = 0;

  for (const row of valid) {
    // Resolve / create the member. A synthetic customer id is used when the
    // export only provided an email (real Shopify id linked later on first
    // order); the unique key is [shopId, shopifyCustomerId].
    const customerId =
      row.shopifyCustomerId ??
      `import:${(row.email ?? "").toLowerCase()}`;

    let member = await prisma.member.findFirst({
      where: {
        shopId,
        OR: [
          { shopifyCustomerId: customerId },
          row.email
            ? { email: { equals: row.email, mode: "insensitive" } }
            : undefined,
        ].filter(Boolean) as object[],
      },
    });

    if (member) {
      membersMatched++;
      // Keep an email/name we didn't have before (do not overwrite existing).
      if ((!member.email && row.email) || (!member.name && row.name)) {
        member = await prisma.member.update({
          where: { id: member.id },
          data: {
            email: member.email ?? row.email,
            name: member.name ?? row.name,
          },
        });
      }
    } else {
      member = await prisma.member.create({
        data: {
          shopId,
          shopifyCustomerId: customerId,
          email: row.email,
          name: row.name,
        },
      });
      membersCreated++;
    }

    if (row.points > 0) {
      await recordPointTransaction({
        shopId,
        memberId: member.id,
        type: "IMPORT",
        points: row.points,
        reason: "Migrated balance from prior loyalty program (CSV import)",
      });
      ledgerRowsWritten++;
      pointsImported += row.points;
    }
  }

  return {
    membersCreated,
    membersMatched,
    ledgerRowsWritten,
    pointsImported,
    skipped: mapped.length - valid.length,
  };
}
