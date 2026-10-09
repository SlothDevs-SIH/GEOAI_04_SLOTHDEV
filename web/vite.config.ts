/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// base "./" so the built site works on any static host and from a sub-path.
// The PWA caches the app shell AND the demo scenes (about 22 MB), so the demo opens with no network at all.
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
        theme_color: "#0b63ce",
        background_color: "#f6f7f9",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,webp,json,geojson,mjs,bin}"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: "index.html",
        // live API calls and map tiles are never served from the cache
        runtimeCaching: [],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
