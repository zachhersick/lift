// The Lift API: sign-in with Apple, Google or GitHub for the people on the
// invite list (or anyone, with OPEN_SIGNUP), and a single sync endpoint. Each account
// (a verified email) has its own records: the phone keeps its own copy in
// IndexedDB and sends whatever changed; the server keeps the newest copy of
// each record. Admins (ADMIN_EMAILS) manage the invite list and who's a VIP,
// which gets the weekly AI review. People add each other as friends and see
// each other's profile summaries (server/social.js), and can block or report
// each other. Anyone can delete their account and everything in it. ChatGPT and
// Claude connect through OAuth (server/oauth.js) to the MCP endpoint (server/mcp.js).
import { randomBytes } from "node:crypto";
import { readJsonBody, readJsonOrForm, readText } from "./http.js";
import { BILLING_EVENTS, bestPlan, billingConfig, createStripe, planActive, verifySignature } from "./billing.js";
import {
  appleAuthorizeUrl, appleUser, checkOAuthState, clearCookie, cookie, createSession, decryptText, encryptText, githubAuthorizeUrl, githubUser,
  googleAuthorizeUrl, googleUser, NATIVE_ORIGIN, NATIVE_REDIRECT, nativeCode, newOAuthState, normalizeEmail, parseCookies, readNativeCode, readSession,
  revokeApple, SESSION_COOKIE, sessionCookie, STATE_COOKIE
} from "./auth.js";
import { PULL_LIMIT } from "./store.js";
import { writeReview } from "./coach.js";
import { displayName, friendships, leaderboardFor, publicPeople, summaryFor } from "./social.js";
import { createMcp } from "./mcp.js";
import {
  authorizationServerMetadata, consentPage, exchangeToken, issueCode, oauthConfig, protectedResourceMetadata, readAuthorizeRequest,
  readBearer, redirectWith, registerClient, signInPage
} from "./oauth.js";
import { cleanUsername, liftsThisWeek, nameProblem, REVIEW_MIN_LIFTS, usernameProblem } from "../src/lib/model.js";

// Where to go after sign-in when it started from the ChatGPT approval page.
const NEXT_COOKIE = "lift_next";
// Sign-in started by the iOS app: its PKCE challenge, so the callback hands
// back a code for the app instead of setting a cookie.
const NATIVE_COOKIE = "lift_native";
const AUTHORIZE_PATH = "/api/oauth/authorize";

export const KINDS = new Set(["exercise", "split", "splitDay", "workout", "bodyweight", "settings", "meal", "coachReview"]);
// Why someone can be reported.
const REPORT_REASONS = new Set(["name", "harassment", "spam", "other"]);
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
    apple: env.APPLE_CLIENT_ID && env.APPLE_TEAM_ID && env.APPLE_KEY_ID && env.APPLE_PRIVATE_KEY
      ? { clientId: env.APPLE_CLIENT_ID, teamId: env.APPLE_TEAM_ID, keyId: env.APPLE_KEY_ID, privateKey: env.APPLE_PRIVATE_KEY }
      : null,
    google: pair(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
    github: pair(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET),
    // Anyone with an Apple, Google or GitHub account can sign in, not just invitees.
    openSignup: env.OPEN_SIGNUP === "1",
    // Lift Pro subscriptions, once all the Stripe variables are set.
    billing: billingConfig(env),
    // Local testing only: sign in without Google or GitHub. Refused on Vercel.
    devLogin: env.LIFT_DEV_LOGIN === "1" && !env.VERCEL
  };
  config.providers = [config.apple && "apple", config.google && "google", config.github && "github", config.devLogin && "dev"].filter(Boolean);
  const missing = [];
  if (!config.appUrl) missing.push("APP_URL");
  if (!config.sessionSecret) missing.push("SESSION_SECRET");
  else if (config.sessionSecret.length < 32) missing.push("SESSION_SECRET (32+ characters)");
  if (!config.admins.length) missing.push("ADMIN_EMAILS");
  if (!config.providers.length) missing.push("APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY, GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET");
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

const publicUser = ({ email, name, username, admin, vip, pro, subscribed }) => ({ email, name, username: username || null, admin, vip, pro, subscribed });

