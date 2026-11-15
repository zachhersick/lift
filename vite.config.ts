import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

// In development the API runs inside the Vite server: same code as the
// Vercel function, an in-memory store and a "Sign in" that skips Google and
// GitHub: you're the admin dev@lift.test, and /api/auth/login?provider=dev&as=
// someone@example.com signs in as an invited test account.
function liftApi(): Plugin {
  const mount = async (middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void }, port: number) => {
    const { appConfig, createApp } = await import("./server/app.js");
    const { MemoryStore, NeonStore } = await import("./server/store.js");
    const env: Record<string, string | undefined> = {
      APP_URL: `http://localhost:${port}`,
      SESSION_SECRET: "local-development-secret-not-for-production",
      ADMIN_EMAILS: "dev@lift.test",
      LIFT_DEV_LOGIN: "1",
      ...process.env
    };
    delete env.VERCEL;
    const store = env.DATABASE_URL ? new NeonStore(env.DATABASE_URL, { legacyOwner: appConfig(env).admins[0] }) : new MemoryStore();
    const app = createApp({ store, env });
    middlewares.use((req, res, next) => (req.url?.startsWith("/api/") || req.url?.startsWith("/.well-known/oauth-") ? app.handle(req, res) : next()));
  };
  return {
    name: "lift-api",
    configureServer: (server) => mount(server.middlewares, server.config.server.port || 4330),
    configurePreviewServer: (server) => mount(server.middlewares, server.config.preview.port || 4330)
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    liftApi(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: false,
      manifest: false,
      workbox: {
        // autoUpdate only sets these itself with injectRegister "auto". Without them a
        // new build waits until every window of the app has closed.
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ["**/*.{js,css,html,png,svg,woff2,webmanifest}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true
      }
    })
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { port: 4330, strictPort: true },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        // Libraries the app loads up front get their own chunk, so a deploy
        // that only changes Lift's code leaves them cached. Capacitor and
        // workbox stay out: they're imported on demand.
        codeSplitting: {
          groups: [{ name: "vendor", test: /node_modules[\\/](react|react-dom|scheduler|motion|motion-dom|motion-utils|framer-motion|radix-ui|@radix-ui|vaul|lucide-react|@number-flow|number-flow|esm-env|@preact|clsx|tailwind-merge|class-variance-authority)[\\/]/ }]
        }
      }
    }
  }
});
