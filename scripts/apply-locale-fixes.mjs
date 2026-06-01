// One-shot script: read the audit workflow's output JSON and apply every
// locale fix (missingKeys + untranslatedKeys + qualityFixes) into
// app/lib/localization-defaults.ts.
//
// Strategy: for each locale bundle, find its declaration block and
// merge/append the new entries before the closing `};`. Existing entries
// with the same key are overwritten (since the audit's untranslated/quality
// findings supersede the prior value).

import fs from "node:fs";
import path from "node:path";

const AUDIT_OUTPUT = process.argv[2];
if (!AUDIT_OUTPUT) {
  console.error("usage: node scripts/apply-locale-fixes.mjs <audit-output.json>");
  process.exit(2);
}

const DEFAULTS_PATH = path.resolve("app/lib/localization-defaults.ts");

const raw = fs.readFileSync(AUDIT_OUTPUT, "utf8");
const audit = JSON.parse(raw);
const byLocale = audit.result?.byLocale || {};

let src = fs.readFileSync(DEFAULTS_PATH, "utf8");

// Map bundle var name → known locale code (for logging only).
const TOTAL = {
  added: 0,
  replaced: 0,
  bundlesEdited: 0,
};

// For each locale variable, find the block `const <var>: Bundle = { ... };`
// and merge entries.
for (const [bundleVar, data] of Object.entries(byLocale)) {
  const allFixes = {
    ...data.missingKeys,
    ...data.untranslatedKeys,
    ...data.qualityFixes,
  };
  const entries = Object.entries(allFixes);
  if (!entries.length) continue;

  const openRe = new RegExp(`(^const\\s+${bundleVar}\\s*:\\s*Bundle\\s*=\\s*\\{)`, "m");
  const openMatch = openRe.exec(src);
  if (!openMatch) {
    console.warn(`!! bundle '${bundleVar}' not found in ${DEFAULTS_PATH} — skipping`);
    continue;
  }
  const openIdx = openMatch.index;
  const bodyStart = openIdx + openMatch[0].length;

  // Find the closing `};` by walking brace depth.
  let depth = 1;
  let i = bodyStart;
  while (i < src.length && depth > 0) {
    const ch = src[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth === 0) break;
    i++;
  }
  if (depth !== 0) {
    console.warn(`!! couldn't find closing '}' for ${bundleVar}, skipping`);
    continue;
  }
  const closeBraceIdx = i;
  // Find the semicolon after the closing brace.
  let semiIdx = src.indexOf(";", closeBraceIdx);
  if (semiIdx === -1 || semiIdx > closeBraceIdx + 5) semiIdx = closeBraceIdx;
  const bodyEnd = closeBraceIdx;

  const body = src.slice(bodyStart, bodyEnd);

  // Build a set of keys already present in the body so we can decide
  // whether each fix is an ADD or a REPLACE. Match a line that starts
  // with optional whitespace, an open quote, the key, a close quote, and a
  // colon.
  function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  function keyPresent(body, key) {
    return new RegExp(`["']${escapeRegex(key)}["']\\s*:`).test(body);
  }
  function replaceKey(body, key, value) {
    // Replace one line:   "key": "...",  →   "key": "<value>",
    // The "value" portion may span multiple lines, so we match lazily up
    // to the comma followed by newline or the closing brace context.
    const lineRe = new RegExp(
      `(^|\\n)([ \\t]*)["']${escapeRegex(key)}["']\\s*:[\\s\\S]*?,\\s*(?=\\n|$)`,
      "m",
    );
    const m = lineRe.exec(body);
    if (!m) return null;
    const indent = m[2] || "  ";
    const newLine = `${indent}"${key}": ${JSON.stringify(value)},`;
    return body.replace(lineRe, `${m[1]}${newLine}`);
  }

  let newBody = body;
  let added = 0;
  let replaced = 0;
  const appendEntries = [];
  for (const [key, value] of entries) {
    if (keyPresent(newBody, key)) {
      const candidate = replaceKey(newBody, key, value);
      if (candidate) {
        newBody = candidate;
        replaced++;
      } else {
        // Couldn't safely find/replace via regex — append a new entry instead
        // (the duplicate key won't break TS object literals; the later one wins).
        appendEntries.push([key, value]);
        added++;
      }
    } else {
      appendEntries.push([key, value]);
      added++;
    }
  }

  if (appendEntries.length) {
    const indent = "  ";
    const block = appendEntries
      .map(([k, v]) => `${indent}"${k}": ${JSON.stringify(v)},`)
      .join("\n");
    // Find the last newline in newBody to insert before
    const tail = newBody.replace(/\s*$/, "");
    newBody = `${tail}\n${block}\n`;
  }

  src = src.slice(0, bodyStart) + newBody + src.slice(bodyEnd);
  console.log(`${bundleVar}: +${added} added, ~${replaced} replaced`);
  TOTAL.added += added;
  TOTAL.replaced += replaced;
  TOTAL.bundlesEdited++;
}

fs.writeFileSync(DEFAULTS_PATH, src, "utf8");
console.log(
  `\nDONE. ${TOTAL.bundlesEdited} bundles edited. ${TOTAL.added} entries added, ${TOTAL.replaced} replaced.`,
);
