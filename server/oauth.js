// OAuth 2.1 for the AI connector (ChatGPT, Claude). Lift is its own small
// authorization server: the assistant registers itself, you approve once
// while signed in to Lift, and it gets short-lived bearer tokens for /api/mcp,
// bound to your account (email). Client ids, codes and tokens are all signed with
// SESSION_SECRET; the only thing stored is which one-time codes and refresh
// tokens were already used.
import { createHash, randomBytes } from "node:crypto";
import { safeEqual, sign } from "./auth.js";
import { httpError } from "./http.js";

export const SCOPE = "lift";
const CODE_TTL = 5 * 60_000;
const ACCESS_TTL = 60 * 60_000;
const REFRESH_TTL = 60 * 86_400_000;
// ChatGPT; Claude's apps; Claude Code, which listens on a local port.
const CLAUDE_HOST = "claude.ai";
const LOOPBACK_HOSTS = ["localhost", "127.0.0.1"];
const DEFAULT_REDIRECT_HOSTS = ["chatgpt.com", "chat.openai.com", CLAUDE_HOST, ...LOOPBACK_HOSTS];

const b64url = (value) => Buffer.from(value).toString("base64url");
const sha256 = (value) => createHash("sha256").update(value).digest("base64url");

// A signed token of one type. The type is part of what's signed, so a code
// can't be used as a token or the other way round.
export function seal(type, data, secret, { ttl = 0, now = Date.now() } = {}) {
  const payload = b64url(JSON.stringify({ ...data, ...(ttl ? { exp: now + ttl } : {}) }));
  return `${payload}.${sign(`${type}.${payload}`, secret)}`;
}

export function unseal(type, token, secret, now = Date.now()) {
  const [payload, signature, extra] = String(token || "").split(".");
  if (!payload || !signature || extra !== undefined || !safeEqual(signature, sign(`${type}.${payload}`, secret))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.exp && data.exp <= now ? null : data;
  } catch {
    return null;
  }
}

