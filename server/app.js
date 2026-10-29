// The Lift API: sign-in with Google or GitHub for the people on the invite
// list (or anyone, with OPEN_SIGNUP), and a single sync endpoint. Each account
// (a verified email) has its own records: the phone keeps its own copy in
// IndexedDB and sends whatever changed; the server keeps the newest copy of
// each record. Admins (ADMIN_EMAILS) manage the invite list and who's a VIP,
// which gets the weekly AI review. ChatGPT connects through OAuth
// (server/oauth.js) to the MCP endpoint (server/mcp.js).
import { readJsonBody, readJsonOrForm } from "./http.js";
import {
  checkOAuthState, clearCookie, cookie, createSession, githubAuthorizeUrl, githubUser, googleAuthorizeUrl, googleUser,
  newOAuthState, normalizeEmail, parseCookies, readSession, SESSION_COOKIE, sessionCookie, STATE_COOKIE
} from "./auth.js";
import { PULL_LIMIT } from "./store.js";
import { writeReview } from "./coach.js";
import { createMcp } from "./mcp.js";
import {
  authorizationServerMetadata, consentPage, exchangeToken, issueCode, oauthConfig, protectedResourceMetadata, readAuthorizeRequest,
  readBearer, redirectWith, registerClient, signInPage
} from "./oauth.js";
import { liftsThisWeek, REVIEW_MIN_LIFTS } from "../src/lib/model.js";

// Where to go after sign-in when it started from the ChatGPT approval page.
const NEXT_COOKIE = "lift_next";
const AUTHORIZE_PATH = "/api/oauth/authorize";

export const KINDS = new Set(["exercise", "splitDay", "workout", "bodyweight", "settings", "meal", "coachReview"]);
const SYNC_LIMIT = 4_000_000;
const MAX_CHANGES = 2000;
const MAX_RECORD = 200_000;

