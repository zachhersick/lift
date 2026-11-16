import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac, generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { cleanChanges, createApp } from "../server/app.js";
import { MemoryStore, NeonStore } from "../server/store.js";
import { createSession, SESSION_COOKIE } from "../server/auth.js";
import { seal } from "../server/oauth.js";

const SECRET = "test-secret-that-is-at-least-32-chars-long";
const ORIGIN = "https://lift.example.com";
const env = { APP_URL: ORIGIN, SESSION_SECRET: SECRET, ADMIN_EMAILS: "zach@example.com", GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "secret" };

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

const sessionFor = (email) => `${SESSION_COOKIE}=${encodeURIComponent(createSession({ email, name: "" }, SECRET))}`;
const signedIn = sessionFor("zach@example.com");
const record = (id, updatedAt, extra = {}) => ({ id, kind: "workout", updatedAt, name: id, ...extra });

test("sync needs a session and a same-origin request", async () => {
  const app = createApp({ store: new MemoryStore(), env });
  assert.equal((await request(app, { method: "POST", path: "/api/sync", body: {} })).status, 401);
  assert.equal((await request(app, { method: "POST", path: "/api/sync", body: {}, cookie: signedIn, origin: "https://evil.example" })).status, 403);
  assert.deepEqual((await request(app, { path: "/api/session", cookie: signedIn })).body.user, { email: "zach@example.com", name: "", username: null, admin: true, vip: true, pro: true, subscribed: false });
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

// A fake Google and GitHub: tokens for any code, and this profile.
const providers = (profile) => async (url) => ({
  ok: true,
  json: async () => {
    const at = String(url);
    if (at.includes("access_token") || at.includes("oauth2.googleapis.com/token")) return { access_token: "t" };
    if (at.endsWith("/user/emails")) return [{ email: "old@example.com", primary: false, verified: true }, { email: profile.email, primary: true, verified: profile.verified !== false }];
    if (at.includes("api.github.com/user")) return { id: 7, login: "someone", name: profile.name };
    return { email: profile.email, email_verified: profile.verified !== false, name: profile.name };
  }
});
const googleEnv = { ...env, GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsecret" };
const cookieFrom = (response, name) => [].concat(response.headers["set-cookie"] || []).find((c) => c.startsWith(`${name}=`))?.split(";")[0];

// Starts sign-in with a provider and comes back from it with a code.
async function signInWith(app, provider) {
  const start = await request(app, { path: `/api/auth/login?provider=${provider}` });
  const state = new URL(start.headers.location).searchParams.get("state");
  const back = provider === "google" ? "/api/auth/google/callback" : "/api/auth/callback";
  return request(app, { path: `${back}?code=c&state=${state}`, cookie: cookieFrom(start, "lift_oauth_state") });
}

test("Google and GitHub sign in by verified email, for admins and invitees only", async () => {
  const store = new MemoryStore();
  const as = (profile) => createApp({ store, env: googleEnv, fetchImpl: providers(profile) });

  const google = await signInWith(as({ email: "Zach@Example.com", name: "Zach" }), "google");
  assert.equal(google.headers.location, "/");
  const session = cookieFrom(google, SESSION_COOKIE);
  assert.equal((await request(as({}), { path: "/api/session", cookie: session })).body.user.email, "zach@example.com", "emails are lowercased");
  const start = await request(as({}), { path: "/api/auth/login?provider=google" });
  assert.match(start.headers.location, /^https:\/\/accounts\.google\.com\/.*scope=openid\+email\+profile/);
  const github = await request(as({}), { path: "/api/auth/login?provider=github" });
  assert.match(github.headers.location, /scope=user%3Aemail/);

  const stranger = await signInWith(as({ email: "stranger@example.com" }), "github");
  assert.match(stranger.headers.location, /signin=denied/);
  const unverified = await signInWith(as({ email: "zach@example.com", verified: false }), "google");
  assert.match(unverified.headers.location, /signin=failed/);
  assert.match((await request(as({}), { path: "/api/auth/callback?code=x&state=bad" })).headers.location, /signin=expired/);

  await store.putUser({ email: "friend@example.com", vip: false, createdAt: 1 });
  const friend = await signInWith(as({ email: "friend@example.com", name: "Friend" }), "github");
  assert.equal(friend.headers.location, "/", "an invitee signs in with GitHub's primary verified email");
  assert.equal((await store.getUser("friend@example.com")).name, "Friend");
  assert.ok((await store.getUser("friend@example.com")).lastSeenAt);

  const open = createApp({ store, env: { ...googleEnv, OPEN_SIGNUP: "1" }, fetchImpl: providers({ email: "anyone@example.com" }) });
  assert.equal((await signInWith(open, "google")).headers.location, "/", "open sign-up lets anyone in");

  const choose = await request(as({}), { path: "/api/auth/login" });
  assert.equal(choose.status, 200, "with two providers, the login page lets you choose");
  assert.match(choose.body, /Continue with Google/);
  assert.match(choose.body, /Continue with GitHub/);
  assert.deepEqual((await request(as({}), { path: "/api/session" })).body.providers, ["google", "github"]);
});

test("old GitHub-id sessions are refused", async () => {
  const app = createApp({ store: new MemoryStore(), env });
  const payload = Buffer.from(JSON.stringify({ sub: "42", login: "zach", exp: Date.now() + 60_000 })).toString("base64url");
  const { sign } = await import("../server/auth.js");
  const old = `${SESSION_COOKIE}=${encodeURIComponent(`${payload}.${sign(payload, SECRET)}`)}`;
  assert.equal((await request(app, { path: "/api/session", cookie: old })).body.signedIn, false);
});

test("each account has its own records, even with the same ids", async () => {
  const store = new MemoryStore();
  await store.putUser({ email: "friend@example.com", vip: false, createdAt: 1 });
  const app = createApp({ store, env });
  const friend = sessionFor("friend@example.com");
  const settings = (goal) => ({ id: "settings", kind: "settings", updatedAt: 5, goal });
  await request(app, { method: "POST", path: "/api/sync", cookie: signedIn, body: { since: 0, changes: [settings("cut"), record("w1", 100)] } });
  const theirs = await request(app, { method: "POST", path: "/api/sync", cookie: friend, body: { since: 0, changes: [settings("leanBulk")] } });
  assert.equal(theirs.body.accepted, 1, "the same id is a different record for another account");
  assert.deepEqual(theirs.body.records.map((r) => [r.id, r.goal]), [["settings", "leanBulk"]], "only your own records come back");
  const mine = await request(app, { method: "POST", path: "/api/sync", cookie: signedIn, body: { since: 0, changes: [] } });
  assert.deepEqual(mine.body.records.map((r) => r.id).sort(), ["settings", "w1"]);
  assert.equal(mine.body.records.find((r) => r.id === "settings").goal, "cut");

  await store.removeUser("friend@example.com");
  assert.equal((await request(app, { method: "POST", path: "/api/sync", cookie: friend, body: { since: 0, changes: [] } })).status, 401, "removing someone ends their session");
});

test("only admins manage the invite list and VIPs", async () => {
  const store = new MemoryStore();
  const app = createApp({ store, env });
  const invite = (cookie, body, extra = {}) => request(app, { method: "POST", path: "/api/admin/users", cookie, body, ...extra });
  const added = await invite(signedIn, { email: " Friend@Example.com ", vip: true });
  assert.equal(added.status, 200);
  const friend = added.body.users.find((u) => u.email === "friend@example.com");
  assert.equal(friend.vip, true);
  assert.equal(friend.invitedBy, "zach@example.com");
  assert.ok(added.body.users.find((u) => u.email === "zach@example.com").admin, "admins are listed");

  const friendCookie = sessionFor("friend@example.com");
  assert.equal((await request(app, { path: "/api/admin/users", cookie: friendCookie })).status, 403);
  assert.equal((await invite(friendCookie, { email: "x@example.com" })).status, 403);
  assert.equal((await invite(signedIn, { email: "x@example.com" }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await invite(signedIn, { email: "not an email" })).status, 400);
  assert.deepEqual((await request(app, { path: "/api/session", cookie: friendCookie })).body.user, { email: "friend@example.com", name: "", username: null, admin: false, vip: true, pro: true, subscribed: false });

  const lowered = await invite(signedIn, { email: "friend@example.com", vip: false });
  assert.equal(lowered.body.users.find((u) => u.email === "friend@example.com").vip, false);
  assert.equal((await store.getUser("friend@example.com")).createdAt, friend.createdAt, "updating keeps when they were invited");
  assert.equal((await request(app, { method: "POST", path: "/api/admin/users/remove", cookie: signedIn, body: { email: "zach@example.com" } })).status, 400, "admins can't be removed");
  const removed = await request(app, { method: "POST", path: "/api/admin/users/remove", cookie: signedIn, body: { email: "friend@example.com" } });
  assert.ok(!removed.body.users.some((u) => u.email === "friend@example.com"));
});

test("the Neon store moves pre-account records to the first admin", async () => {
  const calls = [];
  const fake = () => ({ query: async (text, params) => (calls.push({ text, params }), []) });
  const store = new NeonStore("postgres://example", { neon: fake, legacyOwner: "zach@example.com" });
  await store.forOwner("zach@example.com").listKind("meal");
  const legacy = calls.find((c) => /set owner = \$1 where owner is null/.test(c.text));
  assert.deepEqual(legacy.params, ["zach@example.com"]);
  assert.ok(calls.findIndex((c) => c === legacy) < calls.findIndex((c) => /add primary key \(owner, id\)/.test(c.text)), "owners are filled in before the key changes");
  assert.deepEqual(calls.at(-1).params, ["zach@example.com", "meal"], "queries are scoped to the owner");
  const none = [];
  await new NeonStore("postgres://example", { neon: () => ({ query: async (text, params) => (none.push(text), []) }) }).init();
  assert.ok(!none.some((text) => /where owner is null/.test(text) && /update/.test(text)), "no legacy owner, no update");
});

test("dev sign-in is refused on Vercel", () => {
  const app = createApp({ store: new MemoryStore(), env: { ...env, LIFT_DEV_LOGIN: "1", VERCEL: "1" } });
  assert.equal(app.config.devLogin, false);
});

test("dev sign-in is refused against a real database", () => {
  const app = createApp({ store: new MemoryStore(), env: { ...env, LIFT_DEV_LOGIN: "1", DATABASE_URL: "postgres://neon.example/lift" } });
  assert.equal(app.config.devLogin, false);
  assert.equal(app.config.providers.includes("dev"), false);
});

test("missing configuration is reported instead of half-working", async () => {
  const app = createApp({ store: new MemoryStore(), env: {} });
  const response = await request(app, { path: "/api/session" });
  assert.equal(response.status, 503);
  assert.match(response.body.error, /APP_URL/);
  assert.match(response.body.error, /ADMIN_EMAILS/);
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

test("approving goes through sign-in first, then a consent page", async () => {
  const app = createApp({ store: new MemoryStore(), env: { ...env, LIFT_DEV_LOGIN: "1" } });
  const client = (await register(app)).body.client_id;
  const anonymous = await request(app, { path: authorizePath(client) });
  assert.match(anonymous.headers.location, /^\/api\/auth\/login\?next=/);
  const choose = await request(app, { path: anonymous.headers.location });
  assert.match(choose.body, /Continue with GitHub/);
  const devLink = /href="([^"]*provider=dev[^"]*)"/.exec(choose.body)[1].replace(/&amp;/g, "&");
  const login = await request(app, { path: devLink });
  const nextCookie = [].concat(login.headers["set-cookie"])[0].split(";")[0];
  const callback = await request(app, { path: new URL(login.headers.location, ORIGIN).pathname + new URL(login.headers.location, ORIGIN).search, cookie: nextCookie });
  assert.equal(callback.headers.location, authorizePath(client), "back to the approval page after sign-in");

  const session = [].concat(callback.headers["set-cookie"]).find((c) => c.startsWith(SESSION_COOKIE)).split(";")[0];
  const page = await request(app, { path: authorizePath(client), cookie: session });
  assert.equal(page.status, 200);
  assert.match(page.body, /Connect ChatGPT to Lift\?/);
  assert.match(page.body, /zach@example\.com/, "the first admin, signed in by dev login");
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

test("the MCP endpoint needs a valid token, and bumping the version or removing the account revokes it", async () => {
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
  const otherAccount = createApp({ store, env: { ...env, ADMIN_EMAILS: "someone@example.com" } });
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
  assert.deepEqual(names, ["log_meal", "update_meal", "delete_meal", "get_day", "get_coaching_context", "get_splits", "get_exercises", "create_exercise", "create_split", "update_split"]);

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

test("ChatGPT reads and writes only the connected account's meals", async () => {
  const store = new MemoryStore();
  await store.putUser({ email: "friend@example.com", vip: false, createdAt: 1 });
  const app = createApp({ store, env });
  const { tokens } = await connect(app);
  await callTool(app, tokens.access_token, "log_meal", { name: "Oats", calories: 400, protein: 20, carbs: 60, fat: 8, date: "2026-10-20" });
  const friend = await request(app, { method: "POST", path: "/api/sync", cookie: sessionFor("friend@example.com"), body: { since: 0, changes: [] } });
  assert.equal(friend.body.records.length, 0);
  const mine = await request(app, { method: "POST", path: "/api/sync", cookie: signedIn, body: { since: 0, changes: [] } });
  assert.equal(mine.body.records.filter((r) => r.kind === "meal").length, 1);
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
  const unasked = await request(app, { method: "POST", path: "/api/coach/review", cookie: signedIn, body: {} });
  assert.equal(unasked.status, 409, "nothing goes to Claude before you agree");
  assert.equal(unasked.body.error, "Turn on weekly reviews first.");
  const early = await request(app, { method: "POST", path: "/api/coach/review", cookie: signedIn, body: { consent: true } });
  assert.equal(early.status, 409, "nothing logged yet");
  assert.equal(early.body.error, "Log 3 lifts this week to get your review (0 so far).");
  const meal = { id: "m1", kind: "meal", updatedAt: 1, date: "2026-10-20", name: "Oats", calories: 600, protein: 40, carbs: 80, fat: 10 };
  const lift = (i) => ({ id: `w${i}`, kind: "workout", updatedAt: 1, startedAt: Date.now() - (i + 1) * 86_400_000, finishedAt: Date.now() - i * 86_400_000, entries: [{ id: `e${i}`, exerciseId: "b_bench-press", sets: [{ id: `s${i}`, weight: 100, reps: 5, type: "working", done: true }] }] });
  await request(app, { method: "POST", path: "/api/sync", cookie: signedIn, body: { since: 0, changes: [meal, lift(0), lift(1)] } });
  assert.match((await request(app, { method: "POST", path: "/api/coach/review", cookie: signedIn, body: { consent: true } })).body.error, /\(2 so far\)/);
  await request(app, { method: "POST", path: "/api/sync", cookie: signedIn, body: { since: 0, changes: [lift(2)] } });

  await store.putUser({ email: "friend@example.com", vip: false, createdAt: 1 });
  const friend = sessionFor("friend@example.com");
  assert.equal((await request(app, { path: "/api/session", cookie: friend })).body.coach, false, "not a VIP");
  assert.equal((await request(app, { method: "POST", path: "/api/coach/review", cookie: friend, body: {} })).status, 403);
  assert.equal((await request(app, { path: "/api/session", cookie: signedIn })).body.coach, true);

  const response = await request(app, { method: "POST", path: "/api/coach/review", cookie: signedIn, body: { consent: true } });
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
  assert.equal((await request(refused, { method: "POST", path: "/api/coach/review", cookie: signedIn, body: { consent: true } })).status, 502);
});

test("ChatGPT can log micronutrients, and get_day reports them against Daily Values", async () => {
  const app = createApp({ store: new MemoryStore(), env });
  const { tokens } = await connect(app);
  const token = tokens.access_token;
  const base = { calories: 600, protein: 40, carbs: 60, fat: 20, date: "2026-10-20" };
  const first = await callTool(app, token, "log_meal", { ...base, name: "Salmon bowl", fiber: 9, micros: { sodium: 800, potassium: 1200, vitaminD: 12 }, ref: "m1" });
  assert.equal(first.isError, false);
  assert.deepEqual(first.structuredContent.logged.micros, { sodium: 800, potassium: 1200, vitaminD: 12 });
  await callTool(app, token, "log_meal", { ...base, name: "Toast", micros: { sodium: 400 }, ref: "m2" });
  const day = (await callTool(app, token, "get_day", { date: "2026-10-20" })).structuredContent;
  const sodium = day.micros.find((m) => m.nutrient === "sodium");
  assert.equal(sodium.amount, 1200);
  assert.equal(sodium.percent_dv, 52);
  assert.equal(sodium.partial, undefined, "both meals reported sodium");
  assert.equal(day.micros.find((m) => m.nutrient === "potassium").partial, "1 of 2 meals");
  assert.equal(day.micros.find((m) => m.nutrient === "fiber").amount, 9);

  const merged = await callTool(app, token, "update_meal", { id: first.structuredContent.logged.id, micros: { calcium: 150 } });
  assert.deepEqual(merged.structuredContent.updated.micros, { sodium: 800, potassium: 1200, vitaminD: 12, calcium: 150 });
  const unknown = await callTool(app, token, "log_meal", { ...base, name: "x", micros: { unobtainium: 5 } });
  assert.equal(unknown.isError, true);
  assert.match(unknown.content[0].text, /Unknown micronutrient "unobtainium"/);
  const tooMuch = await callTool(app, token, "log_meal", { ...base, name: "x", micros: { sodium: 999999 } });
  assert.equal(tooMuch.isError, true);
  const schema = (await rpc(app, token, "tools/list")).body.result.tools.find((t) => t.name === "log_meal").inputSchema;
  assert.ok(schema.properties.micros.properties.magnesium);
});


// Two signed-in members with usernames: amy (has a display name) and ben.
async function members({ amyVip = false } = {}) {
  const store = new MemoryStore();
  await store.putUser({ email: "amy@example.com", name: "Amy", vip: amyVip, createdAt: 1 });
  await store.putUser({ email: "ben@example.com", name: "", vip: false, createdAt: 1 });
  const app = createApp({ store, env });
  const amy = sessionFor("amy@example.com");
  const ben = sessionFor("ben@example.com");
  const post = (cookie, path, body, extra = {}) => request(app, { method: "POST", path, cookie, body, ...extra });
  return { store, app, amy, ben, post };
}

test("usernames are chosen once, unique, lowercase and validated", async () => {
  const { app, amy, ben, post } = await members();
  assert.equal((await post(amy, "/api/friends/request", { username: "ben" })).status, 409, "pick a username before adding friends");
  assert.equal((await post(amy, "/api/account", { username: "no" })).status, 400, "too short");
  assert.equal((await post(amy, "/api/account", { username: "bad name!" })).status, 400);
  assert.equal((await post(amy, "/api/account", { username: "admin" })).status, 400, "reserved");
  assert.equal((await post(amy, "/api/account", { username: "amy" }, { origin: "https://evil.example" })).status, 403);
  const saved = await post(amy, "/api/account", { username: " @Amy.Lifts ", name: "  Amy R  " });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.user.username, "amy.lifts");
  assert.equal(saved.body.user.name, "Amy R");
  assert.equal((await request(app, { path: "/api/session", cookie: amy })).body.user.username, "amy.lifts");
  assert.equal((await post(ben, "/api/account", { username: "AMY.LIFTS" })).status, 409, "taken, whatever the case");
  assert.equal((await post(amy, "/api/account", { username: "amy.lifts" })).status, 200, "saving your own again is fine");
  assert.equal((await post(amy, "/api/account", { name: "Amy" })).body.user.username, "amy.lifts", "changing only the name keeps the username");
});

test("friends add each other by username and see share-filtered summaries without emails", async () => {
  const { store, app, amy, ben, post } = await members({ amyVip: true });
  await post(amy, "/api/account", { username: "amy" });
  await post(ben, "/api/account", { username: "ben" });
  const bench = { id: "w1", kind: "workout", updatedAt: 1, name: "Push", startedAt: Date.UTC(2026, 0, 5), finishedAt: Date.UTC(2026, 0, 5, 1), entries: [{ exerciseId: "b_bench-press", sets: [{ done: true, weight: 225, reps: 5 }] }], notes: "secret note" };
  await post(amy, "/api/sync", { since: 0, changes: [bench, { id: "bw_2026-01-05", kind: "bodyweight", updatedAt: 1, date: "2026-01-05", weight: 150 }, { id: "m1", kind: "meal", updatedAt: 1, date: "2026-01-05", name: "Pizza" }, { id: "settings", kind: "settings", updatedAt: 1, pinnedLift: "b_bench-press" }] });

  assert.equal((await request(app, { path: "/api/profile?username=amy", cookie: ben })).status, 404, "not friends yet");
  assert.equal((await post(ben, "/api/friends/request", { username: "ben" })).status, 400, "not yourself");
  assert.equal((await post(ben, "/api/friends/request", { username: "nobody" })).status, 404);
  assert.equal((await post(ben, "/api/friends/request", { username: "amy" }, { origin: "https://evil.example" })).status, 403);

  const sent = await post(ben, "/api/friends/request", { username: "@AMY" });
  assert.deepEqual(sent.body.outgoing, [{ username: "amy", name: "Amy", since: sent.body.outgoing[0].since }]);
  assert.equal((await post(ben, "/api/friends/accept", { username: "amy" })).status, 404, "you can't accept your own request");
  const waiting = await request(app, { path: "/api/friends", cookie: amy });
  assert.deepEqual(waiting.body.incoming.map((p) => [p.username, p.name]), [["ben", "@ben"]], "no display name falls back to the username");
  assert.equal((await request(app, { path: "/api/profile?username=amy", cookie: ben })).status, 404, "pending isn't friends");

  const accepted = await post(amy, "/api/friends/accept", { username: "ben" });
  assert.deepEqual(accepted.body.friends.map((p) => p.username), ["ben"]);
  assert.ok(!JSON.stringify(accepted.body).includes("@example.com"), "friend lists carry no emails");

  const seen = (await request(app, { path: "/api/profile?username=amy", cookie: ben })).body.profile;
  assert.equal(seen.username, "amy");
  assert.equal(seen.name, "Amy");
  assert.ok(seen.badges.some((b) => b.id === "vip"), "Amy's VIP badge shows");
  assert.ok(seen.badges.some((b) => b.id === "bench-2"));
  assert.equal(seen.ratios["b_bench-press"], 1.75);
  assert.deepEqual(seen.pinned.heaviest.weight, 225);
  const text = JSON.stringify(seen);
  assert.ok(!text.includes("secret note") && !text.includes("Pizza") && !text.includes("150") && !text.includes("@example.com"), "no notes, meals, bodyweight or emails");

  await post(amy, "/api/sync", { since: 0, changes: [{ id: "settings", kind: "settings", updatedAt: 2, pinnedLift: "b_bench-press", share: { lifts: false, workouts: false, ratios: false } }] });
  const hidden = (await request(app, { path: "/api/profile?username=amy", cookie: ben })).body.profile;
  assert.equal(hidden.lifts, null);
  assert.equal(hidden.recent, null);
  assert.equal(hidden.ratios, null);
  assert.equal(hidden.pinned.name, "Bench Press", "a pinned lift is always shown");

  await store.removeUser("amy@example.com");
  assert.deepEqual((await request(app, { path: "/api/friends", cookie: ben })).body.friends, [], "removed people drop off");
  assert.equal((await request(app, { path: "/api/profile?username=amy", cookie: ben })).status, 404);
});

test("mutual requests make friends, either side can remove, and the leaderboard ranks friends", async () => {
  const { app, amy, ben, post } = await members();
  await post(amy, "/api/account", { username: "amy" });
  await post(ben, "/api/account", { username: "ben" });
  const now = Date.now();
  const lift = (id, weight) => ({ id, kind: "workout", updatedAt: 1, name: "Push", startedAt: now - 3_600_000, finishedAt: now - 1_800_000, entries: [{ exerciseId: "b_bench-press", sets: [{ done: true, weight, reps: 1 }] }] });
  await post(amy, "/api/sync", { since: 0, changes: [lift("a1", 100), { id: "settings", kind: "settings", updatedAt: 1, unit: "kg" }] });
  await post(ben, "/api/sync", { since: 0, changes: [lift("b1", 200), lift("b2", 185)] });

  await post(amy, "/api/friends/request", { username: "ben" });
  const both = await post(ben, "/api/friends/request", { username: "amy" });
  assert.deepEqual(both.body.friends.map((p) => p.username), ["amy"]);

  const board = (await request(app, { path: "/api/friends/leaderboard?key=b_bench-press", cookie: amy })).body;
  assert.deepEqual(board.week.map((row) => [row.username, row.value, row.me]), [["ben", 2, false], ["amy", 1, true]]);
  assert.equal(board.lift.unit, "kg", "in the viewer's unit");
  assert.deepEqual(board.lift.rows.map((row) => [row.username, row.value]), [["amy", 100], ["ben", 90.72]]);
  assert.ok(!JSON.stringify(board).includes("@example.com"));

  await post(amy, "/api/friends/remove", { username: "ben" });
  assert.deepEqual((await request(app, { path: "/api/friends", cookie: ben })).body, { ok: true, friends: [], incoming: [], outgoing: [], blocked: [] });
  assert.equal((await request(app, { path: "/api/profile", cookie: amy })).body.profile.username, "amy", "your own profile needs no friendship");
});

test("blocking ends a friendship and hides you both; reports reach admins", async () => {
  const { store, app, amy, ben, post } = await members();
  await post(amy, "/api/account", { username: "amy" });
  await post(ben, "/api/account", { username: "ben" });
  await post(amy, "/api/friends/request", { username: "ben" });
  await post(ben, "/api/friends/accept", { username: "amy" });
  assert.equal((await post(ben, "/api/friends/block", { username: "amy" }, { origin: "https://evil.example" })).status, 403);

  const blocked = await post(ben, "/api/friends/block", { username: "amy" });
  assert.deepEqual(blocked.body.friends, [], "the friendship ends");
  assert.deepEqual(blocked.body.blocked, [{ username: "amy", name: "Amy" }]);
  assert.deepEqual((await request(app, { path: "/api/friends", cookie: amy })).body.blocked, [], "you don't see who blocked you");
  assert.equal((await post(amy, "/api/friends/request", { username: "ben" })).status, 404, "a blocker looks like no one");
  assert.equal((await post(ben, "/api/friends/request", { username: "amy" })).status, 404, "and it works both ways");
  assert.equal((await request(app, { path: "/api/profile?username=ben", cookie: amy })).status, 404);
  assert.deepEqual((await post(ben, "/api/friends/unblock", { username: "amy" })).body.blocked, []);
  assert.equal((await post(amy, "/api/friends/request", { username: "ben" })).status, 200, "unblocked, requests work again");

  assert.equal((await post(amy, "/api/friends/report", { username: "ben", reason: "nope" })).status, 400);
  assert.equal((await post(amy, "/api/friends/report", { username: "ben", reason: "name", note: "  rude name  " })).status, 200);
  assert.equal((await request(app, { path: "/api/admin/reports", cookie: amy })).status, 403, "admins only");
  const listed = (await request(app, { path: "/api/admin/reports", cookie: signedIn })).body.reports;
  assert.deepEqual(listed.map((r) => [r.reporterUsername, r.reportedUsername, r.reason, r.note]), [["amy", "ben", "name", "rude name"]]);
  const dismissed = await request(app, { method: "POST", path: "/api/admin/reports/dismiss", cookie: signedIn, body: { id: listed[0].id } });
  assert.deepEqual(dismissed.body.reports, []);
  assert.equal((await post(amy, "/api/account", { name: "Big C0ck" })).status, 400, "names are filtered");
  assert.equal((await post(amy, "/api/account", { username: "sh1t_lifter" })).status, 400);
  assert.equal((await store.getUser("amy@example.com")).name, "Amy");
});

test("deleting an account removes everything in it and ends every session", async () => {
  const { store, app, amy, ben, post } = await members();
  await post(amy, "/api/account", { username: "amy" });
  await post(ben, "/api/account", { username: "ben" });
  await post(amy, "/api/sync", { since: 0, changes: [record("w1", 100)] });
  await post(ben, "/api/sync", { since: 0, changes: [record("w1", 100)] });
  await post(amy, "/api/friends/request", { username: "ben" });
  await post(ben, "/api/friends/accept", { username: "amy" });
  await post(ben, "/api/friends/report", { username: "amy", reason: "spam" });
  await post(amy, "/api/friends/block", { username: "ben" });

  assert.equal((await post(amy, "/api/account/delete", {}, { origin: "https://evil.example" })).status, 403);
  const gone = await post(amy, "/api/account/delete", {});
  assert.equal(gone.status, 200);
  assert.match(cookieFrom(gone, SESSION_COOKIE), /^lift_session=$/, "signed out");
  assert.equal(await store.getUser("amy@example.com"), null);
  assert.deepEqual(await store.forOwner("amy@example.com").changesSince(0), []);
  assert.deepEqual(await store.listReports(), []);
  assert.equal(await store.isBlocked("amy@example.com", "ben@example.com"), false);
  assert.equal((await store.forOwner("ben@example.com").changesSince(0)).length, 1, "other accounts keep their records");
  assert.deepEqual((await request(app, { path: "/api/friends", cookie: ben })).body.friends, []);
  assert.equal((await request(app, { path: "/api/session", cookie: amy })).body.signedIn, false);

  // Invited again (or open sign-up): the old session still doesn't work.
  await store.putUser({ email: "amy@example.com", vip: false, createdAt: Date.now() + 1 });
  assert.equal((await request(app, { path: "/api/session", cookie: amy })).body.signedIn, false, "sessions from before the deletion stay dead");
  assert.equal((await request(app, { method: "POST", path: "/api/account/delete", cookie: signedIn, body: {} })).status, 400, "admins delete themselves in ADMIN_EMAILS");
});

test("Sign in with Apple posts back with a verified email, and deleting the account revokes it", async () => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const appleEnv = { ...env, APPLE_CLIENT_ID: "com.example.lift.web", APPLE_TEAM_ID: "TEAM", APPLE_KEY_ID: "KEY", APPLE_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).replace(/\n/g, "\\n") };
  const calls = [];
  const claims = { iss: "https://appleid.apple.com", aud: "com.example.lift.web", exp: Math.floor(Date.now() / 1000) + 600, email: "Ann@privaterelay.appleid.com", email_verified: "true" };
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), body: new URLSearchParams(init.body) });
    const idToken = `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.y`;
    return { ok: true, json: async () => ({ id_token: idToken, refresh_token: "apple-refresh" }) };
  };
  const store = new MemoryStore();
  const app = createApp({ store, env: { ...appleEnv, OPEN_SIGNUP: "1" }, fetchImpl });
  assert.deepEqual((await request(app, { path: "/api/session" })).body.providers, ["apple", "github"]);

  const start = await request(app, { path: "/api/auth/login?provider=apple" });
  assert.match(start.headers.location, /^https:\/\/appleid\.apple\.com\/auth\/authorize\?.*response_mode=form_post/);
  assert.match([].concat(start.headers["set-cookie"]).join(), /lift_oauth_state=.*SameSite=None/, "the state cookie survives Apple's cross-site post");
  const state = new URL(start.headers.location).searchParams.get("state");
  const form = { code: "c", state, user: JSON.stringify({ name: { firstName: "Ann", lastName: "Lee" } }) };
  assert.match((await request(app, { method: "POST", path: "/api/auth/apple/callback", form: { ...form, state: "bad" }, cookie: cookieFrom(start, "lift_oauth_state"), origin: "https://appleid.apple.com" })).headers.location, /signin=expired/);
  const back = await request(app, { method: "POST", path: "/api/auth/apple/callback", form, cookie: cookieFrom(start, "lift_oauth_state"), origin: "https://appleid.apple.com" });
  assert.equal(back.headers.location, "/");
  const client = calls[0].body.get("client_secret").split(".");
  assert.equal(JSON.parse(Buffer.from(client[0], "base64url")).alg, "ES256");
  assert.equal(Buffer.from(client[2], "base64url").length, 64, "a raw P-256 signature");
  const row = await store.getUser("ann@privaterelay.appleid.com");
  assert.equal(row.name, "Ann Lee", "the name Apple sends once is kept");
  assert.ok(row.appleToken && !row.appleToken.includes("apple-refresh"), "the refresh token is stored encrypted");
  assert.ok(!JSON.stringify((await request(app, { path: "/api/admin/users", cookie: signedIn })).body).includes(row.appleToken), "admins never see it");

  const session = cookieFrom(back, SESSION_COOKIE);
  assert.equal((await request(app, { method: "POST", path: "/api/account/delete", cookie: session, body: {} })).status, 200);
  const revoke = calls.find((call) => call.url.endsWith("/auth/revoke"));
  assert.equal(revoke.body.get("token"), "apple-refresh");
  assert.equal(revoke.body.get("token_type_hint"), "refresh_token");

  claims.email_verified = "false";
  const again = await request(app, { path: "/api/auth/login?provider=apple" });
  const refused = await request(app, { method: "POST", path: "/api/auth/apple/callback", form: { code: "c", state: new URL(again.headers.location).searchParams.get("state") }, cookie: cookieFrom(again, "lift_oauth_state") });
  assert.match(refused.headers.location, /signin=failed/);
});

test("the iOS app signs in through the browser with PKCE and uses a bearer token", async () => {
  const store = new MemoryStore();
  await store.putUser({ email: "friend@example.com", vip: false, createdAt: 1 });
  const app = createApp({ store, env, fetchImpl: providers({ email: "friend@example.com", name: "Friend" }) });
  const NATIVE = "capacitor://localhost";
  const verifier = "v".repeat(50);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  assert.equal((await request(app, { path: "/api/auth/login?provider=github&client=ios&challenge=short" })).status, 400, "PKCE is required");

  const start = await request(app, { path: `/api/auth/login?provider=github&client=ios&challenge=${challenge}` });
  const state = new URL(start.headers.location).searchParams.get("state");
  const cookies = [cookieFrom(start, "lift_oauth_state"), cookieFrom(start, "lift_native")].join("; ");
  const back = await request(app, { path: `/api/auth/callback?code=c&state=${state}`, cookie: cookies });
  assert.match(back.headers.location, /^lift:\/\/auth\?code=/, "the browser hands the code back to the app");
  assert.equal(cookieFrom(back, SESSION_COOKIE), undefined, "no web session for an app sign-in");
  const code = new URL(back.headers.location).searchParams.get("code");

  const exchange = (body) => request(app, { method: "POST", path: "/api/auth/token", body, origin: NATIVE });
  assert.equal((await exchange({ code, verifier: "w".repeat(50) })).status, 400, "the wrong verifier fails");
  const traded = await exchange({ code, verifier });
  assert.equal(traded.status, 200);
  assert.equal(traded.headers["access-control-allow-origin"], NATIVE);
  assert.equal((await exchange({ code, verifier })).status, 400, "a code works once");

  const bearer = { authorization: `Bearer ${traded.body.token}` };
  assert.equal((await request(app, { path: "/api/session", origin: NATIVE, headers: bearer })).body.user.email, "friend@example.com");
  const synced = await request(app, { method: "POST", path: "/api/sync", origin: NATIVE, headers: bearer, body: { since: 0, changes: [record("w1", 100)] } });
  assert.equal(synced.body.accepted, 1, "bearer writes need no origin check");
  assert.equal((await request(app, { method: "POST", path: "/api/sync", origin: NATIVE, cookie: sessionFor("friend@example.com"), body: { since: 0, changes: [] } })).status, 403, "cookie writes still do");
  assert.equal((await request(app, { path: "/api/session", headers: { authorization: "Bearer nonsense" } })).body.signedIn, false);

  const preflight = await request(app, { method: "OPTIONS", path: "/api/sync", origin: NATIVE });
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers["access-control-allow-headers"], /authorization/);
  const other = await request(app, { path: "/api/session", origin: "https://evil.example", headers: bearer });
  assert.equal(other.headers["access-control-allow-origin"], undefined, "only the app's origin gets CORS");

  await request(app, { method: "POST", path: "/api/account/delete", origin: NATIVE, headers: bearer, body: {} });
  assert.equal((await request(app, { path: "/api/session", origin: NATIVE, headers: bearer })).body.signedIn, false, "deleting the account ends the app's token too");

  const stranger = createApp({ store, env, fetchImpl: providers({ email: "stranger@example.com" }) });
  const again = await request(stranger, { path: `/api/auth/login?provider=github&client=ios&challenge=${challenge}` });
  const refused = await request(stranger, { path: `/api/auth/callback?code=c&state=${new URL(again.headers.location).searchParams.get("state")}`, cookie: [cookieFrom(again, "lift_oauth_state"), cookieFrom(again, "lift_native")].join("; ") });
  assert.equal(refused.headers.location, "lift://auth?error=denied", "a refused sign-in goes back to the app");
});

// ---------- Claude and splits over the connector ----------

const CLAUDE = "https://claude.ai/api/mcp/auth_callback";

// The connect flow for any assistant, showing the approval page on the way.
async function connectAt(app, redirect, registered = redirect) {
  const client = (await register(app, [registered])).body.client_id;
  const page = await request(app, { path: authorizePath(client, { redirect_uri: redirect, resource: `${ORIGIN}/api/mcp` }), cookie: signedIn });
  const approved = await request(app, { method: "POST", path: "/api/oauth/authorize", cookie: signedIn, form: { ...approval(client), redirect_uri: redirect, resource: `${ORIGIN}/api/mcp` } });
  const location = new URL(approved.headers.location);
  const tokens = await request(app, { method: "POST", path: "/api/oauth/token", origin: undefined, form: { grant_type: "authorization_code", code: location.searchParams.get("code"), client_id: client, redirect_uri: redirect, code_verifier: verifier, resource: `${ORIGIN}/api/mcp` } });
  return { client, page, location, tokens: tokens.body };
}

const phoneSync = (app, changes = [], since = 0) => request(app, { method: "POST", path: "/api/sync", cookie: signedIn, body: { since, changes } });

const SKI_DAYS = [
  { name: "Legs", exercises: [{ exercise_id: "b_back-squat", sets: 4, rep_min: 5, rep_max: 8, rest_sec: 180 }, { exercise_id: "b_walking-lunge" }] },
  { name: "Rest", rest: true, exercises: [{ exercise_id: "b_back-squat" }] },
  { name: "Power", exercises: [{ exercise_id: "b_box-jumps", superset: "a" }, { exercise_id: "b_wall-sit", superset: "a" }] }
];

test("Claude's apps connect the way Anthropic documents, with refresh and the newest protocol", async () => {
  const app = createApp({ store: new MemoryStore(), env });
  const { page, location, client, tokens } = await connectAt(app, CLAUDE);
  assert.match(page.body, /returns you to <b>claude\.ai<\/b>/);
  assert.equal(location.origin + location.pathname, CLAUDE);
  assert.equal(tokens.token_type, "Bearer");

  assert.equal((await rpc(app, tokens.access_token, "initialize", { protocolVersion: "2025-11-25" })).body.result.protocolVersion, "2025-11-25");
  assert.equal((await rpc(app, tokens.access_token, "initialize", { protocolVersion: "2099-01-01" })).body.result.protocolVersion, "2025-11-25", "an unknown version gets the newest");

  const logged = await callTool(app, tokens.access_token, "log_meal", { name: "Oats", calories: 300, protein: 12, carbs: 50, fat: 6 });
  assert.equal(logged.structuredContent.logged.source, "claude", "meals say who logged them");

  const refreshed = await request(app, { method: "POST", path: "/api/oauth/token", origin: undefined, form: { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: client } });
  assert.equal(refreshed.status, 200);
  assert.ok((await callTool(app, refreshed.body.access_token, "get_splits")).structuredContent.splits, "still Claude's tools after a refresh");
  const reused = await request(app, { method: "POST", path: "/api/oauth/token", origin: undefined, form: { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: client } });
  assert.equal(reused.body.error, "invalid_grant", "a refresh token still works once");

  const csp = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")).headers[0].headers.find((h) => h.key === "Content-Security-Policy").value;
  for (const host of ["https://claude.ai", "http://localhost:*", "http://127.0.0.1:*", "https://chatgpt.com"]) assert.ok(csp.includes(host), `form-action lets the approval redirect to ${host}`);
});

test("Claude Code's loopback redirect matches on any port, and nothing else does", async () => {
  const app = createApp({ store: new MemoryStore(), env });
  const { page, location, tokens } = await connectAt(app, "http://localhost:3118/callback", "http://localhost/callback");
  assert.match(page.body, /a program on this device \(<b>localhost:3118<\/b>\)/, "the approval page warns about local programs");
  assert.equal(location.port, "3118");
  assert.ok(tokens.access_token);
  assert.ok((await connectAt(app, "http://127.0.0.1:50123/callback", "http://127.0.0.1:1/callback")).tokens.access_token);

  const client = (await register(app, ["http://localhost/callback"])).body.client_id;
  for (const redirect of ["http://localhost:3118/other", "http://127.0.0.1:3118/callback", "https://localhost:3118/callback"]) {
    assert.equal((await request(app, { path: authorizePath(client, { redirect_uri: redirect }), cookie: signedIn })).status, 400, redirect);
  }
  assert.equal((await register(app, ["http://localhost.evil.example/callback"])).status, 400);
  assert.equal((await register(app, ["https://claude.ai.evil.example/api/mcp/auth_callback"])).status, 400);
  const chatgpt = (await register(app)).body.client_id;
  assert.equal((await request(app, { path: authorizePath(chatgpt, { redirect_uri: "https://chatgpt.com:8443/connector_platform_oauth_redirect" }), cookie: signedIn })).status, 400, "only loopback ignores the port");

  // The code stays tied to the exact address it was issued for.
  const approved = await request(app, { method: "POST", path: "/api/oauth/authorize", cookie: signedIn, form: { ...approval(client), redirect_uri: "http://localhost:4000/callback" } });
  const code = new URL(approved.headers.location).searchParams.get("code");
  const other = await request(app, { method: "POST", path: "/api/oauth/token", origin: undefined, form: { grant_type: "authorization_code", code, client_id: client, redirect_uri: "http://localhost:4001/callback", code_verifier: verifier } });
  assert.equal(other.body.error, "invalid_grant");
});

test("a connection approved before the split tools keeps only what it agreed to", async () => {
  const app = createApp({ store: new MemoryStore(), env });
  const token = seal("access", { sub: "zach@example.com", c: "old", v: "1", t: Date.now() }, SECRET, { ttl: 60_000 });
  const names = (await rpc(app, token, "tools/list")).body.result.tools.map((t) => t.name);
  assert.deepEqual(names, ["log_meal", "update_meal", "delete_meal", "get_day", "get_coaching_context"]);
  const refused = await callTool(app, token, "create_split", { name: "Sneaky", days: SKI_DAYS });
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /add it again/);
  assert.equal((await callTool(app, token, "log_meal", { name: "Eggs", calories: 200, protein: 14, carbs: 1, fat: 15 })).structuredContent.logged.source, "chatgpt");
  assert.equal((await phoneSync(app)).body.records.filter((r) => r.kind === "split").length, 0);
});

test("a split Claude creates reaches the phone in the app's format and doesn't replace the current one", async () => {
  const app = createApp({ store: new MemoryStore(), env });
  const token = (await connectAt(app, CLAUDE)).tokens.access_token;
  const old = [
    { id: "d1", kind: "splitDay", name: "Push", position: 0, exercises: [{ exerciseId: "b_bench-press", targetSets: 3, repMin: 5, repMax: 8, restSec: 180 }], updatedAt: 1 },
    { id: "d2", kind: "splitDay", name: "Pull", position: 1, exercises: [], updatedAt: 1 }
  ];
  const logged = { id: "w1", kind: "workout", splitDayId: "d1", name: "Push", startedAt: 1000, finishedAt: 2000, entries: [], updatedAt: 1 };
  const settingsRecord = { id: "settings", kind: "settings", defaultRest: 100, updatedAt: 1 };
  const { cursor } = (await phoneSync(app, [...old, logged, settingsRecord])).body;

  // An account from before several splits: one unnamed split, already current.
  const before = (await callTool(app, token, "get_splits")).structuredContent;
  assert.equal(before.current_split_id, "split_main");
  assert.equal(before.next_day, "Pull");
  assert.deepEqual(before.splits.map((s) => [s.name, s.current, s.days.length]), [["My split", true, 2]]);

  const args = { name: "Ski season prep", days: SKI_DAYS, ref: "ski-1" };
  const created = await callTool(app, token, "create_split", args);
  assert.equal(created.isError, false);
  const ski = created.structuredContent.created;
  assert.equal(ski.current, false);
  assert.match(created.structuredContent.next_step, /Make current/);
  assert.equal(ski.days[1].exercises.length, 0, "rest days have no exercises");
  assert.equal(ski.days[2].exercises[0].superset, "A");
  assert.equal((await callTool(app, token, "create_split", args)).structuredContent.already_existed, true, "a retry changes nothing");

  const pulled = (await phoneSync(app, [], cursor)).body.records;
  assert.deepEqual(pulled.map((r) => r.kind).sort(), ["split", "splitDay", "splitDay", "splitDay"], "only the new records, and no settings or workouts");
  const record = pulled.find((r) => r.kind === "split");
  assert.equal(record.source, "claude");
  const legs = pulled.find((r) => r.name === "Legs");
  assert.equal(legs.splitId, record.id);
  assert.equal(legs.position, 0);
  assert.ok(legs.updatedAt > 0);
  assert.deepEqual(legs.exercises[0], { exerciseId: "b_back-squat", targetSets: 4, repMin: 5, repMax: 8, restSec: 180 });
  assert.deepEqual(legs.exercises[1], { exerciseId: "b_walking-lunge", targetSets: 3, repMin: 8, repMax: 12, restSec: 100 }, "the user's usual rest by default");

  const context = async () => (await callTool(app, token, "get_coaching_context")).structuredContent;
  assert.equal((await context()).nextWorkout, "Pull", "still training the old split");
  assert.equal((await context()).currentSplit, "My split");
  assert.equal((await context()).setsPerMuscle.split.quads, undefined, "the coach only reads the current split");

  // The phone chooses it, then goes back: each split keeps its place.
  await phoneSync(app, [{ ...settingsRecord, currentSplit: record.id, updatedAt: Date.now() + 1000 }]);
  assert.equal((await callTool(app, token, "get_splits")).structuredContent.current_split_id, record.id);
  assert.equal((await context()).currentSplit, "Ski season prep");
  assert.equal((await context()).nextWorkout, "Legs", "a new split starts at day one");
  await phoneSync(app, [{ ...settingsRecord, currentSplit: "split_main", updatedAt: Date.now() + 2000 }]);
  assert.equal((await context()).nextWorkout, "Pull", "the old rotation picks up where it was");
});

test("update_split edits days by id, keeps their place and can't reach another split's days", async () => {
  const app = createApp({ store: new MemoryStore(), env });
  const token = (await connectAt(app, CLAUDE)).tokens.access_token;
  await phoneSync(app, [{ id: "d1", kind: "splitDay", name: "Push", position: 0, exercises: [{ exerciseId: "b_bench-press", targetSets: 3, repMin: 5, repMax: 8, restSec: 180 }], updatedAt: 1 }, { id: "d2", kind: "splitDay", name: "Pull", position: 1, exercises: [], updatedAt: 1 }]);
  const ski = (await callTool(app, token, "create_split", { name: "Ski", days: SKI_DAYS })).structuredContent.created;

  const renamed = await callTool(app, token, "update_split", { id: "split_main", name: "Hypertrophy", days: [{ id: "d2", name: "Pull day" }, { id: "d1", name: "Push" }, { name: "Arms", exercises: [{ exercise_id: "b_barbell-curl" }] }] });
  assert.equal(renamed.isError, false);
  assert.deepEqual(renamed.structuredContent.updated.days.map((d) => d.name), ["Pull day", "Push", "Arms"]);
  assert.equal(renamed.structuredContent.updated.days[1].exercises[0].exercise_id, "b_bench-press", "leaving exercises out keeps them");
  assert.equal(renamed.structuredContent.updated.name, "Hypertrophy");
  assert.equal(renamed.structuredContent.updated.current, true);

  const records = (await phoneSync(app)).body.records;
  assert.equal(records.find((r) => r.id === "d1").splitId, undefined, "the main split's days keep the old format");
  assert.equal(records.find((r) => r.id === "d1").position, 1);

  const dropped = await callTool(app, token, "update_split", { id: ski.id, days: [{ id: ski.days[0].id, name: "Legs" }] });
  assert.equal(dropped.structuredContent.updated.days.length, 1);
  const tombstones = (await phoneSync(app)).body.records.filter((r) => r.splitId === ski.id && r.deleted);
  assert.equal(tombstones.length, 2, "removed days become tombstones so the phone drops them too");

  assert.equal((await callTool(app, token, "update_split", { id: ski.id, days: [{ id: "d1", name: "Stolen" }] })).isError, true);
  assert.equal((await callTool(app, token, "update_split", { id: ski.id, days: [{ id: ski.days[0].id, name: "A" }, { id: ski.days[0].id, name: "B" }] })).isError, true);
  assert.equal((await callTool(app, token, "update_split", { id: "nope", name: "x" })).isError, true);
  assert.equal((await callTool(app, token, "update_split", { id: ski.id, current: true, name: "Ski 2" })).structuredContent.updated.current, false, "it can't make a split current");
});

test("create_split checks its input, and exercises can be read and added", async () => {
  const app = createApp({ store: new MemoryStore(), env });
  const token = (await connectAt(app, CLAUDE)).tokens.access_token;
  const bad = async (days, name = "X") => (await callTool(app, token, "create_split", { name, days }));
  assert.match((await bad([{ name: "A", exercises: [{ exercise_id: "b_nope" }] }])).content[0].text, /get_exercises/);
  assert.match((await bad([{ name: "A", exercises: [{ exercise_id: "b_back-squat", sets: 99 }] }])).content[0].text, /sets/);
  assert.match((await bad([{ name: "A", exercises: [{ exercise_id: "b_back-squat" }, { exercise_id: "b_back-squat" }] }])).content[0].text, /twice/);
  assert.equal((await bad([])).isError, true);
  assert.equal((await bad([{ name: " " }])).isError, true);
  assert.equal((await bad(Array.from({ length: 15 }, (_, i) => ({ name: `D${i}` })))).isError, true);
  assert.equal((await bad([{ name: "A" }], " ")).isError, true);
  assert.equal((await phoneSync(app)).body.records.length, 0, "a refused split writes nothing");

  const quads = (await callTool(app, token, "get_exercises", { muscle: "quads" })).structuredContent.exercises;
  assert.ok(quads.some((e) => e.id === "b_back-squat"));
  assert.ok(quads.every((e) => e.muscle === "quads"));
  assert.deepEqual((await callTool(app, token, "get_exercises", { search: "wall sit" })).structuredContent.exercises.map((e) => e.track), ["timed"]);

  const made = await callTool(app, token, "create_exercise", { name: "Skater Bounds", muscle: "glutes", equipment: "bodyweight", track: "timed" });
  assert.equal(made.structuredContent.already_existed, false);
  const again = await callTool(app, token, "create_exercise", { name: "skater bounds", muscle: "quads" });
  assert.equal(again.structuredContent.exercise.id, made.structuredContent.exercise.id, "the same name doesn't add a copy");
  assert.equal((await callTool(app, token, "create_exercise", { name: "Y", muscle: "nose" })).isError, true);
  assert.equal((await callTool(app, token, "create_split", { name: "Ski", days: [{ name: "A", exercises: [{ exercise_id: made.structuredContent.exercise.id }] }] })).isError, false);
  const stored = (await phoneSync(app)).body.records.find((r) => r.kind === "exercise");
  assert.deepEqual([stored.name, stored.muscle, stored.equipment, stored.track, stored.deleted], ["Skater Bounds", "glutes", "bodyweight", "timed", false]);
});

test("the connector never lists or touches logged workouts, and splits stay per account", async () => {
  const names = (await import("../server/mcp.js")).TOOLS.map((t) => t.name);
  assert.ok(!names.some((name) => /workout/.test(name)));
  const app = createApp({ store: new MemoryStore(), env: { ...env, ADMIN_EMAILS: "zach@example.com,other@example.com" } });
  const token = (await connectAt(app, CLAUDE)).tokens.access_token;
  await callTool(app, token, "create_split", { name: "Mine", days: SKI_DAYS });
  const other = seal("access", { sub: "other@example.com", c: "x", v: "1", t: Date.now(), a: "claude" }, SECRET, { ttl: 60_000 });
  assert.deepEqual((await callTool(app, other, "get_splits")).structuredContent.splits.map((s) => s.name), ["My split"]);
  const mine = (await callTool(app, token, "get_splits")).structuredContent.splits.find((s) => s.name === "Mine");
  assert.equal((await callTool(app, other, "update_split", { id: mine.id, name: "Stolen" })).isError, true);
});

test("sync accepts split records, tombstones included", () => {
  const [kept, tombstone] = cleanChanges([{ id: "s1", kind: "split", name: "Ski", updatedAt: 5 }, { id: "s2", kind: "split", name: "Old", deleted: true, updatedAt: 6 }]);
  assert.equal(kept.kind, "split");
  assert.equal(tombstone.deleted, true);
});

test("the iOS sign-in says so when the server can't be reached", async () => {
  const { finishSignIn } = await import("../src/lib/api.js");
  const saved = { fetch: globalThis.fetch, localStorage: globalThis.localStorage };
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: () => "verifier", setItem() {}, removeItem() {} } });
  globalThis.fetch = async () => {
    throw new TypeError("Load failed");
  };
  try {
    assert.equal(await finishSignIn("lift://auth?code=abc"), "offline");
  } finally {
    globalThis.fetch = saved.fetch;
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: saved.localStorage });
  }
});

