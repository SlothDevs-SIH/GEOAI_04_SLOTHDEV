/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { SCENE_CACHE } from "./src/lib/offline";

// SCENE_CACHE (src/lib/offline.ts) is the cache name: bump it when demo data is regenerated (CacheFirst would otherwise
// keep serving old images).
// base "./" so the built site works on any static host and from a sub-path.
export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "GEOAI 04 · Change that matters",
        short_name: "GEOAI 04",
        description: "Find what really changed between two satellite images, with false alarms filtered out.",
        theme_color: "#07111f",
        background_color: "#07111f",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        // Precache the app shell only (about 3 MB). Scene data is cached when it is first used, or when the user presses
        // "Save for offline" (see runtimeCaching below), so a first visit does not download all scenes.
        globPatterns: ["*.{js,css,html,png,ico,svg,webmanifest}", "assets/**/*.{js,css,png,svg,woff2,mjs}", "demos/index.json", "eval/results.json"],
        globIgnores: ["demos/*/**"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          // small JSON of a scene: show the cached copy at once, refresh in the background
          {
            urlPattern: ({ url }: { url: URL }) => /\/demos\/[^/]+\/[^/]+\.(json|geojson)$/.test(url.pathname),
            handler: "StaleWhileRevalidate",
            options: { cacheName: SCENE_CACHE },
          },
          // heavy, rarely-changing files: cache first. Bump SCENE_CACHE whenever demo data is regenerated.
          {
            urlPattern: ({ url }: { url: URL }) => /\/demos\/[^/]+\/.+\.(webp|bin|geojson|json)$/.test(url.pathname) && /\/(crops|variants)\/|\.(webp|bin)$/.test(url.pathname),
            handler: "CacheFirst",
            options: { cacheName: SCENE_CACHE, expiration: { maxEntries: 1500 } },
          },
          // live API calls, jobs and map tiles are never cached: they are not matched here
        ],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
