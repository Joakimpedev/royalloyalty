// One-off: drop duplicate refer.friendGetsCredit lines per bundle.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FILE = resolve(__dirname, "..", "app", "lib", "localization-defaults.ts");

let src = readFileSync(FILE, "utf8");
const lines = src.split("\n");
const out = [];
const seenInBundle = new Set();
let inBundle = false;

for (const line of lines) {
  if (/^const [a-zA-Z]+: Bundle = \{$/.test(line)) {
    inBundle = true;
    seenInBundle.clear();
    out.push(line);
    continue;
  }
  if (inBundle && /^\};/.test(line)) {
    inBundle = false;
    out.push(line);
    continue;
  }
  if (inBundle && /^\s*"refer\.friendGetsCredit"\s*:/.test(line)) {
    if (seenInBundle.has("credit")) continue;
    seenInBundle.add("credit");
  }
  out.push(line);
}

writeFileSync(FILE, out.join("\n"));
console.log("Done.");