// ---- Lift Pro through Stripe ----

const billingEnv = { ...env, STRIPE_SECRET_KEY: "test-key", STRIPE_WEBHOOK_SECRET: "test-webhook-secret", STRIPE_PRICE_MONTHLY: "price_month", STRIPE_PRICE_YEARLY: "price_year" };
const DAY = 24 * 60 * 60 * 1000;
const inSeconds = (ms) => Math.floor(ms / 1000);

// A stand-in for Stripe's API; `subs` is what each customer has right now.
function fakeStripe() {
  const fake = { subs: {}, calls: [], fail: false };
  fake.fetchImpl = async (url, init = {}) => {
    const { pathname } = new URL(url);
    fake.calls.push({ method: init.method || "GET", pathname, body: new URLSearchParams(init.body || "") });
    const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (fake.fail) return reply({}, 500);
    if (pathname === "/v1/customers") return reply({ id: "cus_new" });
    if (pathname === "/v1/checkout/sessions") return reply({ url: "https://checkout.example/session" });
    if (pathname === "/v1/billing_portal/sessions") return reply({ url: "https://portal.example/session" });
    if (pathname === "/v1/subscriptions") return reply({ data: fake.subs[new URL(url).searchParams.get("customer")] || [] });
    if (pathname.startsWith("/v1/prices/")) return reply({ unit_amount: pathname.endsWith("month") ? 499 : 3499, currency: "usd" });
    if (pathname.startsWith("/v1/customers/") && init.method === "DELETE") return reply({ deleted: true });
    return reply({}, 404);
  };
  return fake;
}

