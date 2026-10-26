import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath, URL } from "node:url";

// In development the API runs inside the Vite server: same code as the
// Vercel function, an in-memory store and a "Sign in" that skips GitHub.
function liftApi(): Plugin {
  const mount = async (middlewares: { use: (fn: (req: any, res: any, next: () => void) => void) => void }, port: number) => {
    const { createApp } = await import("./server/app.js");
    const { MemoryStore, NeonStore } = await import("./server/store.js");
    const env: Record<string, string | undefined> = {
      APP_URL: `http://localhost:${port}`,
      SESSION_SECRET: "local-development-secret-not-for-production",
      ALLOWED_GITHUB_ID: "1",
      LIFT_DEV_LOGIN: "1",
      ...process.env
    };
    delete env.VERCEL;
    const store = env.DATABASE_URL ? new NeonStore(env.DATABASE_URL) : new MemoryStore();
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
        globPatterns: ["**/*.{js,css,html,png,svg,woff2,webmanifest}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true
      }
    })
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: { port: 4330, strictPort: true },
  build: { target: "es2022", chunkSizeWarningLimit: 700 }
});
