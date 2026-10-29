// Sign-in for Lift: Google or GitHub OAuth, both resolving to a verified
// email (the account), and a signed session cookie. Who may sign in is
// decided in app.js.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "lift_session";
export const STATE_COOKIE = "lift_oauth_state";
const SESSION_DAYS = 30;

const b64url = (buffer) => Buffer.from(buffer).toString("base64url");

export function sign(value, secret) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

// A lowercased email, or "" when it doesn't look like one.
export function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

// Version 2 sessions are keyed by email; older ones (a GitHub id) are
// refused, so everyone signs in once after the switch to accounts.
const SESSION_VERSION = 2;

export function createSession(user, secret, now = Date.now()) {
  const payload = b64url(JSON.stringify({ v: SESSION_VERSION, sub: user.email, name: user.name || "", exp: now + SESSION_DAYS * 86_400_000 }));
  return `${payload}.${sign(payload, secret)}`;
}

export function readSession(token, secret, now = Date.now()) {
  if (!token || !secret) return null;
  const [payload, signature] = String(token).split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload, secret))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return data.v === SESSION_VERSION && normalizeEmail(data.sub) && data.exp > now ? data : null;
  } catch {
    return null;
  }
}

export function parseCookies(header = "") {
  const cookies = {};
  for (const part of String(header).split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

export function cookie(name, value, { maxAge, path = "/" } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${path}`, "HttpOnly", "Secure", "SameSite=Lax"];
  if (maxAge !== undefined) parts.push(`Max-Age=${maxAge}`);
  return parts.join("; ");
}

export function sessionCookie(token) {
  return cookie(SESSION_COOKIE, token, { maxAge: SESSION_DAYS * 86_400 });
}

export function clearCookie(name) {
  return cookie(name, "", { maxAge: 0 });
}

// ---------- OAuth ----------
export function newOAuthState(secret) {
  const nonce = b64url(randomBytes(18));
  return { nonce, cookieValue: `${nonce}.${sign(nonce, secret)}` };
}

export function checkOAuthState(cookieValue, returned, secret) {
  const [nonce, signature] = String(cookieValue || "").split(".");
  return Boolean(nonce && signature && returned && safeEqual(signature, sign(nonce, secret)) && safeEqual(nonce, returned));
}

export function githubAuthorizeUrl({ clientId, redirectUri, state }) {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, state, scope: "user:email", allow_signup: "false" }).toString();
  return url.toString();
}

// Exchanges the code and returns the GitHub user's name and primary verified
// email. The access token is used once to read them and then dropped.
export async function githubUser({ code, clientId, clientSecret, redirectUri, fetchImpl = fetch }) {
  const tokenResponse = await fetchImpl("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri })
  });
  const token = await tokenResponse.json();
  if (!token.access_token) throw Object.assign(new Error("GitHub sign-in failed."), { status: 401 });
  const userResponse = await fetchImpl("https://api.github.com/user", {
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token.access_token}`, "user-agent": "lift-web" }
  });
  if (!userResponse.ok) throw Object.assign(new Error("Couldn't read your GitHub profile."), { status: 401 });
  const user = await userResponse.json();
  const emailResponse = await fetchImpl("https://api.github.com/user/emails", {
    headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token.access_token}`, "user-agent": "lift-web" }
  });
  const emails = emailResponse.ok ? await emailResponse.json() : [];
  const primary = Array.isArray(emails) ? emails.find((entry) => entry.primary && entry.verified) : null;
  const email = normalizeEmail(primary?.email);
  if (!email) throw Object.assign(new Error("Your GitHub account needs a verified primary email."), { status: 401 });
  return { email, name: user.name || user.login || "" };
}

export function googleAuthorizeUrl({ clientId, redirectUri, state }) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile", state, prompt: "select_account" }).toString();
  return url.toString();
}

// Exchanges the code and returns the Google account's name and email, which
// must be verified. The access token is used once and then dropped.
export async function googleUser({ code, clientId, clientSecret, redirectUri, fetchImpl = fetch }) {
  const tokenResponse = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: String(code || ""), client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }).toString()
  });
  const token = await tokenResponse.json();
  if (!token.access_token) throw Object.assign(new Error("Google sign-in failed."), { status: 401 });
  const infoResponse = await fetchImpl("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${token.access_token}` } });
  if (!infoResponse.ok) throw Object.assign(new Error("Couldn't read your Google profile."), { status: 401 });
  const info = await infoResponse.json();
  const email = info.email_verified === true ? normalizeEmail(info.email) : "";
  if (!email) throw Object.assign(new Error("Your Google account's email isn't verified."), { status: 401 });
  return { email, name: info.name || "" };
}