const sub = (status, end = Date.now() + 30 * DAY, start = Date.now()) => ({ status, items: { data: [{ current_period_start: inSeconds(start), current_period_end: inSeconds(end) }] } });

function billingApp(extra = {}) {
  const store = new MemoryStore();
  const stripe = fakeStripe();
  const anthropic = { beta: { messages: { create: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: "Good week." }] }) } } };
  return { store, stripe, app: createApp({ store, env: billingEnv, fetchImpl: stripe.fetchImpl, anthropic, ...extra }) };
}

function webhook(app, event, { secret = billingEnv.STRIPE_WEBHOOK_SECRET, at = Date.now() } = {}) {
  const raw = JSON.stringify(event);
  const time = inSeconds(at);
  const signature = createHmac("sha256", secret).update(`${time}.${raw}`).digest("hex");
  return request(app, { method: "POST", path: "/api/billing/webhook", origin: undefined, body: event, headers: { "stripe-signature": `t=${time},v1=${signature}` } });
}
const changed = (customer = "cus_1", type = "customer.subscription.updated") => ({ type, data: { object: { customer } } });

async function member(store, email = "amy@example.com", customer = "cus_1") {
  await store.putUser({ email, createdAt: 1 });
  if (customer) await store.setPlan(email, { customer });
  return sessionFor(email);
}
const me = async (app, cookie) => (await request(app, { path: "/api/session", cookie })).body;

