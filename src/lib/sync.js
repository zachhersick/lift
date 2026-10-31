// Keeps this device and the Lift server in step. Runs on open, when the
// connection comes back, when the app returns to the foreground, two seconds
// after any change and once a minute. Works fine signed out; it just waits.
// When the server says a different account is signed in, the app switches to
// that account's database (account.js) and reloads.
import { signal } from "@preact/signals-core";
import { forgetAccount, switchAccount } from "./account.js";
import * as db from "./db.js";
import { applyRemote, pending, records, setMembership, whenChanged } from "./store.js";

// `user` is { email, name, admin, vip }; `coach` says whether this account
// gets weekly reviews; `providers` are the sign-in options.
export const sync = signal({ status: "starting", user: null, coach: false, providers: [], lastSync: null, error: "" });

let running = false;
let again = false;
let timer = null;

const set = (change) => (sync.value = { ...sync.value, ...change });

export async function checkSession() {
  try {
    const response = await fetch("/api/session", { credentials: "same-origin", cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    // Signing in as someone else switches databases. An expired session
    // keeps showing your data until you sign in again; only signing out
    // switches to the guest database.
    if (body.ok && switchAccount(body.user.email)) {
      location.reload();
      return undefined;
    }
    set({ user: body.ok ? body.user : null, coach: Boolean(body.ok && body.coach), providers: body.providers || [], status: body.ok ? sync.value.status : "signedOut" });
    if (body.ok) setMembership(body.user.vip);
    return body.ok ? body.user : null;
  } catch {
    set({ status: "offline" });
    return undefined;
  }
}

export async function syncNow() {
  if (running) {
    again = true;
    return;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) return set({ status: "offline" });
  running = true;
  set({ status: "syncing" });
  try {
    let more = true;
    while (more) {
      const since = (await db.getMeta("cursor")) || 0;
      const changes = await db.loadOutbox();
      const response = await fetch("/api/sync", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ since, changes })
      });
      if (response.status === 401) {
        set({ status: "signedOut", user: null });
        return;
      }
      const body = await response.json();
      if (!response.ok || !body.ok) throw new Error(body.error || `Sync failed (${response.status}).`);
      await applyRemote(body.records || []);
      await db.ackOutbox(changes);
      if (body.reset) {
        // The server lost its copy: queue everything on this device again.
        await db.putRecords([...records.value.values()], { outbox: true });
        await db.setMeta("cursor", 0);
        more = true;
        continue;
      }
      await db.setMeta("cursor", body.cursor ?? since);
      more = Boolean(body.more);
    }
    pending.value = (await db.loadOutbox()).length;
    const lastSync = Date.now();
    await db.setMeta("lastSync", lastSync);
    set({ status: "synced", lastSync, error: "" });
  } catch (error) {
    set({ status: navigator.onLine === false ? "offline" : "error", error: error.message || "Sync failed." });
  } finally {
    running = false;
    if (again) {
      again = false;
      schedule(500);
    }
  }
}

export function schedule(delay = 2000) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (sync.value.status !== "signedOut") syncNow();
  }, delay);
}

export async function startSync() {
  set({ lastSync: (await db.getMeta("lastSync")) || null });
  whenChanged(() => schedule());
  const user = await checkSession();
  if (user) syncNow();
  window.addEventListener("online", async () => {
    if (await checkSession()) syncNow();
  });
  window.addEventListener("offline", () => set({ status: "offline" }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && sync.value.user) syncNow();
  });
  setInterval(() => {
    if (sync.value.user && document.visibilityState === "visible") syncNow();
  }, 60_000);
}

// Deletes the account on the server, then everything it left on this device.
export async function deleteAccount() {
  const email = sync.value.user?.email;
  const response = await fetch("/api/account/delete", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.ok) throw new Error(body.error || "Couldn't delete your account. Try again.");
  setMembership(false);
  if (email) forgetAccount(email);
  location.reload();
}

export async function signOut() {
  await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => {});
  // Your data stays on this device under your account; signed out shows the
  // guest database.
  setMembership(false);
  if (switchAccount("")) return location.reload();
  set({ status: "signedOut", user: null, coach: false });
}
