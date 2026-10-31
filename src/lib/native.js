// The iOS app's native pieces, loaded only inside Capacitor (main.tsx):
// sign-in through the system browser back to lift://auth, the session token
// in the Keychain, real haptics, and a notification when rest is up, so the
// rest timer works with the phone locked.
import { SecureStorage } from "@aparajita/capacitor-secure-storage";
import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { LocalNotifications } from "@capacitor/local-notifications";
import { effect } from "@preact/signals-core";
import { useBrowser, useTokenStore } from "./api.js";
import { useNativeHaptic } from "./haptics.js";
import { completeSignIn } from "./sync.js";
import { restTimer } from "./timer.js";

const TOKEN = "lift-token";
const REST = 1;

export function startNative() {
  useTokenStore({
    get: async () => String((await SecureStorage.get(TOKEN).catch(() => null)) || ""),
    set: (value) => (value ? SecureStorage.set(TOKEN, value) : SecureStorage.remove(TOKEN)).catch(() => {})
  });
  useBrowser((url) => Browser.open({ url, presentationStyle: "popover" }));
  App.addListener("appUrlOpen", ({ url }) => {
    if (!url.startsWith("lift://auth")) return;
    Browser.close().catch(() => {});
    completeSignIn(url);
  });
  // A light tap for a set, the success pattern for a PR.
  useNativeHaptic((pattern) => (Array.isArray(pattern) ? Haptics.notification({ type: NotificationType.Success }) : Haptics.impact({ style: ImpactStyle.Light })).catch(() => {}));

  // One pending notification that follows the rest timer: rescheduled when
  // it's adjusted, cancelled when it's stopped. Permission is asked the first
  // time a rest starts.
  let allowed = null;
  effect(() => {
    const timer = restTimer.value;
    LocalNotifications.cancel({ notifications: [{ id: REST }] }).catch(() => {});
    if (!timer?.endsAt || timer.endsAt <= Date.now()) return;
    (async () => {
      allowed ??= (await LocalNotifications.requestPermissions()).display === "granted";
      if (!allowed || restTimer.value?.endsAt !== timer.endsAt) return;
      await LocalNotifications.schedule({ notifications: [{ id: REST, title: "Rest's up", body: "Time for your next set.", schedule: { at: new Date(timer.endsAt), allowWhileIdle: true } }] });
    })().catch(() => {});
  });
}