test("with Stripe unset, billing is off and everything works as before", async () => {
  const store = new MemoryStore();
  const app = createApp({ store, env });
  const cookie = await member(store);
  const session = await me(app, cookie);
  assert.equal(session.billing, false);
  assert.equal(session.user.pro, false);
  assert.equal((await request(app, { method: "POST", path: "/api/billing/checkout", cookie, body: { interval: "monthly" } })).status, 503);
  assert.equal((await webhook(app, changed())).status, 404);
  assert.equal((await request(app, { method: "POST", path: "/api/account/delete", cookie, body: {} })).status, 200);
  assert.equal(await store.getUser("amy@example.com"), null);
});

test("Pro isn't offered without the weekly review it sells", async () => {
  const store = new MemoryStore();
  const cookie = await member(store);
  const app = createApp({ store, env: billingEnv, fetchImpl: fakeStripe().fetchImpl });
  assert.equal((await me(app, cookie)).billing, false);
});

test("the webhook only accepts Stripe's fresh signature", async () => {
  const { app, store, stripe } = billingApp();
  await member(store);
  stripe.subs.cus_1 = [sub("active")];
  assert.equal((await webhook(app, changed(), { secret: "wrong-secret" })).status, 400);
  assert.equal((await webhook(app, changed(), { at: Date.now() - 10 * 60 * 1000 })).status, 400);
  assert.equal((await request(app, { method: "POST", path: "/api/billing/webhook", origin: undefined, body: changed() })).status, 400);
  assert.equal((await store.getUser("amy@example.com")).planStatus, null);
  assert.equal((await webhook(app, changed())).status, 200);
  assert.equal((await store.getUser("amy@example.com")).planStatus, "active");
  assert.equal((await store.getUser("amy@example.com")).planSource, "stripe");
});

