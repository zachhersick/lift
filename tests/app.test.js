import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { cleanChanges, createApp } from "../server/app.js";
import { MemoryStore, NeonStore } from "../server/store.js";
import { createSession, SESSION_COOKIE } from "../server/auth.js";

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
  assert.deepEqual((await request(app, { path: "/api/session", cookie: signedIn })).body.user, { email: "zach@example.com", name: "", username: null, admin: true, vip: true });
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
  assert.deepEqual((await request(app, { path: "/api/session", cookie: friendCookie })).body.user, { email: "friend@example.com", name: "", username: null, admin: false, vip: true });

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
  const early = await request(app, { method: "POST", path: "/api/coach/review", cookie: signedIn, body: {} });
  assert.equal(early.status, 409, "nothing logged yet");
  assert.equal(early.body.error, "Log 3 lifts this week to get your review (0 so far).");
  const meal = { id: "m1", kind: "meal", updatedAt: 1, date: "2026-10-20", name: "Oats", calories: 600, protein: 40, carbs: 80, fat: 10 };
  const lift = (i) => ({ id: `w${i}`, kind: "workout", updatedAt: 1, startedAt: Date.now() - (i + 1) * 86_400_000, finishedAt: Date.now() - i * 86_400_000, entries: [{ id: `e${i}`, exerciseId: "b_bench-press", sets: [{ id: `s${i}`, weight: 100, reps: 5, type: "working", done: true }] }] });
  await request(app, { method: "POST", path: "/api/sync", cookie: signedIn, body: { since: 0, changes: [meal, lift(0), lift(1)] } });
  assert.match((await request(app, { method: "POST", path: "/api/coach/review", cookie: signedIn, body: {} })).body.error, /\(2 so far\)/);
  await request(app, { method: "POST", path: "/api/sync", cookie: signedIn, body: { since: 0, changes: [lift(2)] } });

  await store.putUser({ email: "friend@example.com", vip: false, createdAt: 1 });
  const friend = sessionFor("friend@example.com");
  assert.equal((await request(app, { path: "/api/session", cookie: friend })).body.coach, false, "not a VIP");
  assert.equal((await request(app, { method: "POST", path: "/api/coach/review", cookie: friend, body: {} })).status, 403);
  assert.equal((await request(app, { path: "/api/session", cookie: signedIn })).body.coach, true);

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
  assert.deepEqual((await request(app, { path: "/api/friends", cookie: ben })).body, { ok: true, friends: [], incoming: [], outgoing: [] });
  assert.equal((await request(app, { path: "/api/profile", cookie: amy })).body.profile.username, "amy", "your own profile needs no friendship");
});
