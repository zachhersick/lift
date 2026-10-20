import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { cleanChanges, createApp } from "../server/app.js";
import { MemoryStore } from "../server/store.js";
import { createSession, SESSION_COOKIE } from "../server/auth.js";

const SECRET = "test-secret-that-is-at-least-32-chars-long";
const ORIGIN = "https://lift.example.com";
const env = { APP_URL: ORIGIN, SESSION_SECRET: SECRET, ALLOWED_GITHUB_ID: "42", GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "secret" };

function request(app, { method = "GET", path, body, cookie, origin = ORIGIN }) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  req.method = method;
  req.url = path;
  req.headers = { "content-type": "application/json", origin, ...(cookie ? { cookie } : {}) };
  return new Promise((resolve) => {
    const res = {
      headersSent: false,
      writeHead(status, headers) {
        this.status = status;
        this.headers = headers;
        this.headersSent = true;
      },
      end(text = "") {
        resolve({ status: this.status, headers: this.headers, body: text ? JSON.parse(text) : null });
      }
    };
    app.handle(req, res);
  });
}

const signedIn = `${SESSION_COOKIE}=${encodeURIComponent(createSession({ id: 42, login: "zach" }, SECRET))}`;
const record = (id, updatedAt, extra = {}) => ({ id, kind: "workout", updatedAt, name: id, ...extra });

test("sync needs a session and a same-origin request", async () => {
  const app = createApp({ store: new MemoryStore(), env });
  assert.equal((await request(app, { method: "POST", path: "/api/sync", body: {} })).status, 401);
  assert.equal((await request(app, { method: "POST", path: "/api/sync", body: {}, cookie: signedIn, origin: "https://evil.example" })).status, 403);
  assert.equal((await request(app, { path: "/api/session", cookie: signedIn })).body.user.login, "zach");
});

test("a second device pulls what the first pushed, and newest edit wins", async () => {
  const app = createApp({ store: new MemoryStore(), env });
  const phone = await request(app, { method: "POST", path: "/api/sync", cookie: signedIn, body: { since: 0, changes: [record("w1", 100), record("w2", 100)] } });
  assert.equal(phone.body.accepted, 2);
  assert.equal(phone.body.records.length, 2);

  const laptop = await request(app, { method: "POST", path: "/api/sync", cookie: signedIn, body: { since: 0, changes: [record("w1", 50, { name: "stale" })] } });
  assert.equal(laptop.body.accepted, 0, "older copy is ignored");
  assert.equal(laptop.body.records.find((r) => r.id === "w1").name, "w1");

  const edit = await request(app, { method: "POST", path: "/api/sync", cookie: signedIn, body: { since: laptop.body.cursor, changes: [record("w2", 200, { deleted: true })] } });
  assert.equal(edit.body.accepted, 1);
  assert.deepEqual(edit.body.records.map((r) => [r.id, r.deleted]), [["w2", true]], "only changes since the cursor come back");

  const again = await request(app, { method: "POST", path: "/api/sync", cookie: signedIn, body: { since: edit.body.cursor, changes: [] } });
  assert.equal(again.body.records.length, 0);
  assert.equal(again.body.cursor, edit.body.cursor);
});

test("a device whose cursor is past the server's newest record is told to start over", async () => {
  const app = createApp({ store: new MemoryStore(), env });
  const response = await request(app, { method: "POST", path: "/api/sync", cookie: signedIn, body: { since: 50, changes: [] } });
  assert.equal(response.body.reset, true);
  assert.equal(response.body.cursor, 0);
  const fine = await request(app, { method: "POST", path: "/api/sync", cookie: signedIn, body: { since: 0, changes: [] } });
  assert.equal(fine.body.reset, false);
});

test("bad records are dropped and duplicate ids keep the newest", () => {
  const cleaned = cleanChanges([
    record("a", 1),
    record("a", 3, { name: "newest" }),
    record("a", 2),
    { id: "b", kind: "nope", updatedAt: 1 },
    { id: "", kind: "workout", updatedAt: 1 },
    { id: "c", kind: "workout" },
    null,
    "x"
  ]);
  assert.deepEqual(cleaned.map((r) => [r.id, r.name]), [["a", "newest"]]);
  assert.deepEqual(cleanChanges("nope"), []);
});

test("sign-in only lets the allowed GitHub account in", async () => {
  const app = createApp({ store: new MemoryStore(), env: { ...env, LIFT_DEV_LOGIN: "1", ALLOWED_GITHUB_ID: "1" } });
  const login = await request(app, { path: "/api/auth/login" });
  assert.equal(login.status, 302);
  assert.match(login.headers.location, /dev=1/);
  const callback = await request(app, { path: "/api/auth/callback?dev=1" });
  assert.equal(callback.headers.location, "/");
  assert.ok(String(callback.headers["set-cookie"]).includes(SESSION_COOKIE));

  const real = createApp({ store: new MemoryStore(), env, fetchImpl: async (url) => ({
    ok: true,
    json: async () => (String(url).includes("access_token") ? { access_token: "t" } : { id: 7, login: "someone-else" })
  }) });
  const denied = await request(real, { path: "/api/auth/callback?code=x&state=bad" });
  assert.match(denied.headers.location, /signin=expired/);
});

test("dev sign-in is refused on Vercel", () => {
  const app = createApp({ store: new MemoryStore(), env: { ...env, LIFT_DEV_LOGIN: "1", VERCEL: "1" } });
  assert.equal(app.config.devLogin, false);
});

test("missing configuration is reported instead of half-working", async () => {
  const app = createApp({ store: new MemoryStore(), env: {} });
  const response = await request(app, { path: "/api/session" });
  assert.equal(response.status, 503);
  assert.match(response.body.error, /APP_URL|appUrl/);
});