test("webhooks end in the right plan whatever order they arrive in", async () => {
  const { app, store, stripe } = billingApp();
  const cookie = await member(store);
  stripe.subs.cus_1 = [sub("canceled"), sub("active")];
  const deleted = changed("cus_1", "customer.subscription.deleted");
  await webhook(app, changed());
  await webhook(app, deleted);
  await webhook(app, deleted);
  assert.equal((await me(app, cookie)).user.subscribed, true, "an old subscription ending doesn't end the new one");
  stripe.subs.cus_1 = [sub("canceled")];
  await webhook(app, deleted);
  assert.equal((await me(app, cookie)).user.pro, false);
  assert.equal((await webhook(app, changed("cus_stranger"))).status, 200, "an unknown customer is ignored");
  const reads = stripe.calls.filter((call) => call.pathname === "/v1/subscriptions").length;
  await webhook(app, { type: "invoice.paid", data: { object: { customer: "cus_1" } } });
  assert.equal(stripe.calls.filter((call) => call.pathname === "/v1/subscriptions").length, reads, "other events are ignored");
});

test("Pro follows the plan's status and end, with grace; VIPs and admins always have it", async () => {
  const { app, store, stripe } = billingApp();
  const cookie = await member(store);
  const now = Date.now();
  const proWith = async (...subs) => {
    stripe.subs.cus_1 = subs;
    await webhook(app, changed());
    return (await me(app, cookie)).user.pro;
  };
  assert.equal(await proWith(sub("active")), true);
  assert.equal(await proWith(sub("trialing")), true);
  assert.equal(await proWith(sub("active", now - DAY)), true, "within the grace period");
  assert.equal(await proWith(sub("active", now - 4 * DAY)), false, "past the grace period");
  assert.equal(await proWith(sub("past_due", now + 30 * DAY, now - DAY)), true, "a failed renewal gets the grace period");
  assert.equal(await proWith(sub("past_due", now + 30 * DAY, now - 4 * DAY)), false, "not the whole unpaid month");
  assert.equal(await proWith(sub("incomplete")), false);
  assert.equal(await proWith(sub("unpaid")), false);
  assert.equal(await proWith(), false);
  await store.putUser({ ...(await store.getUser("amy@example.com")), vip: true });
  assert.equal((await me(app, cookie)).user.pro, true);
  assert.equal((await me(app, cookie)).user.subscribed, false);
  assert.equal((await me(app, signedIn)).user.pro, true);
});

