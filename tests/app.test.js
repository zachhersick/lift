import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { cleanChanges, createApp } from "../server/app.js";
import { MemoryStore } from "../server/store.js";
import { createSession, SESSION_COOKIE } from "../server/auth.js";

const SECRET = "test-secret-that-is-at-least-32-chars-long";
const ORIGIN = "https://lift.example.com";
const env = { APP_URL: ORIGIN, SESSION_SECRET: SECRET, ALLOWED_GITHUB_ID: "42", GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "secret" };

function request(app, { method = "GET", path, body, cookie, origin = ORIGIN, form, headers = {} }) {
  const raw = form ? new URLSearchParams(form).toString() : body === undefined ? null : JSON.stringify(body);
  const req = Readable.from(raw === null ? [] : [Buffer.from(raw)]);
  req.method = method;
  req.url = path;
  req.headers = { "content-type": form ? "application/x-www-form-urlencoded" : "application/json", origin, ...(cookie ? { cookie } : {}), ...headers };
  return new Promise((resolve) => {
    const res = {
      headersSent: false,
      writeHead(status, headers) {
        this.status = status;
        this.headers = headers;
        this.headersSent = true;
      },
      end(text = "") {
        let parsed = null;
        try {
          parsed = text ? JSON.parse(text) : null;
        } catch {
          parsed = text;
        }
        resolve({ status: this.status, headers: this.headers, body: parsed });
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

// ---------- ChatGPT connector ----------

const CHATGPT = "https://chatgpt.com/connector_platform_oauth_redirect";
const verifier = "a-pkce-verifier-that-is-long-enough-1234567890";
const challenge = createHash("sha256").update(verifier).digest("base64url");

async function register(app, uris = [CHATGPT]) {
  return request(app, { method: "POST", path: "/api/oauth/register", body: { client_name: "ChatGPT", redirect_uris: uris }, origin: undefined });
}

function authorizePath(clientId, extra = {}) {
  return `/api/oauth/authorize?${new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: CHATGPT, state: "s1", code_challenge: challenge, code_challenge_method: "S256", ...extra })}`;
}

const approval = (client, decision = "allow") => ({ response_type: "code", client_id: client, redirect_uri: CHATGPT, state: "s1", code_challenge: challenge, code_challenge_method: "S256", decision });

// Registers, approves and trades the code: the whole connect flow.
async function connect(app) {
  const client = (await register(app)).body.client_id;
  const approved = await request(app, { method: "POST", path: "/api/oauth/authorize", cookie: signedIn, form: approval(client) });
  const code = new URL(approved.headers.location).searchParams.get("code");
  const tokens = await request(app, { method: "POST", path: "/api/oauth/token", origin: undefined, form: { grant_type: "authorization_code", code, client_id: client, redirect_uri: CHATGPT, code_verifier: verifier } });
  return { client, code, tokens: tokens.body };
}

const rpc = (app, token, method, params = {}, id = 1) =>
  request(app, { method: "POST", path: "/api/mcp", origin: undefined, body: { jsonrpc: "2.0", id, method, params }, headers: token ? { authorization: `Bearer ${token}` } : {} });
const callTool = async (app, token, name, args = {}) => (await rpc(app, token, "tools/call", { name, arguments: args })).body.result;

test("discovery metadata points ChatGPT at Lift's OAuth endpoints", async () => {
  const app = createApp({ store: new MemoryStore(), env });
  const resource = await request(app, { path: "/.well-known/oauth-protected-resource/api/mcp" });
  assert.equal(resource.body.resource, `${ORIGIN}/api/mcp`);
  assert.deepEqual(resource.body.authorization_servers, [ORIGIN]);
  const server = await request(app, { path: "/.well-known/oauth-authorization-server" });
  assert.equal(server.body.token_endpoint, `${ORIGIN}/api/oauth/token`);
  assert.deepEqual(server.body.code_challenge_methods_supported, ["S256"]);
});

test("only ChatGPT redirect addresses can register, and PKCE is required", async () => {
  const app = createApp({ store: new MemoryStore(), env });
  assert.equal((await register(app, ["https://evil.example/callback"])).status, 400);
  assert.equal((await register(app, ["http://chatgpt.com/cb"])).status, 400, "https only");
  const client = (await register(app)).body.client_id;
  const noPkce = await request(app, { path: authorizePath(client, { code_challenge: "", code_challenge_method: "" }), cookie: signedIn });
  assert.match(noPkce.headers.location, /^https:\/\/chatgpt\.com\/.*error=invalid_request/);
  const badRedirect = await request(app, { path: authorizePath(client, { redirect_uri: "https://chatgpt.com/other" }), cookie: signedIn });
  assert.equal(badRedirect.status, 400, "an unregistered redirect gets an error page, not a redirect");
  const forged = await request(app, { path: authorizePath(`${client}x`), cookie: signedIn });
  assert.equal(forged.status, 400);
});

test("approving goes through GitHub sign-in first, then a consent page", async () => {
  const app = createApp({ store: new MemoryStore(), env: { ...env, LIFT_DEV_LOGIN: "1", ALLOWED_GITHUB_ID: "1" } });
  const client = (await register(app)).body.client_id;
  const anonymous = await request(app, { path: authorizePath(client) });
  assert.match(anonymous.headers.location, /^\/api\/auth\/login\?next=/);
  const login = await request(app, { path: anonymous.headers.location });
  const nextCookie = [].concat(login.headers["set-cookie"])[0].split(";")[0];
  const callback = await request(app, { path: "/api/auth/callback?dev=1", cookie: nextCookie });
  assert.equal(callback.headers.location, authorizePath(client), "back to the approval page after sign-in");

  const session = [].concat(callback.headers["set-cookie"]).find((c) => c.startsWith(SESSION_COOKIE)).split(";")[0];
  const page = await request(app, { path: authorizePath(client), cookie: session });
  assert.equal(page.status, 200);
  assert.match(page.body, /Connect ChatGPT to Lift\?/);
  const crossSite = await request(app, { method: "POST", path: "/api/oauth/authorize", cookie: session, origin: "https://evil.example", form: approval(client) });
  assert.equal(crossSite.status, 403);
  const denied = await request(app, { method: "POST", path: "/api/oauth/authorize", cookie: session, form: approval(client, "deny") });
  assert.match(denied.headers.location, /error=access_denied/);
  assert.match(denied.headers.location, /state=s1/);
});

test("codes need the PKCE verifier and work once; refresh tokens rotate", async () => {
  const app = createApp({ store: new MemoryStore(), env });
  const { client, code, tokens } = await connect(app);
  assert.equal(tokens.token_type, "Bearer");
  assert.ok(tokens.access_token && tokens.refresh_token);
  const again = await request(app, { method: "POST", path: "/api/oauth/token", origin: undefined, form: { grant_type: "authorization_code", code, client_id: client, redirect_uri: CHATGPT, code_verifier: verifier } });
  assert.equal(again.body.error, "invalid_grant", "a code works once");

  const fresh = (await request(app, { method: "POST", path: "/api/oauth/authorize", cookie: signedIn, form: approval(client) })).headers.location;
  const wrongVerifier = await request(app, { method: "POST", path: "/api/oauth/token", origin: undefined, body: { grant_type: "authorization_code", code: new URL(fresh).searchParams.get("code"), client_id: client, code_verifier: "nope" } });
  assert.equal(wrongVerifier.body.error, "invalid_grant");

  const refreshed = await request(app, { method: "POST", path: "/api/oauth/token", origin: undefined, form: { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: client } });
  assert.ok(refreshed.body.access_token);
  assert.notEqual(refreshed.body.refresh_token, tokens.refresh_token);
  const reused = await request(app, { method: "POST", path: "/api/oauth/token", origin: undefined, form: { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: client } });
  assert.equal(reused.body.error, "invalid_grant", "a refresh token works once");
});

test("the MCP endpoint needs a valid token, and bumping the version or allowed account revokes it", async () => {
  const store = new MemoryStore();
  const app = createApp({ store, env });
  const none = await rpc(app, null, "tools/list");
  assert.equal(none.status, 401);
  assert.match(none.headers["www-authenticate"], /resource_metadata="https:\/\/lift\.example\.com\/\.well-known\/oauth-protected-resource\/api\/mcp"/);
  const { tokens } = await connect(app);
  assert.equal((await rpc(app, tokens.access_token, "tools/list")).status, 200);
  assert.equal((await rpc(app, "nope", "tools/list")).status, 401);
  const bumped = createApp({ store, env: { ...env, MCP_TOKEN_VERSION: "2" } });
  assert.equal((await rpc(bumped, tokens.access_token, "tools/list")).status, 401);
  const otherAccount = createApp({ store, env: { ...env, ALLOWED_GITHUB_ID: "99" } });
  assert.equal((await rpc(otherAccount, tokens.access_token, "tools/list")).status, 401);
});

test("ChatGPT logs meals that the phone then pulls, and retries don't double up", async () => {
  const app = createApp({ store: new MemoryStore(), env });
  const { tokens } = await connect(app);
  const token = tokens.access_token;
  const settingsRecord = { id: "settings", kind: "settings", updatedAt: 1, timeZone: "America/Chicago", goal: "maintain", calorieTarget: 2500, proteinTarget: 180 };
  await request(app, { method: "POST", path: "/api/sync", cookie: signedIn, body: { since: 0, changes: [settingsRecord] } });

  const init = (await rpc(app, token, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test" } })).body.result;
  assert.equal(init.serverInfo.name, "lift");
  assert.equal(init.protocolVersion, "2025-06-18");
  const names = (await rpc(app, token, "tools/list")).body.result.tools.map((t) => t.name);
  assert.deepEqual(names, ["log_meal", "update_meal", "delete_meal", "get_day", "get_coaching_context"]);

  // 02:00 UTC on Oct 21 is the evening of Oct 20 in Chicago.
  const args = { name: "Burrito bowl", calories: 850, protein: 55, carbs: 90, fat: 25, items: [{ name: "Rice", amount: "1 cup" }], eaten_at: "2026-10-21T02:00:00Z", ref: "chat-1" };
  const first = await callTool(app, token, "log_meal", args);
  assert.equal(first.isError, false);
  assert.equal(first.structuredContent.logged.date, "2026-10-20");
  assert.equal(first.structuredContent.day.remaining.calories, 1650);
  assert.equal(first.structuredContent.day.remaining.protein, 125);
  const retry = await callTool(app, token, "log_meal", args);
  assert.equal(retry.structuredContent.logged.id, first.structuredContent.logged.id);
  assert.equal(retry.structuredContent.day.meals.length, 1, "same ref, same meal");

  const pulled = await request(app, { method: "POST", path: "/api/sync", cookie: signedIn, body: { since: 0, changes: [] } });
  const meals = pulled.body.records.filter((r) => r.kind === "meal");
  assert.equal(meals.length, 1);
  assert.equal(meals[0].source, "chatgpt");

  const fixed = await callTool(app, token, "update_meal", { id: meals[0].id, calories: 700 });
  assert.equal(fixed.structuredContent.updated.calories, 700);
  assert.equal(fixed.structuredContent.updated.protein, 55, "untouched fields stay");
  const day = await callTool(app, token, "get_day", { date: "2026-10-20" });
  assert.equal(day.structuredContent.totals.calories, 700);
  await callTool(app, token, "delete_meal", { id: meals[0].id });
  assert.equal((await callTool(app, token, "get_day", { date: "2026-10-20" })).structuredContent.meals.length, 0);

  const bad = await callTool(app, token, "log_meal", { name: "x", calories: -5, protein: 0, carbs: 0, fat: 0 });
  assert.equal(bad.isError, true);
  const missing = await callTool(app, token, "update_meal", { id: "nope" });
  assert.equal(missing.isError, true);
  const context = await callTool(app, token, "get_coaching_context", { weeks: 2 });
  assert.equal(context.structuredContent.weeks.length, 2);
  assert.equal(context.structuredContent.targets.calories, 2500);
});

test("MCP notifications get no reply and unknown methods an error", async () => {
  const app = createApp({ store: new MemoryStore(), env });
  const { tokens } = await connect(app);
  const auth = { authorization: `Bearer ${tokens.access_token}` };
  const note = await request(app, { method: "POST", path: "/api/mcp", origin: undefined, body: { jsonrpc: "2.0", method: "notifications/initialized" }, headers: auth });
  assert.equal(note.status, 202);
  assert.equal((await rpc(app, tokens.access_token, "nope")).body.error.code, -32601);
  assert.equal((await request(app, { path: "/api/mcp", headers: auth })).status, 405);
});

test("the weekly review asks Claude with fallbacks on and saves a synced record", async () => {
  const calls = [];
  const anthropic = { beta: { messages: { create: async (params) => {
    calls.push(params);
    return { model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: "Solid week.\nThis week:\n- Eat 2,700 kcal" }] };
  } } } };
  const store = new MemoryStore();
  const off = createApp({ store, env });
  assert.equal((await request(off, { method: "POST", path: "/api/coach/review", cookie: signedIn, body: {} })).status, 503, "off without a key");
  assert.equal((await request(off, { path: "/api/session", cookie: signedIn })).body.coach, false);

  const app = createApp({ store, env, anthropic });
  assert.equal((await request(app, { method: "POST", path: "/api/coach/review", cookie: signedIn, body: {}, origin: "https://evil.example" })).status, 403);
  assert.equal((await request(app, { method: "POST", path: "/api/coach/review", cookie: signedIn, body: {} })).status, 409, "nothing logged yet");
  const meal = { id: "m1", kind: "meal", updatedAt: 1, date: "2026-10-20", name: "Oats", calories: 600, protein: 40, carbs: 80, fat: 10 };
  await request(app, { method: "POST", path: "/api/sync", cookie: signedIn, body: { since: 0, changes: [meal] } });

  const response = await request(app, { method: "POST", path: "/api/coach/review", cookie: signedIn, body: {} });
  assert.equal(response.status, 200);
  assert.equal(response.body.review.kind, "coachReview");
  assert.match(response.body.review.text, /^Solid week/);
  assert.equal(calls[0].model, "claude-opus-5-5");
  assert.equal(calls[0].fallbacks, "default");
  assert.deepEqual(calls[0].betas, ["server-side-fallback-2026-07-01"]);
  assert.match(calls[0].messages[0].content, /"weeks":\[/);
  const pulled = await request(app, { method: "POST", path: "/api/sync", cookie: signedIn, body: { since: 0, changes: [] } });
  assert.ok(pulled.body.records.some((r) => r.kind === "coachReview"), "the review syncs to the phone");

  const refused = createApp({ store, env, anthropic: { beta: { messages: { create: async () => ({ stop_reason: "refusal", content: [] }) } } } });
  assert.equal((await request(refused, { method: "POST", path: "/api/coach/review", cookie: signedIn, body: {} })).status, 502);
});
