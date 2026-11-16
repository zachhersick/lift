// Fails if a tracked file holds something that must never be public: API
// keys, tokens, private keys, database URLs, or personal data (emails other
// than test and support addresses, phone numbers, local user paths).
// `--history` also checks every past version of every file, so it catches
// secrets that were committed and later deleted. File paths given as
// arguments are checked instead of the repository. Findings print a
// redacted hint, never the value. `.env` files are skipped unopened.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const git = (...args) => execFileSync("git", args, { cwd: root, maxBuffer: 256 * 1024 * 1024 });

const SKIP = [/(^|\/)\.env/, /(^|\/)package-lock\.json$/];
// Placeholders and test values that look like secrets.
const PLACEHOLDER = /test|example|local|dummy|fake|wrong|placeholder|not-for-production|changeme|<[^>]+>|\.\.\./i;
const ALLOWED_EMAIL = [
  /@(?:[\w-]+\.)*example(?:\.com)?$/i,
  /@lift\.test$/i,
  /@privaterelay\.appleid\.com$/i,
  /@users\.noreply\.github\.com$/i,
  /^noreply@anthropic\.com$/i,
  // The public support contact on the legal pages (see AGENTS.md).
  /^zachhersick31@gmail\.com$/i
];

const RULES = [
  ["Stripe key", /\b(?:sk|rk)_live_[0-9A-Za-z]{10,}/g],
  ["Stripe test key or webhook secret", /\b(?:sk_test_|whsec_)[0-9A-Za-z]{10,}/g],
  ["Anthropic key", /sk-ant-[0-9A-Za-z_-]{10,}/g],
  ["OpenAI key", /\bsk-(?:proj-)?[A-Za-z0-9]{20,}/g],
  ["GitHub token", /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g],
  ["AWS key", /\bAKIA[0-9A-Z]{16}\b/g],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{30,}/g],
  ["Google client secret", /\bGOCSPX-[0-9A-Za-z_-]{10,}/g],
  ["Private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----\s+[A-Za-z0-9+/=]{40,}/g],
  ["Database URL with a password", /postgres(?:ql)?:\/\/[^\s"'`:@/]+:[^\s"'`@]+@[^\s"'`]+/g],
  ["Neon password", /\bnpg_[A-Za-z0-9]{8,}/g],
  ["Slack token", /\bxox[abposr]-[A-Za-z0-9-]{10,}/g],
  ["JWT", /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
  ["Secret-looking value", /(?:secret|password|passwd|api_?key|access_?key|private_?key|auth_?token)\s*[:=]\s*["'`]([^"'`\s]{12,})["'`]/gi, (match) => !PLACEHOLDER.test(match[1])],
  ["Email address", /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, (match) => !/\.(png|jpe?g|svg|webp|gif)$/i.test(match[0]) && !ALLOWED_EMAIL.some((rule) => rule.test(match[0]))],
  ["Phone number", /(?<![\w.])\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}(?![\w.])/g],
  ["Local user path", /[A-Za-z]:\\+Users\\+[A-Za-z][\w.-]*|\/(?:Users|home)\/[a-z][\w.-]*\//g, (match) => !/\/(?:Users|home)\/(?:runner|me|you|name|user|username)\//i.test(match[0])]
];

const redact = (value) => (value.length <= 8 ? `${value[0]}…` : `${value.slice(0, 4)}…(${value.length} chars)`);

function scan(text, where, findings) {
  for (const [name, pattern, keep = () => true] of RULES) {
    for (const match of text.matchAll(pattern)) {
      if (keep(match)) findings.push(`${where}: ${name}: ${redact(match[0])}`);
    }
  }
}

const skipped = (path) => SKIP.some((rule) => rule.test(path.replace(/\\/g, "/")));
const isText = (buffer) => !buffer.subarray(0, 8000).includes(0);

const findings = [];
const args = process.argv.slice(2);
const files = args.filter((arg) => !arg.startsWith("--"));
if (files.length) {
  for (const path of files) {
    const buffer = readFileSync(path);
    if (!skipped(path) && isText(buffer)) scan(buffer.toString("utf8"), path, findings);
  }
} else if (args.includes("--history")) {
  // Every version of every file on every branch, each blob once.
  const blobs = new Map();
  for (const line of git("rev-list", "--all", "--objects").toString("utf8").split("\n")) {
    const space = line.indexOf(" ");
    if (space > 0 && !blobs.has(line.slice(0, space))) blobs.set(line.slice(0, space), line.slice(space + 1));
  }
  for (const [id, path] of blobs) {
    if (!path || skipped(path) || git("cat-file", "-t", id).toString().trim() !== "blob") continue;
    const buffer = git("cat-file", "blob", id);
    if (isText(buffer)) scan(buffer.toString("utf8"), `${path} (${id.slice(0, 8)})`, findings);
  }
} else {
  for (const path of git("ls-files", "-z").toString("utf8").split("\0").filter(Boolean)) {
    if (skipped(path)) continue;
    const buffer = readFileSync(join(root, path));
    if (isText(buffer)) scan(buffer.toString("utf8"), path, findings);
  }
}

const unique = [...new Set(findings)];
if (unique.length) {
  console.error(`check-secrets: ${unique.length} finding(s). Remove them, or extend the allowlist in scripts/check-secrets.mjs only for test or public values:`);
  for (const finding of unique) console.error(`  ${finding}`);
  process.exit(1);
}
console.log(`check-secrets: clean${args.includes("--history") ? " (all history)" : ""}.`);