test("the weekly review needs Pro, and a subscription gets it", async () => {
  const { app, store, stripe } = billingApp();
  const cookie = await member(store);
  const day = new Date().toISOString().slice(0, 10);
  const lifts = [1, 2, 3].map((n) => ({ id: `w${n}`, kind: "workout", updatedAt: n, startedAt: Date.now() - n * 1000, finishedAt: Date.now(), date: day, exercises: [{ exerciseId: "bench", sets: [{ weight: 100, reps: 5, done: true, completedAt: Date.now() }] }] }));
  await request(app, { method: "POST", path: "/api/sync", cookie, body: { since: 0, changes: lifts } });
  const review = () => request(app, { method: "POST", path: "/api/coach/review", cookie, body: { consent: true } });
  const refused = await review();
  assert.equal(refused.status, 403);
  assert.match(refused.body.error, /Lift Pro/);
  assert.equal((await me(app, cookie)).coach, false);
  stripe.subs.cus_1 = [sub("active")];
  await webhook(app, changed());
  assert.equal((await me(app, cookie)).coach, true);
  assert.notEqual((await review()).status, 403);
});

test("saving a user row never undoes a plan", async () => {
  const store = new MemoryStore();
  await store.putUser({ email: "amy@example.com", createdAt: 1 });
  const stale = await store.getUser("amy@example.com");
  await store.setPlan("amy@example.com", { customer: "cus_1", status: "active", until: 123, source: "stripe" });
  await store.putUser({ ...stale, name: "Amy" });
  const row = await store.getUser("amy@example.com");
  assert.deepEqual([row.name, row.stripeCustomer, row.planStatus, row.planUntil, row.planSource], ["Amy", "cus_1", "active", 123, "stripe"]);
  assert.equal((await store.getUserByCustomer("cus_1")).email, "amy@example.com");
});

