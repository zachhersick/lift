// The Lift API (lift.zachhersick.com): GitHub sign-in for one account and a
// single sync endpoint. The phone keeps its own copy in IndexedDB and sends
// whatever changed; the server keeps the newest copy of each record.
import { readJsonBody } from "./http.js";
import {
  checkOAuthState, clearCookie, cookie, createSession, githubAuthorizeUrl, githubUser,
  newOAuthState, parseCookies, readSession, SESSION_COOKIE, sessionCookie, STATE_COOKIE
} from "./auth.js";
import { PULL_LIMIT } from "./store.js";

export const KINDS = new Set(["exercise", "splitDay", "workout", "bodyweight", "settings", "meal", "coachReview"]);
const SYNC_LIMIT = 4_000_000;
const MAX_CHANGES = 2000;
const MAX_RECORD = 200_000;

export function appConfig(env = process.env) {
  const config = {
    appUrl: String(env.APP_URL || "").replace(/\/$/, ""),
    clientId: env.GITHUB_CLIENT_ID || "",
    clientSecret: env.GITHUB_CLIENT_SECRET || "",
    sessionSecret: env.SESSION_SECRET || "",
    allowedGithubId: String(env.ALLOWED_GITHUB_ID || ""),
    // Local testing only: sign in without GitHub. Refused on Vercel.
    devLogin: env.LIFT_DEV_LOGIN === "1" && !env.VERCEL
  };
  const missing = ["appUrl", "sessionSecret", "allowedGithubId", ...(config.devLogin ? [] : ["clientId", "clientSecret"])].filter((key) => !config[key]);
  if (config.sessionSecret && config.sessionSecret.length < 32) missing.push("sessionSecret (32+ characters)");
  return { ...config, missing };
}

function sendJson(res, body, status = 200, headers = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

function redirect(res, location, headers = {}) {
  res.writeHead(302, { location, "cache-control": "no-store", ...headers });
  res.end();
}

// Keeps well-formed records only, and the newest one when an id repeats.
export function cleanChanges(changes) {
  if (!Array.isArray(changes)) return [];
  const byId = new Map();
  for (const record of changes.slice(0, MAX_CHANGES)) {
    if (!record || typeof record !== "object" || Array.isArray(record)) continue;
    if (typeof record.id !== "string" || !record.id || record.id.length > 100) continue;
    if (!KINDS.has(record.kind)) continue;
    if (!Number.isFinite(record.updatedAt) || record.updatedAt <= 0) continue;
    if (JSON.stringify(record).length > MAX_RECORD) continue;
    const current = byId.get(record.id);
    if (!current || current.updatedAt < record.updatedAt) byId.set(record.id, { ...record, deleted: Boolean(record.deleted) });
  }
  return [...byId.values()];
}

export function createApp({ store, env = process.env, fetchImpl = fetch }) {
  const config = appConfig(env);

  function session(req) {
    return readSession(parseCookies(req.headers.cookie)[SESSION_COOKIE], config.sessionSecret);
  }

  // Cookie-authenticated writes must come from the app itself.
  function sameOrigin(req) {
    return Boolean(config.appUrl) && req.headers.origin === config.appUrl;
  }

  async function handle(req, res) {
    const url = new URL(req.url, "http://lift.local");
    const path = url.pathname;
    if (config.missing.length) return sendJson(res, { ok: false, error: `Lift isn't configured. Missing: ${config.missing.join(", ")}.` }, 503);

    // ---- sign-in ----
    if (path === "/api/auth/login" && req.method === "GET") {
      if (config.devLogin) return redirect(res, "/api/auth/callback?dev=1");
      const state = newOAuthState(config.sessionSecret);
      return redirect(res, githubAuthorizeUrl({ clientId: config.clientId, redirectUri: `${config.appUrl}/api/auth/callback`, state: state.nonce }), {
        "set-cookie": cookie(STATE_COOKIE, state.cookieValue, { maxAge: 600 })
      });
    }
    if (path === "/api/auth/callback" && req.method === "GET") {
      let user;
      if (config.devLogin && url.searchParams.get("dev") === "1") user = { id: config.allowedGithubId, login: "dev" };
      else {
        const stateCookie = parseCookies(req.headers.cookie)[STATE_COOKIE];
        if (!checkOAuthState(stateCookie, url.searchParams.get("state"), config.sessionSecret)) return redirect(res, "/?signin=expired", { "set-cookie": clearCookie(STATE_COOKIE) });
        try {
          user = await githubUser({ code: url.searchParams.get("code"), clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: `${config.appUrl}/api/auth/callback`, fetchImpl });
        } catch {
          return redirect(res, "/?signin=failed", { "set-cookie": clearCookie(STATE_COOKIE) });
        }
      }
      if (String(user.id) !== config.allowedGithubId) return redirect(res, "/?signin=denied", { "set-cookie": clearCookie(STATE_COOKIE) });
      return redirect(res, "/", { "set-cookie": [sessionCookie(createSession(user, config.sessionSecret)), clearCookie(STATE_COOKIE)] });
    }
    if (path === "/api/auth/logout" && req.method === "POST") {
      return sendJson(res, { ok: true }, 200, { "set-cookie": clearCookie(SESSION_COOKIE) });
    }

    // ---- everything else needs a signed-in session ----
    const user = session(req);
    if (path === "/api/session") {
      return user ? sendJson(res, { ok: true, user: { login: user.login } }) : sendJson(res, { ok: false, signedIn: false });
    }
    if (!user) return sendJson(res, { ok: false, signedIn: false, error: "Sign in to sync." }, 401);
    if (req.method !== "GET" && !sameOrigin(req)) return sendJson(res, { ok: false, error: "Cross-site request refused." }, 403);

    // Push what changed on this device, then pull everything newer than `since`.
    if (path === "/api/sync" && req.method === "POST") {
      const body = await readJsonBody(req, { limit: SYNC_LIMIT });
      const since = Math.max(0, Math.floor(Number(body.since) || 0));
      const accepted = await store.upsert(cleanChanges(body.changes));
      const rows = await store.changesSince(since, PULL_LIMIT);
      const cursor = rows.length ? rows[rows.length - 1].seq : since;
      // A cursor past the newest record means the database was reset: the
      // device should start over and send everything it has.
      const reset = since > 0 && !rows.length && since > (await store.head());
      return sendJson(res, { ok: true, accepted, records: rows.map((row) => row.doc), cursor: reset ? 0 : cursor, more: rows.length === PULL_LIMIT, reset });
    }
    return sendJson(res, { ok: false, error: "Not found." }, 404);
  }

  return {
    config,
    async handle(req, res) {
      try {
        return await handle(req, res);
      } catch (error) {
        if (res.headersSent) return res.end();
        return sendJson(res, { ok: false, error: error.status ? error.message : "Something went wrong." }, error.status || 500);
      }
    }
  };
}
