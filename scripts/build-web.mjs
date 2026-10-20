// Builds the static site into web-dist/: public/ plus the vendored Preact
// files the browser imports through the import map in index.html.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "web-dist");
const VENDOR = ["preact", "htm", "@preact/signals", "@preact/signals-core"];
const SCRIPT = new Set([".js", ".mjs"]);

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, "public"), out, { recursive: true });

// Copies only the built bundles (any "dist" folder), not tests or sources.
function copyScripts(from, to, inDist = false) {
  for (const name of readdirSync(from)) {
    const source = join(from, name);
    if (name === "node_modules" || name === "src" || name === "test") continue;
    if (statSync(source).isDirectory()) copyScripts(source, join(to, name), inDist || name === "dist");
    else if (inDist && SCRIPT.has(extname(name))) {
      mkdirSync(to, { recursive: true });
      cpSync(source, join(to, name));
    }
  }
}

for (const pkg of VENDOR) {
  const source = join(root, "node_modules", pkg);
  if (!existsSync(source)) throw new Error(`Missing ${pkg}; run npm install first.`);
  copyScripts(source, join(out, "vendor", pkg));
}

// The service worker precaches every file, keyed by a hash of their contents,
// so a new deploy replaces the old cache in one step.
function list(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? list(path) : [path];
  });
}
const files = list(out).filter((path) => !path.endsWith("sw.js")).map((path) => "/" + relative(out, path).split("\\").join("/"));
const hash = createHash("sha256");
for (const file of files.sort()) hash.update(file).update(readFileSync(join(out, file)));
const sw = join(out, "sw.js");
writeFileSync(sw, readFileSync(sw, "utf8")
  .replace("__VERSION__", hash.digest("hex").slice(0, 12))
  .replace("[/*__FILES__*/]", JSON.stringify(["/", ...files.filter((file) => file !== "/index.html")])));
console.log(`Built web-dist/ (${files.length} files)`);
