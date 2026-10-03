import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Emits /version.json (never precached) so open apps can detect a newer deploy even when
// their service worker / cache is stale. Single source of truth: src/lib/version.js.
function versionManifest() {
  const read = () => /APP_VERSION\s*=\s*"([^"]+)"/.exec(fs.readFileSync(path.resolve(__dirname, "src/lib/version.js"), "utf8"))?.[1] || "";
  return {
    name: "sparklog-version-manifest",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version: read() }) });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    versionManifest(),
    VitePWA({
      // autoUpdate: a new deploy replaces the cached app on next load — no
      // stale-version lock-in for the crew already using it.
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "apple-touch-icon.png"],
      manifest: {
        name: "SparkLog",
        short_name: "SparkLog",
        description: "Feuilles de temps et suivi CCQ",
        theme_color: "#151515",
        background_color: "#151515",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/pwa-192.png?v=2", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png?v=2", sizes: "512x512", type: "image/png" },
          { src: "/pwa-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // SPA: unknown navigations fall back to the cached app shell so the app
        // opens offline. API/auth calls are never cached (must hit the network).
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/functions\//, /supabase/i],
        globPatterns: ["**/*.{js,css,html,svg,png,jpg,jpeg,woff2}"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
