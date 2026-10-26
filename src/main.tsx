import { effect } from "@preact/signals-core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { notify } from "./lib/notify";
import { load, saveSettings, settings } from "./lib/store.js";
import { startSync } from "./lib/sync.js";
import { applyAppearance } from "./lib/theme.js";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

load().then(() => {
  effect(() => applyAppearance({ theme: settings.value.theme, tint: settings.value.tint }));
  startSync();
  // The server dates meals from ChatGPT in your time zone.
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (zone && settings.value.timeZone !== zone) saveSettings({ timeZone: zone });
  const signin = new URLSearchParams(location.search).get("signin");
  if (signin) {
    const text = ({ expired: "Sign-in timed out", failed: "GitHub sign-in failed", denied: "That GitHub account isn't allowed" } as Record<string, string>)[signin] || "Sign-in didn't work";
    notify(text, { status: "error" });
    history.replaceState(null, "", location.pathname + location.hash);
  }
});

// Locally the service worker would keep serving the previous build, so it
// only runs there with ?sw in the URL (for testing offline mode).
const local = ["localhost", "127.0.0.1"].includes(location.hostname) && !new URLSearchParams(location.search).has("sw");
// The v2 app cached itself under "lift-<hash>"; the new worker uses Workbox caches.
caches?.keys().then((keys) => keys.filter((k) => /^lift-[0-9a-f]+$/.test(k)).forEach((k) => caches.delete(k))).catch(() => {});

if ("serviceWorker" in navigator) {
  if (local) navigator.serviceWorker.getRegistrations().then((list) => list.forEach((r) => r.unregister())).catch(() => {});
  else import("virtual:pwa-register").then(({ registerSW }) => registerSW({ immediate: true })).catch(() => {});
}
