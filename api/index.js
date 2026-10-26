// Vercel serverless entry for lift.zachhersick.com. Every /api/* and
// /.well-known/* request is rewritten here (see vercel.json).
import { createApp } from "../server/app.js";
import { MemoryStore, NeonStore } from "../server/store.js";

const store = process.env.DATABASE_URL ? new NeonStore(process.env.DATABASE_URL) : new MemoryStore();
const app = createApp({ store });

export default function handler(req, res) {
  return app.handle(req, res);
}
