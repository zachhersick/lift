// Vercel serverless entry for Lift. Every /api/* and /.well-known/* request
// is rewritten here (see vercel.json).
import { appConfig, createApp } from "../server/app.js";
import { MemoryStore, NeonStore } from "../server/store.js";

// Records from before accounts belong to the first admin.
const legacyOwner = appConfig().admins[0] || "";
const store = process.env.DATABASE_URL ? new NeonStore(process.env.DATABASE_URL, { legacyOwner }) : new MemoryStore();
const app = createApp({ store });

export default function handler(req, res) {
  return app.handle(req, res);
}
