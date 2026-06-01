// Audits app/lib/localization-defaults.ts and reports every key that is in
// the `en` bundle but EITHER missing from another locale's bundle, OR
// present with a value byte-identical to en (so customers see English
// fallback). Exits non-zero when any gap is found — wire this into CI to
// stop new keys from shipping en-only.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const DEFAULTS = path.resolve("app/lib/localization-defaults.ts");
const src = fs.readFileSync(DEFAULTS, "utf8");

// Pull every `const <name>: Bundle = { ... };` block out of the file and
// parse its body via the JS engine. Bundles can spread earlier bundles
// (`...en`) so we share a single context and resolve in source order.
const BUNDLE_RE = /^const\s+(\w+):\s*Bundle\s*=\s*(\{[\s\S]*?^\});/gm;
const bundles = {};
const ctx = vm.createContext({});
let m;
while ((m = BUNDLE_RE.exec(src)) !== null) {
  const name = m[1];
  const body = m[2];
  try {
    const obj = vm.runInContext(`(${body})`, ctx);
    ctx[name] = obj;
    bundles[name] = obj;
  } catch (e) {
    console.error(`couldn't parse bundle ${name}: ${e.message}`);
    process.exitCode = 2;
  }
}

const en = bundles.en;
if (!en) {
  console.error("en bundle not found");
  process.exit(2);
}

// Token-only / language-neutral values that don't need translation.
function isLanguageNeutral(v) {
  if (typeof v !== "string") return true;
  const t = v.trim();
  if (t === "") return true;
  // Pure tokens like "{points}" or ASCII punctuation only.
  if (/^[{}\w. ]*$/.test(t) && /\{/.test(t) && !/[a-zA-Z]{3,}/.test(t.replace(/\{[^}]*\}/g, ""))) {
    return true;
  }
  return false;
}

const LOCALES = Object.keys(bundles).filter((n) => n !== "en");

let totalMissing = 0;
let totalIdentical = 0;
const perLocale = {};
for (const name of LOCALES) {
  const b = bundles[name];
  const missing = [];
  const identical = [];
  for (const [k, enValue] of Object.entries(en)) {
    if (!(k in b)) {
      missing.push(k);
      continue;
    }
    if (b[k] === enValue && !isLanguageNeutral(enValue)) {
      identical.push(k);
    }
  }
  perLocale[name] = { missing, identical };
  totalMissing += missing.length;
  totalIdentical += identical.length;
}

console.log("Locale coverage report against en baseline:");
console.log(`  ${Object.keys(en).length} keys in en bundle`);
console.log(`  ${LOCALES.length} non-en locales checked`);
console.log("");
for (const name of LOCALES) {
  const { missing, identical } = perLocale[name];
  if (missing.length || identical.length) {
    console.log(
      `${name}: ${missing.length} missing, ${identical.length} identical to en`,
    );
    if (missing.length) {
      console.log("  missing: " + missing.join(", "));
    }
    if (identical.length) {
      console.log("  identical: " + identical.join(", "));
    }
  }
}
console.log("");
console.log(`TOTALS: ${totalMissing} missing, ${totalIdentical} identical`);
if (totalMissing + totalIdentical > 0) {
  console.log(
    "Coverage gaps detected — run the per-locale audit workflow to fill them.",
  );
  process.exitCode = 1;
} else {
  console.log("Coverage: clean.");
}
