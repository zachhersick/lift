// Calls to the Lift API. On the web they're same-origin requests with the
// session cookie. In the iOS app (Capacitor) the API lives at VITE_API_URL,
// and the session is a bearer token the app gets by signing in through the
// system browser: lift://auth brings back a single-use code that only this
// app's PKCE verifier can redeem.
const TOKEN = "lift-token";
const VERIFIER = "lift-verifier";

export const native = typeof window !== "undefined" && Boolean(window.Capacitor?.isNativePlatform?.());
const base = native ? String(import.meta.env.VITE_API_URL || "").replace(/\/$/, "") : "";
// Where Lift's server is, for links people copy (the ChatGPT connector).
export const apiOrigin = base || (typeof location !== "undefined" ? location.origin : "");

function stored(key) {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function store(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {}
}

// Where the app keeps its session token; the iOS shell swaps in the Keychain.
let tokens = { get: async () => stored(TOKEN), set: async (value) => store(TOKEN, value) };
export function useTokenStore(store) {
  tokens = store;
}

export async function api(path, init = {}) {
  if (!native) return fetch(path, { credentials: "same-origin", ...init });
  const token = await tokens.get();
  return fetch(`${base}${path}`, { ...init, credentials: "omit", headers: { ...init.headers, ...(token ? { authorization: `Bearer ${token}` } : {}) } });
}

export const postJson = (path, body = {}) => api(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// How the app opens the sign-in page; the iOS shell swaps in the system
// browser.
let openBrowser = (url) => window.open(url, "_blank");
export function useBrowser(open) {
  openBrowser = open;
}

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function signIn(provider = "") {
  const query = provider ? `?provider=${encodeURIComponent(provider)}` : "";
  if (!native) {
    location.href = `/api/auth/login${query}`;
    return;
  }
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  store(VERIFIER, verifier);
  await openBrowser(`${base}/api/auth/login${query}${query ? "&" : "?"}client=ios&challenge=${challenge}`);
}

// Trades the code from lift://auth?code=… for a session token. Returns ""
// when signed in, or why not (lift://auth?error=… when the server refused).
export async function finishSignIn(link) {
  const params = new URL(link).searchParams;
  const code = params.get("code");
  const verifier = stored(VERIFIER);
  if (!code || !verifier) return params.get("error") || "failed";
  const response = await postJson("/api/auth/token", { code, verifier });
  const body = await response.json().catch(() => ({}));
  store(VERIFIER, "");
  if (!response.ok || !body.ok) return "expired";
  await tokens.set(body.token);
  return "";
}

export function forgetToken() {
  return tokens.set("");
}
