// Offline support: precache the app shell, cache demo scenes and eval results as they are fetched,
// and fall back to the cache when the network is gone. API calls and map tiles are never cached here.
const VERSION = "geoai04-v1";
const SHELL = ["/", "/index.html", "/icon-192.png", "/maplibre-gl-worker.mjs", "/maplibre-gl-shared.mjs", "/maplibre-gl.css", "/demos/index.json", "/eval/results.json", "/architecture.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => undefined)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("message", async (e) => {
  // the page asks us to cache a whole scene folder (urls listed) so it opens offline
  if (e.data?.type === "precache") {
    const c = await caches.open(VERSION);
    await Promise.all((e.data.urls || []).map((u) => c.add(u).catch(() => undefined)));
  }
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // map tiles, API
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok && (url.pathname.startsWith("/demos/") || url.pathname.startsWith("/eval/") || url.pathname.startsWith("/_expo/") || url.pathname.startsWith("/assets/") || SHELL.includes(url.pathname))) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(async () => {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === "navigate") return (await caches.match("/index.html")) || (await caches.match("/")) || Response.error();
      return Response.error();
    }),
  );
});
