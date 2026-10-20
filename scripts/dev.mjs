// Runs Lift locally (what lift.zachhersick.com serves) with an in-memory
// database and a "Sign in" that skips GitHub. For development only.
//   npm run build:web && npm run dev   ->  http://localhost:4330
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../server/app.js";
import { MemoryStore, NeonStore } from "../server/store.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4330);
const web = join(root, "web-dist");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };

const env = {
  APP_URL: `http://localhost:${port}`,
  SESSION_SECRET: "local-development-secret-not-for-production",
  ALLOWED_GITHUB_ID: "1",
  LIFT_DEV_LOGIN: "1",
  ...process.env
};
delete env.VERCEL;
const store = env.DATABASE_URL ? new NeonStore(env.DATABASE_URL) : new MemoryStore();
const app = createApp({ store, env });
if (app.config.missing.length) console.warn("Missing config:", app.config.missing.join(", "));

createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) return app.handle(req, res);
  const path = normalize(join(web, url.pathname === "/" ? "index.html" : url.pathname));
  if (!path.startsWith(web) || !existsSync(path) || !statSync(path).isFile()) {
    res.writeHead(404);
    return res.end("Not found");
  }
  res.writeHead(200, { "content-type": types[extname(path)] || "application/octet-stream", "cache-control": "no-cache" });
  return res.end(readFileSync(path));
}).listen(port, () => console.log(`Lift (local) on http://localhost:${port} using ${env.DATABASE_URL ? "Postgres" : "memory"}`));