// `anthropic` replaces the Claude client in tests.
export function createApp({ store, env = process.env, fetchImpl = fetch, anthropic = null }) {
  const config = appConfig(env);
  const oauth = oauthConfig(env, config);
  const reviews = Boolean(env.ANTHROPIC_API_KEY || anthropic);
  const stripe = config.billing ? createStripe({ secretKey: config.billing.secretKey, appUrl: config.appUrl, prices: config.billing.prices, fetchImpl }) : null;

  // The account behind an email, if it may use Lift: an admin, someone on
  // the invite list, or anyone when sign-up is open. Checked on every
  // request, so removing someone takes effect right away.
  async function account(value) {
    const email = normalizeEmail(value);
    if (!email) return null;
    const admin = config.admins.includes(email);
    const row = await store.getUser(email);
    if (!admin && !row && !config.openSignup) return null;
    const vip = admin || Boolean(row?.vip);
    const subscribed = planActive(row);
    return { email, name: row?.name || "", username: row?.username || null, admin, vip, pro: vip || subscribed, subscribed, row };
  }

  // An account that's still there for a session or token issued at
  // `issuedAt`. Signing in makes the user row, so a deleted account's old
  // sessions and ChatGPT tokens stop working, even after a new sign-up with
  // the same email.
  async function member(sub, issuedAt = 0) {
    const user = await account(sub);
    if (!user) return null;
    if (!user.admin && (!user.row || (issuedAt && issuedAt < user.row.createdAt))) return null;
    return user;
  }

  // The iOS app sends its session as a bearer header; the web app as a cookie.
  const bearerSession = (req) => /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ""))?.[1] || "";

  async function signedIn(req) {
    const session = readSession(bearerSession(req) || parseCookies(req.headers.cookie)[SESSION_COOKIE], config.sessionSecret);
    return session ? member(session.sub, session.iat) : null;
  }

  // Cookie-authenticated writes must come from the app itself. A bearer
  // header can't be sent by another site on its own, so it needs no check.
  function sameOrigin(req) {
    return Boolean(bearerSession(req)) || (Boolean(config.appUrl) && req.headers.origin === config.appUrl);
  }

  // A failed sign-in goes back to where it started: the web app, or the iOS
  // app through lift://auth.
  function signInFailed(req, res, reason) {
    const native = Boolean(parseCookies(req.headers.cookie)[NATIVE_COOKIE]);
    return redirect(res, native ? `${NATIVE_REDIRECT}?error=${reason}` : `/?signin=${reason}`, { "set-cookie": [clearCookie(STATE_COOKIE), clearCookie(NATIVE_COOKIE)] });
  }

  async function finishSignIn(req, res, profile) {
    const user = await account(profile.email);
    if (!user) return signInFailed(req, res, "denied");
    const now = Date.now();
    const appleToken = profile.appleToken ? encryptText(profile.appleToken, config.sessionSecret) : user.row?.appleToken || "";
    await store.putUser({ ...user.row, email: user.email, name: user.name || profile.name || "", vip: Boolean(user.row?.vip), createdAt: user.row?.createdAt || now, lastSeenAt: now, appleToken });
    const challenge = parseCookies(req.headers.cookie)[NATIVE_COOKIE] || "";
    if (challenge) {
      return redirect(res, `${NATIVE_REDIRECT}?code=${encodeURIComponent(nativeCode(user.email, challenge, config.sessionSecret, now))}`, {
        "set-cookie": [clearCookie(STATE_COOKIE), clearCookie(NATIVE_COOKIE)]
      });
    }
    const next = parseCookies(req.headers.cookie)[NEXT_COOKIE] || "";
    return redirect(res, next.startsWith(`${AUTHORIZE_PATH}?`) ? next : "/", {
      "set-cookie": [sessionCookie(createSession({ email: user.email, name: profile.name || user.name }, config.sessionSecret)), clearCookie(STATE_COOKIE), clearCookie(NEXT_COOKIE)]
    });
  }

  // `params` are the callback's query, or Apple's posted form.
  async function oauthCallback(req, res, params, read) {
    const stateCookie = parseCookies(req.headers.cookie)[STATE_COOKIE];
    if (!checkOAuthState(stateCookie, params.get("state"), config.sessionSecret)) return signInFailed(req, res, "expired");
    let profile;
    try {
      profile = await read(params.get("code"));
    } catch {
      return signInFailed(req, res, "failed");
    }
    return finishSignIn(req, res, profile);
  }

  async function refreshPlan(email, customer) {
    const { status, until } = bestPlan(await stripe.listSubscriptions(customer));
    await store.setPlan(email, { status, until, source: "stripe" });
  }

  // Runs before an account goes, so a Stripe failure stops the deletion and
  // nobody keeps being charged for an account that's gone.
  async function endSubscription(row) {
    if (stripe && row?.stripeCustomer) await stripe.deleteCustomer(row.stripeCustomer);
  }

  async function people() {
    const rows = await store.listUsers();
    const listed = new Set(rows.map((row) => row.email));
    const admins = config.admins.filter((email) => !listed.has(email)).map((email) => ({ email, name: "", vip: true, invitedBy: "", createdAt: 0, lastSeenAt: null }));
    return [...admins, ...rows].map(({ appleToken, stripeCustomer, ...row }) => ({ ...row, admin: config.admins.includes(row.email), vip: config.admins.includes(row.email) || row.vip }));
  }

  // Reports with the usernames admins know people by.
  async function reports() {
    const handle = async (email) => (await store.getUser(email))?.username || null;
    return Promise.all((await store.listReports()).map(async (row) => ({ ...row, reporterUsername: await handle(row.reporter), reportedUsername: await handle(row.reported) })));
  }

  async function handle(req, res) {
    const url = new URL(req.url, "http://lift.local");
    const path = url.pathname;
    if (config.missing.length) return sendJson(res, { ok: false, error: `Lift isn't configured. Missing: ${config.missing.join(", ")}.` }, 503);

    // ---- sign-in ----
    if (path === "/api/auth/login" && req.method === "GET") {
      const next = url.searchParams.get("next") || "";
      const asked = url.searchParams.get("provider") || "";
      const provider = config.providers.includes(asked) ? asked : config.providers.length === 1 ? config.providers[0] : "";
      // Apple posts back from its own site, so its cookies must allow that.
      const sameSite = provider === "apple" ? "None" : "Lax";
      const nextCookie = next.startsWith(`${AUTHORIZE_PATH}?`) ? [cookie(NEXT_COOKIE, next, { maxAge: 600, sameSite })] : [];
      // From the iOS app: a PKCE S256 challenge, so only the app that started
      // can redeem the code that comes back to lift://auth.
      const challenge = url.searchParams.get("client") === "ios" ? url.searchParams.get("challenge") || "" : "";
      if (challenge && !/^[A-Za-z0-9_-]{43}$/.test(challenge)) return sendJson(res, { ok: false, error: "A PKCE challenge is required." }, 400);
      nextCookie.push(challenge ? cookie(NATIVE_COOKIE, challenge, { maxAge: 600, sameSite }) : clearCookie(NATIVE_COOKIE));
      if (!provider) return sendHtml(res, signInPage({ providers: config.providers, next }));
      if (provider === "dev") {
        const as = normalizeEmail(url.searchParams.get("as")) || config.admins[0];
        return redirect(res, `/api/auth/callback?dev=${encodeURIComponent(as)}`, nextCookie.length ? { "set-cookie": nextCookie } : {});
      }
      const state = newOAuthState(config.sessionSecret);
      const location = provider === "apple"
        ? appleAuthorizeUrl({ clientId: config.apple.clientId, redirectUri: `${config.appUrl}/api/auth/apple/callback`, state: state.nonce })
        : provider === "google"
          ? googleAuthorizeUrl({ clientId: config.google.clientId, redirectUri: `${config.appUrl}/api/auth/google/callback`, state: state.nonce })
          : githubAuthorizeUrl({ clientId: config.github.clientId, redirectUri: `${config.appUrl}/api/auth/callback`, state: state.nonce });
      return redirect(res, location, { "set-cookie": [cookie(STATE_COOKIE, state.cookieValue, { maxAge: 600, sameSite }), ...nextCookie] });
    }
    if (path === "/api/auth/callback" && req.method === "GET") {
      if (config.devLogin && url.searchParams.has("dev")) return finishSignIn(req, res, { email: url.searchParams.get("dev"), name: "" });
      if (!config.github) return redirect(res, "/?signin=failed");
      const { clientId, clientSecret } = config.github;
      return oauthCallback(req, res, url.searchParams, (code) => githubUser({ code, clientId, clientSecret, redirectUri: `${config.appUrl}/api/auth/callback`, fetchImpl }));
    }
    if (path === "/api/auth/google/callback" && req.method === "GET") {
      if (!config.google) return redirect(res, "/?signin=failed");
      const { clientId, clientSecret } = config.google;
      return oauthCallback(req, res, url.searchParams, (code) => googleUser({ code, clientId, clientSecret, redirectUri: `${config.appUrl}/api/auth/google/callback`, fetchImpl }));
    }
    // Apple posts the code back as a form (it asks for name and email), so
    // this is the one sign-in step that isn't a same-origin GET; the signed
    // state cookie still has to match.
    if (path === "/api/auth/apple/callback" && req.method === "POST") {
      if (!config.apple) return redirect(res, "/?signin=failed");
      const form = new URLSearchParams(await readJsonOrForm(req));
      return oauthCallback(req, res, form, (code) => appleUser({ code, user: form.get("user"), apple: config.apple, redirectUri: `${config.appUrl}/api/auth/apple/callback`, fetchImpl }));
    }
    // The iOS app trades its code and PKCE verifier for a session token.
    if (path === "/api/auth/token" && req.method === "POST") {
      const body = await readJsonBody(req, { limit: 4_000 });
      const code = readNativeCode(body.code, body.verifier, config.sessionSecret);
      const user = code && (await store.claim(`native:${code.j}`, code.exp)) ? await member(code.sub) : null;
      if (!user) return sendJson(res, { ok: false, error: "That sign-in expired. Try again." }, 400);
      return sendJson(res, { ok: true, token: createSession({ email: user.email, name: user.name }, config.sessionSecret) });
    }
    if (path === "/api/auth/logout" && req.method === "POST") {
      return sendJson(res, { ok: true }, 200, { "set-cookie": clearCookie(SESSION_COOKIE) });
    }

    // ---- the AI connector (ChatGPT, Claude): discovery, OAuth and MCP ----
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
        if (posted) return sendHtml(res, consentPage({ error: "Your session expired. Start connecting again from your assistant." }), 401);
        return redirect(res, `/api/auth/login?next=${encodeURIComponent(`${AUTHORIZE_PATH}?${url.searchParams}`)}`);
      }
      if (!posted) return sendHtml(res, consentPage({ request, login: user.email }));
      if (params.decision !== "allow") return redirect(res, redirectWith(request, { error: "access_denied" }));
      return redirect(res, redirectWith(request, { code: issueCode(request, { sub: user.email }, config) }));
    }
    if (path === "/api/oauth/token" && req.method === "POST") {
      try {
        return sendJson(res, await exchangeToken(await readJsonOrForm(req), { config, oauth, store, allowed: async (sub, since) => Boolean(await member(sub, since)) }));
      } catch (error) {
        if (!error.oauth) throw error;
        return sendJson(res, { error: error.oauth, error_description: error.message }, 400);
      }
    }
    if (path === "/api/mcp") {
      if (req.method !== "POST") return sendJson(res, { error: "Use POST." }, 405, { allow: "POST" });
      const token = readBearer(req.headers.authorization, { config, oauth });
      const owner = token ? await member(token.sub, token.t) : null;
      if (!owner) {
        return sendJson(res, { error: "invalid_token", error_description: "Connect Lift in your assistant to use this." }, 401, {
          "www-authenticate": `Bearer resource_metadata="${config.appUrl}/.well-known/oauth-protected-resource/api/mcp", scope="lift"`
        });
      }
      const reply = await createMcp({ store: store.forOwner(owner.email), app: token.a }).handle(await readJsonBody(req, { limit: 256_000 }));
      if (!reply) {
        res.writeHead(202, { "cache-control": "no-store" });
        return res.end();
      }
      return sendJson(res, reply);
    }

    // Stripe says a subscription changed. Its signature is the only
    // authentication; the plan itself is read back from Stripe.
    if (path === "/api/billing/webhook" && req.method === "POST") {
      if (!stripe) return sendJson(res, { ok: false, error: "Not found." }, 404);
      const raw = await readText(req);
      if (!verifySignature(raw, req.headers["stripe-signature"], config.billing.webhookSecret)) return sendJson(res, { ok: false, error: "Bad signature." }, 400);
      const event = JSON.parse(raw);
      if (BILLING_EVENTS.has(event.type)) {
        const owner = await store.getUserByCustomer(event.data?.object?.customer);
        if (owner) await refreshPlan(owner.email, owner.stripeCustomer);
      }
      return sendJson(res, { ok: true });
    }

    // ---- everything else needs a signed-in session ----
    const user = await signedIn(req);
    if (path === "/api/session") {
      if (!user) return sendJson(res, { ok: false, signedIn: false, providers: config.providers });
      // Pro only has the weekly review to sell so far, so it needs both.
      return sendJson(res, { ok: true, user: publicUser(user), coach: reviews && user.pro, billing: Boolean(stripe && reviews), providers: config.providers });
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
    // The weekly AI review (needs ANTHROPIC_API_KEY): for Pro and VIPs, once they've
    // logged enough lifting that week to review, and only after they agreed
    // to their data going to Anthropic (`consent`, from settings.aiConsent).
    if (path === "/api/coach/review" && req.method === "POST") {
      if (!reviews) return sendJson(res, { ok: false, error: "Add ANTHROPIC_API_KEY to turn on weekly reviews." }, 503);
      if (!user.pro) return sendJson(res, { ok: false, error: stripe ? "Weekly reviews are part of Lift Pro." : "Weekly reviews are for VIP members." }, 403);
      if ((await readJsonBody(req, { limit: 1_000 })).consent !== true) return sendJson(res, { ok: false, error: "Turn on weekly reviews first." }, 409);
      const lifts = liftsThisWeek(await mine.listKind("workout"));
      if (lifts < REVIEW_MIN_LIFTS) return sendJson(res, { ok: false, error: `Log ${REVIEW_MIN_LIFTS} lifts this week to get your review (${lifts} so far).` }, 409);
      return sendJson(res, { ok: true, review: await writeReview({ store: mine, apiKey: env.ANTHROPIC_API_KEY, client: anthropic }) });
    }

    // ---- Lift Pro, sold on the web only ----
    // Apple doesn't let the iOS app send people to outside checkout, so these
    // refuse its bearer sessions as well as being hidden there.
    if (path.startsWith("/api/billing/")) {
      if (!stripe) return sendJson(res, { ok: false, error: "Subscriptions aren't available." }, 503);
      if (bearerSession(req)) return sendJson(res, { ok: false, error: "Subscriptions aren't available in the app." }, 403);
      const customer = user.row?.stripeCustomer || "";
      if (path === "/api/billing/prices" && req.method === "GET") return sendJson(res, { ok: true, prices: await stripe.getPrices() });
      if (path === "/api/billing/checkout" && req.method === "POST") {
        if (user.pro) return sendJson(res, { ok: false, error: "You already have Lift Pro." }, 409);
        const { interval } = await readJsonBody(req, { limit: 1_000 });
        if (!["monthly", "yearly"].includes(interval)) return sendJson(res, { ok: false, error: "Pick monthly or yearly." }, 400);
        let id = customer;
        if (!id) {
          id = await stripe.createCustomer(user.email);
          await store.setPlan(user.email, { customer: id });
        }
        return sendJson(res, { ok: true, url: await stripe.createCheckout(id, interval) });
      }
      if (path === "/api/billing/portal" && req.method === "POST") {
        if (!customer) return sendJson(res, { ok: false, error: "You don't have a subscription." }, 409);
        return sendJson(res, { ok: true, url: await stripe.createPortal(customer) });
      }
      // Back from checkout: don't wait for the webhook.
      if (path === "/api/billing/sync" && req.method === "POST") {
        if (customer) await refreshPlan(user.email, customer);
        return sendJson(res, { ok: true, user: publicUser(await account(user.email)) });
      }
      return sendJson(res, { ok: false, error: "Not found." }, 404);
    }

    // ---- your username and display name ----
    if (path === "/api/account" && req.method === "POST") {
      const body = await readJsonBody(req, { limit: 4_000 });
      const change = {};
      if (body.username !== undefined) {
        const username = cleanUsername(body.username);
        const problem = usernameProblem(username);
        if (problem) return sendJson(res, { ok: false, error: problem }, 400);
        const owner = await store.getUserByUsername(username);
        if (owner && owner.email !== user.email) return sendJson(res, { ok: false, error: "That username is taken." }, 409);
        change.username = username;
      }
      if (body.name !== undefined) {
        change.name = String(body.name || "").trim().slice(0, 40);
        const problem = nameProblem(change.name);
        if (problem) return sendJson(res, { ok: false, error: problem }, 400);
      }
      const now = Date.now();
      try {
        await store.putUser({ ...user.row, email: user.email, vip: Boolean(user.row?.vip), createdAt: user.row?.createdAt || now, lastSeenAt: user.row?.lastSeenAt ?? now, ...change });
      } catch (error) {
        if (error.code === "23505") return sendJson(res, { ok: false, error: "That username is taken." }, 409);
        throw error;
      }
      return sendJson(res, { ok: true, user: publicUser(await account(user.email)) });
    }
    // Deletes the account and everything in it, and revokes Sign in with
    // Apple. Admins are set in ADMIN_EMAILS, so they're removed there.
    if (path === "/api/account/delete" && req.method === "POST") {
      if (user.admin) return sendJson(res, { ok: false, error: "Admins are set in ADMIN_EMAILS. Remove yourself there first." }, 400);
      await endSubscription(user.row);
      const appleToken = user.row?.appleToken ? decryptText(user.row.appleToken, config.sessionSecret) : "";
      if (appleToken && config.apple) await revokeApple({ token: appleToken, apple: config.apple, fetchImpl }).catch(() => false);
      await store.deleteOwner(user.email);
      return sendJson(res, { ok: true }, 200, { "set-cookie": clearCookie(SESSION_COOKIE) });
    }

    // ---- friends and profiles, by username ----
    // People you blocked, to unblock; never who blocked you.
    const blockedList = async () => {
      const rows = await Promise.all((await store.listBlocked(user.email)).map((email) => store.getUser(email)));
      return rows.filter((row) => row?.username).map((row) => ({ username: row.username, name: displayName(row) }));
    };
    const friendList = async () => ({ ...publicPeople(await friendships(store, user.email, account)), blocked: await blockedList() });
    const byUsername = async (text) => {
      const row = await store.getUserByUsername(cleanUsername(text));
      return row ? account(row.email) : null;
    };
    if (path === "/api/friends" && req.method === "GET") return sendJson(res, { ok: true, ...(await friendList()) });
    // Blocking ends the friendship and stops requests either way; it works
    // on anyone, friend or not.
    if (path === "/api/friends/block" || path === "/api/friends/unblock" || path === "/api/friends/report") {
      if (req.method !== "POST") return sendJson(res, { ok: false, error: "Use POST." }, 405, { allow: "POST" });
      const body = await readJsonBody(req, { limit: 4_000 });
      const other = await byUsername(body.username);
      if (!other) return sendJson(res, { ok: false, error: "No one on Lift has that username." }, 404);
      if (other.email === user.email) return sendJson(res, { ok: false, error: "That's you." }, 400);
      if (path === "/api/friends/block") {
        await store.removeFriendship(user.email, other.email);
        await store.putBlock(user.email, other.email);
      } else if (path === "/api/friends/unblock") {
        await store.removeBlock(user.email, other.email);
      } else {
        const reason = String(body.reason || "");
        if (!REPORT_REASONS.has(reason)) return sendJson(res, { ok: false, error: "Pick a reason." }, 400);
        await store.addReport({ id: randomBytes(9).toString("base64url"), reporter: user.email, reported: other.email, reason, note: String(body.note || "").trim().slice(0, 500), createdAt: Date.now() });
      }
      return sendJson(res, { ok: true, ...(await friendList()) });
    }
    if (path === "/api/friends/leaderboard" && req.method === "GET") {
      return sendJson(res, { ok: true, ...(await leaderboardFor(store, user, account, url.searchParams.get("key") || "")) });
    }
    if (path === "/api/friends/request" || path === "/api/friends/accept" || path === "/api/friends/remove") {
      if (req.method !== "POST") return sendJson(res, { ok: false, error: "Use POST." }, 405, { allow: "POST" });
      if (!user.username) return sendJson(res, { ok: false, error: "Pick a username first." }, 409);
      const other = await byUsername((await readJsonBody(req, { limit: 4_000 })).username);
      // Someone who blocked you (or you them) looks like no one.
      if (!other || (path !== "/api/friends/remove" && (await store.isBlocked(user.email, other.email)))) return sendJson(res, { ok: false, error: "No one on Lift has that username." }, 404);
      const email = other.email;
      if (email === user.email) return sendJson(res, { ok: false, error: "That's you." }, 400);
      const existing = await store.getFriendship(user.email, email);
      const theirRequest = existing?.status === "pending" && existing.requestedBy === email;
      if (path === "/api/friends/remove") {
        if (existing) await store.removeFriendship(user.email, email);
      } else if (path === "/api/friends/accept") {
        if (!theirRequest) return sendJson(res, { ok: false, error: "There's no request from them to accept." }, 404);
        await store.putFriendship({ ...existing, status: "accepted" });
      } else {
        // Asking someone who already asked you makes you friends.
        if (theirRequest) await store.putFriendship({ ...existing, status: "accepted" });
        else if (!existing) await store.putFriendship({ a: user.email, b: email, status: "pending", requestedBy: user.email, createdAt: Date.now() });
      }
      return sendJson(res, { ok: true, ...(await friendList()) });
    }
    // Your own profile, or an accepted friend's.
    if (path === "/api/profile" && req.method === "GET") {
      const asked = url.searchParams.get("username");
      const found = asked ? await byUsername(asked) : user;
      const other = found && (found.email === user.email || (await store.getFriendship(user.email, found.email))?.status === "accepted") ? found : null;
      if (!other) return sendJson(res, { ok: false, error: "Not found." }, 404);
      return sendJson(res, { ok: true, profile: { username: other.username || null, name: displayName(other), ...(await summaryFor(store, other.email, { vip: other.vip })) } });
    }

    // ---- admins: reports, and the invite list ----
    if (path === "/api/admin/reports" || path === "/api/admin/reports/dismiss") {
      if (!user.admin) return sendJson(res, { ok: false, error: "Only admins can see reports." }, 403);
      if (path === "/api/admin/reports/dismiss") {
        if (req.method !== "POST") return sendJson(res, { ok: false, error: "Use POST." }, 405, { allow: "POST" });
        await store.removeReport(String((await readJsonBody(req, { limit: 1_000 })).id || ""));
      }
      return sendJson(res, { ok: true, reports: await reports() });
    }
    if (path === "/api/admin/users" || path === "/api/admin/users/remove") {
      if (!user.admin) return sendJson(res, { ok: false, error: "Only admins can manage people." }, 403);
      if (req.method === "GET" && path === "/api/admin/users") return sendJson(res, { ok: true, users: await people() });
      if (req.method !== "POST") return sendJson(res, { ok: false, error: "Use POST." }, 405, { allow: "GET, POST" });
      const body = await readJsonBody(req, { limit: 4_000 });
      const email = normalizeEmail(body.email);
      if (!email) return sendJson(res, { ok: false, error: "Enter a valid email." }, 400);
      if (path === "/api/admin/users/remove") {
        if (config.admins.includes(email)) return sendJson(res, { ok: false, error: "Admins are set in ADMIN_EMAILS." }, 400);
        await endSubscription(await store.getUser(email));
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
      // The iOS app's API calls come from its own origin: allow exactly that
      // one, with bearer headers and no cookies.
      if (req.headers.origin === NATIVE_ORIGIN && String(req.url).startsWith("/api/")) {
        const cors = { "access-control-allow-origin": NATIVE_ORIGIN, vary: "Origin" };
        if (req.method === "OPTIONS") {
          res.writeHead(204, { ...cors, "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "authorization, content-type", "access-control-max-age": "600" });
          return res.end();
        }
        const writeHead = res.writeHead.bind(res);
        res.writeHead = (status, headers = {}) => writeHead(status, { ...headers, ...cors });
      }
      try {
        return await handle(req, res);
      } catch (error) {
        if (res.headersSent) return res.end();
        return sendJson(res, { ok: false, error: error.status ? error.message : "Something went wrong." }, error.status || 500);
      }
    }
  };
}