export function oauthConfig(env, config) {
  const hosts = String(env.OAUTH_REDIRECT_HOSTS || "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
  return {
    redirectHosts: hosts.length ? hosts : DEFAULT_REDIRECT_HOSTS,
    tokenVersion: String(env.MCP_TOKEN_VERSION || "1"),
    resource: `${config.appUrl}/api/mcp`
  };
}

function allowedRedirect(uri, hosts) {
  try {
    const url = new URL(uri);
    const local = ["localhost", "127.0.0.1"].includes(url.hostname);
    return (url.protocol === "https:" || (local && url.protocol === "http:")) && hosts.includes(url.hostname.toLowerCase()) && !url.hash;
  } catch {
    return false;
  }
}

const isLoopback = (url) => url.protocol === "http:" && LOOPBACK_HOSTS.includes(url.hostname);

// A native app picks its port when it runs (RFC 8252), so a loopback address
// matches its registered form whatever the port. Anything else matches exactly.
function sameRedirect(registered, uri) {
  if (registered === uri) return true;
  try {
    const [a, b] = [new URL(registered), new URL(uri)];
    a.port = "";
    b.port = "";
    return isLoopback(a) && a.href === b.href;
  } catch {
    return false;
  }
}

// Which assistant a redirect address belongs to: labels what it writes.
function assistantOf(redirectUri) {
  const url = new URL(redirectUri);
  return url.hostname === CLAUDE_HOST || isLoopback(url) ? "claude" : "chatgpt";
}

export function protectedResourceMetadata(config, oauth) {
  return { resource: oauth.resource, authorization_servers: [config.appUrl], scopes_supported: [SCOPE], bearer_methods_supported: ["header"], resource_name: "Lift" };
}

export function authorizationServerMetadata(config) {
  return {
    issuer: config.appUrl,
    authorization_endpoint: `${config.appUrl}/api/oauth/authorize`,
    token_endpoint: `${config.appUrl}/api/oauth/token`,
    registration_endpoint: `${config.appUrl}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [SCOPE]
  };
}

// Dynamic client registration: the client id carries its redirect URIs,
// which must be on an allowed host.
export function registerClient(body, config, oauth) {
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris.map(String).slice(0, 10) : [];
  if (!uris.length || !uris.every((uri) => allowedRedirect(uri, oauth.redirectHosts))) {
    throw Object.assign(httpError(400, "Redirect URIs must be on an allowed host."), { oauth: "invalid_redirect_uri" });
  }
  const name = String(body.client_name || "AI assistant").slice(0, 80);
  return {
    client_id: seal("client", { r: uris, n: name }, config.sessionSecret),
    client_name: name,
    redirect_uris: uris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
    client_id_issued_at: Math.floor(Date.now() / 1000)
  };
}

// The checked parameters of an authorization request, or an error that must
// be shown on the page rather than sent to an unverified redirect URI.
export function readAuthorizeRequest(params, config, oauth) {
  const client = unseal("client", params.client_id, config.sessionSecret);
  if (!client) return { fatal: "Unknown client. Remove the connector in your assistant and add it again." };
  const redirectUri = String(params.redirect_uri || (client.r.length === 1 ? client.r[0] : ""));
  if (!client.r.some((registered) => sameRedirect(registered, redirectUri)) || !allowedRedirect(redirectUri, oauth.redirectHosts)) return { fatal: "That redirect address isn't registered for this client." };
  const request = {
    clientId: String(params.client_id),
    clientName: client.n,
    redirectUri,
    state: params.state == null ? "" : String(params.state),
    challenge: String(params.code_challenge || ""),
    method: String(params.code_challenge_method || ""),
    scope: SCOPE,
    resource: params.resource ? String(params.resource) : oauth.resource
  };
  if (params.response_type !== "code") return { request, error: "unsupported_response_type" };
  if (request.method !== "S256" || !/^[A-Za-z0-9_-]{43,128}$/.test(request.challenge)) return { request, error: "invalid_request", description: "PKCE with S256 is required." };
  if (request.resource !== oauth.resource) return { request, error: "invalid_target" };
  return { request };
}

export function redirectWith(request, params) {
  const url = new URL(request.redirectUri);
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, value);
  if (request.state) url.searchParams.set("state", request.state);
  return url.toString();
}

export function issueCode(request, user, config) {
  return seal("code", { c: sha256(request.clientId), r: request.redirectUri, ch: request.challenge, sub: String(user.sub), a: assistantOf(request.redirectUri), j: b64url(randomBytes(12)) }, config.sessionSecret, { ttl: CODE_TTL });
}

// `t` is when the connection was made, carried through refreshes, so a
// connection from before an account was deleted stops working. `a` is the
// assistant approved. Connections approved before the split tools existed have
// none, and keep what they agreed to until they reconnect (see mcp.js).
function tokenPair(sub, clientHash, assistant, config, oauth, now, since = now) {
  const refreshId = b64url(randomBytes(12));
  return {
    access_token: seal("access", { sub, c: clientHash, v: oauth.tokenVersion, t: since, a: assistant }, config.sessionSecret, { ttl: ACCESS_TTL, now }),
    token_type: "Bearer",
    expires_in: ACCESS_TTL / 1000,
    refresh_token: seal("refresh", { sub, c: clientHash, v: oauth.tokenVersion, j: refreshId, t: since, a: assistant }, config.sessionSecret, { ttl: REFRESH_TTL, now }),
    scope: SCOPE
  };
}

const grantError = (error, description) => Object.assign(httpError(400, description || error), { oauth: error });

// The token endpoint: trade a code (with its PKCE verifier) or a refresh
// token for a new access token and refresh token. Both are single use, and
// only for an account that may still sign in (`allowed`).
export async function exchangeToken(body, { config, oauth, store, allowed, now = Date.now() }) {
  const clientHash = body.client_id ? sha256(String(body.client_id)) : null;
  if (body.grant_type === "authorization_code") {
    const code = unseal("code", body.code, config.sessionSecret, now);
    if (!code) throw grantError("invalid_grant", "The code is invalid or expired.");
    if ((clientHash && code.c !== clientHash) || code.r !== String(body.redirect_uri || code.r)) throw grantError("invalid_grant", "The code was issued to another client.");
    if (!body.code_verifier || !safeEqual(sha256(String(body.code_verifier)), code.ch)) throw grantError("invalid_grant", "PKCE verification failed.");
    if (!(await allowed(code.sub, now))) throw grantError("invalid_grant", "That account isn't allowed.");
    if (!(await store.claim(`code:${code.j}`, code.exp, now))) throw grantError("invalid_grant", "The code was already used.");
    return tokenPair(code.sub, code.c, code.a, config, oauth, now);
  }
  if (body.grant_type === "refresh_token") {
    const token = unseal("refresh", body.refresh_token, config.sessionSecret, now);
    if (!token || token.v !== oauth.tokenVersion || (clientHash && token.c !== clientHash) || !(await allowed(token.sub, token.t))) throw grantError("invalid_grant", "Sign in again.");
    if (!(await store.claim(`refresh:${token.j}`, token.exp, now))) throw grantError("invalid_grant", "That refresh token was already used.");
    return tokenPair(token.sub, token.c, token.a, config, oauth, now, token.t);
  }
  throw grantError("unsupported_grant_type");
}

// The token behind a bearer header on /api/mcp, or null. `token.sub` is the
// account; app.js checks it may still sign in.
export function readBearer(header, { config, oauth, now = Date.now() }) {
  const match = /^Bearer\s+(\S+)$/i.exec(String(header || ""));
  if (!match) return null;
  const token = unseal("access", match[1], config.sessionSecret, now);
  if (!token || token.v !== oauth.tokenVersion) return null;
  return token;
}

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const PROVIDER_NAMES = { apple: "Apple", google: "Google", github: "GitHub", dev: "Dev account" };

// The sign-in choice when connecting an assistant: one link per provider,
// coming back to the approval page afterwards.
export function signInPage({ providers, next }) {
  const links = providers.map((provider) => `<a class="button" href="/api/auth/login?${escape(new URLSearchParams({ provider, next }).toString())}">Continue with ${PROVIDER_NAMES[provider] || provider}</a>`).join("");
  return shell("Sign in", `<h1>Sign in to Lift</h1><p>Sign in to connect your AI assistant to your Lift account.</p><div class="stack">${links}</div>`);
}

// The approval page. No scripts: two buttons in a same-origin form.
export function consentPage({ request, login, error }) {
  const hidden = request
    ? ["client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "resource"]
        .map((name) => {
          const value = { client_id: request.clientId, redirect_uri: request.redirectUri, state: request.state, code_challenge: request.challenge, code_challenge_method: request.method, resource: request.resource }[name];
          return `<input type="hidden" name="${name}" value="${escape(value)}">`;
        })
        .join("")
    : "";
  const target = request ? new URL(request.redirectUri) : null;
  // Any program on a device can listen on a local port, so say so.
  const destination = target && (isLoopback(target)
    ? `<p class="muted">This returns to a program on this device (<b>${escape(target.host)}</b>). Only allow it if you just started connecting from one, such as Claude Code.</p>`
    : `<p class="muted">This returns you to <b>${escape(target.host)}</b>.</p>`);
  const body = error
    ? `<h1>Can't connect</h1><p>${escape(error)}</p>`
    : `<h1>Connect ${escape(request.clientName)} to Lift?</h1>
<p>Signed in as <b>${escape(login)}</b>. ${escape(request.clientName)} will be able to:</p>
<ul><li>Log, change and delete meals</li><li>Read your nutrition targets and daily totals</li><li>Read a summary of your training, bodyweight and progress</li><li>Read your splits and exercises, add new splits and exercises, and edit any split, including your current one</li></ul>
<p class="muted">It can't see or change your logged workouts, and a new split waits in the Split tab until you make it current. Disconnect any time in your assistant's settings.</p>
${destination}
<form method="post" action="/api/oauth/authorize">${hidden}<input type="hidden" name="response_type" value="code">
<button name="decision" value="allow">Allow</button><button name="decision" value="deny" class="secondary">Cancel</button></form>`;
  return shell("Connect", body);
}

function shell(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lift · ${title}</title>
<style>
:root{color-scheme:light dark;--bg:#f5f6f8;--card:#fff;--fg:#0b0c0e;--muted:#6b7079;--tint:#3b82f6;--line:rgba(15,17,22,.08)}
@media (prefers-color-scheme:dark){:root{--bg:#07080a;--card:#111215;--fg:#f4f5f7;--muted:#8b909a;--line:rgba(255,255,255,.08)}}
*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:16px;background:var(--bg);color:var(--fg);font:16px/1.45 -apple-system,system-ui,"Segoe UI",sans-serif}
main{width:100%;max-width:420px;background:var(--card);border:1px solid var(--line);border-radius:28px;padding:28px 24px}
h1{font-size:24px;line-height:1.2;letter-spacing:-.02em;margin:0 0 12px}ul{padding-left:20px;margin:8px 0 12px}li{margin:4px 0}.muted{color:var(--muted);font-size:14px}
form,.stack{display:flex;flex-direction:column;gap:10px;margin-top:20px}button,.button{height:50px;border:0;border-radius:16px;font:600 16px/1 inherit;background:var(--tint);color:#fff}
.button{display:grid;place-items:center;text-decoration:none}
button.secondary{background:transparent;color:var(--tint)}
</style></head><body><main>${body}</main></body></html>`;
}
