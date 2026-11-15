// Checks that every file or folder AGENTS.md names in backticks exists, so the
// map doesn't drift from the code. In a table row, a bare file name after a
// path is relative to the folder of the path before it ("`server/app.js`,
// `auth.js`"), or to the repository root.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const doc = "AGENTS.md";
const IGNORE = new Set(["zachhersick/lift"]);
const missing = [];
const looksLikePath = (token) => /^[\w.@-]+(\/[\w.@-]*)+$/.test(token) && !token.startsWith("@/");
const looksLikeFile = (token) => /^[\w.-]+\.(js|mjs|ts|tsx|json|md|css|html)$/.test(token);
const exists = (path) => existsSync(join(root, path));

for (const [index, line] of readFileSync(join(root, doc), "utf8").split(/\r?\n/).entries()) {
  const where = `${doc}:${index + 1}`;
  let base = null;
  for (const [, token] of line.matchAll(/`([^`]+)`/g)) {
    if (IGNORE.has(token)) continue;
    if (looksLikePath(token)) {
      if (!exists(token)) missing.push(`${where} ${token}`);
      if (line.startsWith("|")) base = token.endsWith("/") ? token : dirname(token);
    } else if (line.startsWith("|") && base !== null && looksLikeFile(token)) {
      if (!exists(join(base, token)) && !exists(token)) missing.push(`${where} ${base}/${token}`);
    }
  }
}

if (missing.length) {
  console.error(`Paths in ${doc} that don't exist:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}
console.log(`${doc}: every path it names exists.`);
