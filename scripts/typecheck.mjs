// Type-checks the app with the TypeScript compiler (`tsc --noEmit`). The UI
// predates strict checking and still has known errors, so this is a ratchet:
// it fails when a file has more errors than its count below. When you fix
// some, lower the count (run with --update to rewrite it), so it only goes down.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const BASELINE = {
  "src/components/badges.tsx": 2,
  "src/components/islands.tsx": 6,
  "src/components/keypad.tsx": 2,
  "src/pages/bodyweight.tsx": 1,
  "src/pages/coach.tsx": 2,
  "src/pages/friend.tsx": 1,
  "src/pages/history.tsx": 6,
  "src/pages/nutrition.tsx": 10,
  "src/pages/progress.tsx": 23,
  "src/pages/settings.tsx": 2,
  "src/pages/today.tsx": 6,
  "src/pages/workout.tsx": 14
};

const tsc = fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url));
let output = "";
try {
  output = execFileSync(process.execPath, [tsc, "--noEmit", "-p", "."], { encoding: "utf8" });
} catch (error) {
  output = String(error.stdout || "") + String(error.stderr || "");
}
const errors = output.split(/\r?\n/).filter((line) => /: error TS\d+/.test(line));
const counts = {};
for (const line of errors) {
  const file = line.slice(0, line.indexOf("(")).replace(/\\/g, "/");
  counts[file] = (counts[file] || 0) + 1;
}

if (process.argv.includes("--update")) {
  const self = fileURLToPath(import.meta.url);
  const sorted = Object.keys(counts).sort().map((file) => `  "${file}": ${counts[file]}`).join(",\n");
  writeFileSync(self, readFileSync(self, "utf8").replace(/const BASELINE = \{[\s\S]*?\n\};/, `const BASELINE = {\n${sorted}\n};`));
  console.log(`Baseline updated: ${errors.length} known errors.`);
  process.exit(0);
}

const worse = Object.keys(counts).filter((file) => counts[file] > (BASELINE[file] || 0));
const better = Object.keys(BASELINE).filter((file) => (counts[file] || 0) < BASELINE[file]);
for (const file of worse) {
  console.error(`${file}: ${counts[file]} type errors, up from ${BASELINE[file] || 0}`);
  for (const line of errors) if (line.replace(/\\/g, "/").startsWith(file)) console.error(`  ${line}`);
}
if (better.length) console.log(`Fewer errors than the baseline in ${better.join(", ")}; run "npm run typecheck -- --update" to lock that in.`);
if (worse.length) process.exit(1);
console.log(`Typecheck: ${errors.length} known errors, none new.`);