test("checkout, the portal and prices work on the web", async () => {
  const { app, store, stripe } = billingApp();
  const cookie = await member(store, "amy@example.com", "");
  const post = (path, body = {}, options = {}) => request(app, { method: "POST", path, cookie, body, ...options });
  assert.deepEqual((await request(app, { path: "/api/billing/prices", cookie })).body.prices, { monthly: { amount: 499, currency: "usd" }, yearly: { amount: 3499, currency: "usd" } });
  assert.equal((await post("/api/billing/portal")).status, 409, "no subscription to manage yet");
  assert.equal((await post("/api/billing/checkout", { interval: "weekly" })).status, 400);
  assert.equal((await post("/api/billing/checkout", { interval: "yearly" }, { origin: "https://evil.example" })).status, 403);
  const checkout = await post("/api/billing/checkout", { interval: "yearly" });
  assert.equal(checkout.body.url, "https://checkout.example/session");
  const session = stripe.calls.find((call) => call.pathname === "/v1/checkout/sessions").body;
  assert.equal(session.get("customer"), "cus_new");
  assert.equal(session.get("line_items[0][price]"), "price_year");
  assert.equal(session.get("mode"), "subscription");
  assert.equal((await store.getUser("amy@example.com")).stripeCustomer, "cus_new");
  stripe.calls.length = 0;
  await post("/api/billing/checkout", { interval: "monthly" });
  assert.equal(stripe.calls.some((call) => call.pathname === "/v1/customers"), false, "the customer is reused");
  assert.equal((await post("/api/billing/portal")).body.url, "https://portal.example/session");

  // Back from checkout, without waiting for the webhook.
  stripe.subs.cus_new = [sub("active")];
  const back = await post("/api/billing/sync");
  assert.equal(back.body.user.pro, true);
  assert.equal((await post("/api/billing/checkout", { interval: "monthly" })).status, 409, "already subscribed");
});

