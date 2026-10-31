// The iOS app: Capacitor wraps the built web app (dist/) so it runs offline
// from the phone, and talks to the Lift API at VITE_API_URL (see
// scripts/build-ios.mjs and src/lib/api.js).
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.zachhersick.lift",
  appName: "Lift",
  webDir: "dist",
  ios: {
    contentInset: "never",
    scheme: "Lift"
  },
  plugins: {
    LocalNotifications: {
      sound: "default"
    }
  }
};

export default config;