export function appConfig(env = process.env) {
  const emails = (value) => String(value || "").split(",").map(normalizeEmail).filter(Boolean);
  const pair = (id, secret) => (id && secret ? { clientId: id, clientSecret: secret } : null);
  const config = {
    appUrl: String(env.APP_URL || "").replace(/\/$/, ""),
    sessionSecret: env.SESSION_SECRET || "",
    admins: emails(env.ADMIN_EMAILS),
    google: pair(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
    github: pair(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET),
    // Anyone with a Google or GitHub account can sign in, not just invitees.
    openSignup: env.OPEN_SIGNUP === "1",
    // Local testing only: sign in without Google or GitHub. Refused on Vercel.
    devLogin: env.LIFT_DEV_LOGIN === "1" && !env.VERCEL
  };
  config.providers = [config.google && "google", config.github && "github", config.devLogin && "dev"].filter(Boolean);
  const missing = [];
  if (!config.appUrl) missing.push("APP_URL");
  if (!config.sessionSecret) missing.push("SESSION_SECRET");
  else if (config.sessionSecret.length < 32) missing.push("SESSION_SECRET (32+ characters)");
  if (!config.admins.length) missing.push("ADMIN_EMAILS");
  if (!config.providers.length) missing.push("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET");
  return { ...config, missing };
}

function sendJson(res, body, status = 200, headers = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

function sendHtml(res, html, status = 200) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(html);
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

const publicUser = ({ email, name, admin, vip }) => ({ email, name, admin, vip });

// `anthropic` replaces the Claude client in tests.
export function createApp({ store, env = process.env, fetchImpl = fetch, anthropic = null }) {
  const config = appConfig(env);
  const oauth = oauthConfig(env, config);
  const reviews = Boolean(env.ANTHROPIC_API_KEY || anthropic);

  // The account behind an email, if it may use Lift: an admin, someone on
  // the invite list, or anyone when sign-up is open. Checked on every
  // request, so removing someone takes effect right away.
  async function account(value) {
    const email = normalizeEmail(value);
    if (!email) return null;
    const admin = config.admins.includes(email);
    const row = await store.getUser(email);
    if (!admin && !row && !config.openSignup) return null;
    return { email, name: row?.name || "", admin, vip: admin || Boolean(row?.vip), row };
  }

  async function signedIn(req) {
    const session = readSession(parseCookies(req.headers.cookie)[SESSION_COOKIE], config.sessionSecret);
    return session ? account(session.sub) : null;
  }

  // Cookie-authenticated writes must come from the app itself.
  function sameOrigin(req) {
    return Boolean(config.appUrl) && req.headers.origin === config.appUrl;
  }

  async function finishSignIn(req, res, profile) {
    const user = await account(profile.email);
    if (!user) return redirect(res, "/?signin=denied", { "set-cookie": clearCookie(STATE_COOKIE) });
    const now = Date.now();
    await store.putUser({ ...user.row, email: user.email, name: profile.name || user.name, vip: Boolean(user.row?.vip), createdAt: user.row?.createdAt || now, lastSeenAt: now });
    const next = parseCookies(req.headers.cookie)[NEXT_COOKIE] || "";
    return redirect(res, next.startsWith(`${AUTHORIZE_PATH}?`) ? next : "/", {
      "set-cookie": [sessionCookie(createSession({ email: user.email, name: profile.name || user.name }, config.sessionSecret)), clearCookie(STATE_COOKIE), clearCookie(NEXT_COOKIE)]
    });
  }

  async function oauthCallback(req, res, url, read) {
    const stateCookie = parseCookies(req.headers.cookie)[STATE_COOKIE];
    if (!checkOAuthState(stateCookie, url.searchParams.get("state"), config.sessionSecret)) return redirect(res, "/?signin=expired", { "set-cookie": clearCookie(STATE_COOKIE) });
    let profile;
    try {
      profile = await read(url.searchParams.get("code"));
    } catch {
      return redirect(res, "/?signin=failed", { "set-cookie": clearCookie(STATE_COOKIE) });
    }
    return finishSignIn(req, res, profile);
  }

  async function people() {
    const rows = await store.listUsers();
    const listed = new Set(rows.map((row) => row.email));
    const admins = config.admins.filter((email) => !listed.has(email)).map((email) => ({ email, name: "", vip: true, invitedBy: "", createdAt: 0, lastSeenAt: null }));
    return [...admins, ...rows].map((row) => ({ ...row, admin: config.admins.includes(row.email), vip: config.admins.includes(row.email) || row.vip }));
  }

  async function handle(req, res) {
    const url = new URL(req.url, "http://lift.local");
    const path = url.pathname;
    if (config.missing.length) return sendJson(res, { ok: false, error: `Lift isn't configured. Missing: ${config.missing.join(", ")}.` }, 503);

    // ---- sign-in ----
    if (path === "/api/auth/login" && req.method === "GET") {
      const next = url.searchParams.get("next") || "";
      const nextCookie = next.startsWith(`${AUTHORIZE_PATH}?`) ? [cookie(NEXT_COOKIE, next, { maxAge: 600 })] : [];
      const asked = url.searchParams.get("provider") || "";
      const provider = config.providers.includes(asked) ? asked : config.providers.length === 1 ? config.providers[0] : "";
      if (!provider) return sendHtml(res, signInPage({ providers: config.providers, next }));
      if (provider === "dev") {
        const as = normalizeEmail(url.searchParams.get("as")) || config.admins[0];
        return redirect(res, `/api/auth/callback?dev=${encodeURIComponent(as)}`, nextCookie.length ? { "set-cookie": nextCookie } : {});
      }
      const state = newOAuthState(config.sessionSecret);
      const location = provider === "google"
        ? googleAuthorizeUrl({ clientId: config.google.clientId, redirectUri: `${config.appUrl}/api/auth/google/callback`, state: state.nonce })
        : githubAuthorizeUrl({ clientId: config.github.clientId, redirectUri: `${config.appUrl}/api/auth/callback`, state: state.nonce });
      return redirect(res, location, { "set-cookie": [cookie(STATE_COOKIE, state.cookieValue, { maxAge: 600 }), ...nextCookie] });
    }
    if (path === "/api/auth/callback" && req.method === "GET") {
      if (config.devLogin && url.searchParams.has("dev")) return finishSignIn(req, res, { email: url.searchParams.get("dev"), name: "" });
      if (!config.github) return redirect(res, "/?signin=failed");
      const { clientId, clientSecret } = config.github;
      return oauthCallback(req, res, url, (code) => githubUser({ code, clientId, clientSecret, redirectUri: `${config.appUrl}/api/auth/callback`, fetchImpl }));
    }
    if (path === "/api/auth/google/callback" && req.method === "GET") {
      if (!config.google) return redirect(res, "/?signin=failed");
      const { clientId, clientSecret } = config.google;
      return oauthCallback(req, res, url, (code) => googleUser({ code, clientId, clientSecret, redirectUri: `${config.appUrl}/api/auth/google/callback`, fetchImpl }));
    }
    if (path === "/api/auth/logout" && req.method === "POST") {
      return sendJson(res, { ok: true }, 200, { "set-cookie": clearCookie(SESSION_COOKIE) });
    }

    // ---- ChatGPT connector: discovery, OAuth and MCP ----
    if (path === "/.well-known/oauth-protected-resource" || path === "/.well-known/oauth-protected-resource/api/mcp") {
      return sendJson(res, protectedResourceMetadata(config, oauth));
    }
    if (path === "/.well-known/oauth-authorization-server" || path === "/.well-known/oauth-authorization-server/api/mcp") {
      return sendJson(res, authorizationServerMetadata(config));
    }
    if (path === "/api/oauth/register" && req.method === "POST") {
      try {
        return sendJson(res, registerClient(await readJsonBody(req, { limit: 16_000 }), config, oauth), 201);
      } catch (error) {
        if (!error.oauth) throw error;
        return sendJson(res, { error: error.oauth, error_description: error.message }, 400);
      }
    }
    if (path === AUTHORIZE_PATH && (req.method === "GET" || req.method === "POST")) {
      const posted = req.method === "POST";
      if (posted && !sameOrigin(req)) return sendHtml(res, consentPage({ error: "That approval didn't come from Lift." }), 403);
      const params = posted ? await readJsonOrForm(req) : Object.fromEntries(url.searchParams);
      const { fatal, request, error, description } = readAuthorizeRequest(params, config, oauth);
      if (fatal) return sendHtml(res, consentPage({ error: fatal }), 400);
      if (error) return redirect(res, redirectWith(request, { error, error_description: description }));
      const user = await signedIn(req);
      if (!user) {
        if (posted) return sendHtml(res, consentPage({ error: "Your session expired. Start connecting again from ChatGPT." }), 401);
        return redirect(res, `/api/auth/login?next=${encodeURIComponent(`${AUTHORIZE_PATH}?${url.searchParams}`)}`);
      }
      if (!posted) return sendHtml(res, consentPage({ request, login: user.email }));
      if (params.decision !== "allow") return redirect(res, redirectWith(request, { error: "access_denied" }));
      return redirect(res, redirectWith(request, { code: issueCode(request, { sub: user.email }, config) }));
    }
    if (path === "/api/oauth/token" && req.method === "POST") {
      try {
        return sendJson(res, await exchangeToken(await readJsonOrForm(req), { config, oauth, store, allowed: async (sub) => Boolean(await account(sub)) }));
      } catch (error) {
        if (!error.oauth) throw error;
        return sendJson(res, { error: error.oauth, error_description: error.message }, 400);
      }
    }
    if (path === "/api/mcp") {
      if (req.method !== "POST") return sendJson(res, { error: "Use POST." }, 405, { allow: "POST" });
      const token = readBearer(req.headers.authorization, { config, oauth });
      const owner = token ? await account(token.sub) : null;
      if (!owner) {
        return sendJson(res, { error: "invalid_token", error_description: "Connect Lift in ChatGPT to use this." }, 401, {
          "www-authenticate": `Bearer resource_metadata="${config.appUrl}/.well-known/oauth-protected-resource/api/mcp", scope="lift"`
        });
      }
      const reply = await createMcp({ store: store.forOwner(owner.email) }).handle(await readJsonBody(req, { limit: 256_000 }));
      if (!reply) {
        res.writeHead(202, { "cache-control": "no-store" });
        return res.end();
      }
      return sendJson(res, reply);
    }

    // ---- everything else needs a signed-in session ----
    const user = await signedIn(req);
    if (path === "/api/session") {
      if (!user) return sendJson(res, { ok: false, signedIn: false, providers: config.providers });
      return sendJson(res, { ok: true, user: publicUser(user), coach: reviews && user.vip, providers: config.providers });
    }
    if (!user) return sendJson(res, { ok: false, signedIn: false, error: "Sign in to sync." }, 401);
    if (req.method !== "GET" && !sameOrigin(req)) return sendJson(res, { ok: false, error: "Cross-site request refused." }, 403);
    const mine = store.forOwner(user.email);

    // Push what changed on this device, then pull everything newer than `since`.
    if (path === "/api/sync" && req.method === "POST") {
      const body = await readJsonBody(req, { limit: SYNC_LIMIT });
      const since = Math.max(0, Math.floor(Number(body.since) || 0));
      const accepted = await mine.upsert(cleanChanges(body.changes));
      const rows = await mine.changesSince(since, PULL_LIMIT);
      const cursor = rows.length ? rows[rows.length - 1].seq : since;
      // A cursor past the newest record means the database was reset: the
      // device should start over and send everything it has.
      const reset = since > 0 && !rows.length && since > (await mine.head());
      return sendJson(res, { ok: true, accepted, records: rows.map((row) => row.doc), cursor: reset ? 0 : cursor, more: rows.length === PULL_LIMIT, reset });
    }
    // The weekly AI review (needs ANTHROPIC_API_KEY): for VIPs, once they've
    // logged enough lifting that week to review.
    if (path === "/api/coach/review" && req.method === "POST") {
      if (!reviews) return sendJson(res, { ok: false, error: "Add ANTHROPIC_API_KEY to turn on weekly reviews." }, 503);
      if (!user.vip) return sendJson(res, { ok: false, error: "Weekly reviews are for VIP members." }, 403);
      const lifts = liftsThisWeek(await mine.listKind("workout"));
      if (lifts < REVIEW_MIN_LIFTS) return sendJson(res, { ok: false, error: `Log ${REVIEW_MIN_LIFTS} lifts this week to get your review (${lifts} so far).` }, 409);
      return sendJson(res, { ok: true, review: await writeReview({ store: mine, apiKey: env.ANTHROPIC_API_KEY, client: anthropic }) });
    }

    // ---- admins: the invite list ----
    if (path === "/api/admin/users" || path === "/api/admin/users/remove") {
      if (!user.admin) return sendJson(res, { ok: false, error: "Only admins can manage people." }, 403);
      if (req.method === "GET" && path === "/api/admin/users") return sendJson(res, { ok: true, users: await people() });
      if (req.method !== "POST") return sendJson(res, { ok: false, error: "Use POST." }, 405, { allow: "GET, POST" });
      const body = await readJsonBody(req, { limit: 4_000 });
      const email = normalizeEmail(body.email);
      if (!email) return sendJson(res, { ok: false, error: "Enter a valid email." }, 400);
      if (path === "/api/admin/users/remove") {
        if (config.admins.includes(email)) return sendJson(res, { ok: false, error: "Admins are set in ADMIN_EMAILS." }, 400);
        await store.removeUser(email);
      } else {
        const existing = await store.getUser(email);
        await store.putUser({ ...existing, email, name: existing?.name || "", vip: Boolean(body.vip), invitedBy: existing?.invitedBy || user.email, createdAt: existing?.createdAt || Date.now(), lastSeenAt: existing?.lastSeenAt ?? null });
      }
      return sendJson(res, { ok: true, users: await people() });
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