test("the iOS app can't reach billing", async () => {
  const { app, store, stripe } = billingApp();
  await member(store);
  const token = createSession({ email: "amy@example.com", name: "" }, SECRET);
  const headers = { authorization: `Bearer ${token}` };
  const asApp = (method, path, body) => request(app, { method, path, body, origin: "capacitor://localhost", headers });
  assert.equal((await asApp("GET", "/api/billing/prices")).status, 403);
  assert.equal((await asApp("POST", "/api/billing/checkout", { interval: "monthly" })).status, 403);
  assert.equal((await asApp("POST", "/api/billing/portal", {})).status, 403);
  assert.equal(stripe.calls.length, 0);
});

test("deleting an account cancels its subscription, or deletes nothing if Stripe fails", async () => {
  const { app, store, stripe } = billingApp();
  const cookie = await member(store);
  stripe.fail = true;
  const failed = await request(app, { method: "POST", path: "/api/account/delete", cookie, body: {} });
  assert.equal(failed.status, 502);
  assert.ok(await store.getUser("amy@example.com"), "the account stays");
  stripe.fail = false;
  assert.equal((await request(app, { method: "POST", path: "/api/account/delete", cookie, body: {} })).status, 200);
  assert.ok(stripe.calls.some((call) => call.method === "DELETE" && call.pathname === "/v1/customers/cus_1"));
  assert.equal(await store.getUser("amy@example.com"), null);
});

test("removing someone as an admin cancels their subscription too", async () => {
  const { app, store, stripe } = billingApp();
  await member(store);
  const remove = () => request(app, { method: "POST", path: "/api/admin/users/remove", cookie: signedIn, body: { email: "amy@example.com" } });
  stripe.fail = true;
  assert.equal((await remove()).status, 502);
  assert.ok(await store.getUser("amy@example.com"));
  stripe.fail = false;
  assert.equal((await remove()).status, 200);
  assert.ok(stripe.calls.some((call) => call.method === "DELETE" && call.pathname === "/v1/customers/cus_1"));
  assert.equal(await store.getUser("amy@example.com"), null);
});

test("Stripe ids stay out of admin and social replies", async () => {
  const { app, store } = billingApp();
  const cookie = await member(store);
  await request(app, { method: "POST", path: "/api/account", cookie, body: { username: "amy_lifts" } });
  const friend = await member(store, "ben@example.com", "");
  await request(app, { method: "POST", path: "/api/account", cookie: friend, body: { username: "ben_lifts" } });
  await request(app, { method: "POST", path: "/api/friends/request", cookie: friend, body: { username: "amy_lifts" } });
  for (const reply of [await request(app, { path: "/api/admin/users", cookie: signedIn }), await request(app, { path: "/api/friends", cookie }), await me(app, cookie)]) {
    assert.doesNotMatch(JSON.stringify(reply), /cus_1|stripeCustomer/);
  }
});

test("listKinds returns each kind's live records for one owner from one call", async () => {
  const store = new MemoryStore();
  const mine = store.forOwner("zach@example.com");
  await mine.upsert([
    { id: "m1", kind: "meal", updatedAt: 1 },
    { id: "m2", kind: "meal", updatedAt: 1, deleted: true },
    { id: "w1", kind: "workout", updatedAt: 1 },
    { id: "s", kind: "settings", updatedAt: 1 }
  ]);
  await store.forOwner("friend@example.com").upsert([{ id: "m3", kind: "meal", updatedAt: 1 }]);
  const lists = await mine.listKinds(["meal", "workout", "bodyweight"]);
  assert.deepEqual(Object.keys(lists), ["meal", "workout", "bodyweight"]);
  assert.deepEqual(lists.meal.map((r) => r.id), ["m1"], "deleted records and other owners' are left out");
  assert.deepEqual(lists.workout.map((r) => r.id), ["w1"]);
  assert.deepEqual(lists.bodyweight, [], "a kind with nothing logged is an empty list");
  for (const kind of ["meal", "workout"]) assert.deepEqual(lists[kind], await mine.listKind(kind), "same as asking kind by kind");

  const calls = [];
  const fake = () => ({ query: async (text, params) => (calls.push({ text, params }), /select kind, doc/.test(text) ? [{ kind: "meal", doc: { id: "m1" } }] : []) });
  const neon = new NeonStore("postgres://example", { neon: fake });
  assert.deepEqual(await neon.forOwner("zach@example.com").listKinds(["meal", "split"]), { meal: [{ id: "m1" }], split: [] });
  assert.ok(calls.at(-1).text.includes("where owner = $1 and kind = any($2::text[]) and not deleted"), "one query for every kind");
  assert.deepEqual(calls.at(-1).params, ["zach@example.com", ["meal", "split"]], "scoped to the owner");
});
