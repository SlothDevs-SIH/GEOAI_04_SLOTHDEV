import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".geojson": "application/geo+json", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".bin": "application/octet-stream" };

/**
 * Serves dist/ and can be switched "down": every request then fails at the socket, which is what a service worker sees when
 * the network is gone. (Playwright's setOffline does not affect a service worker's own fetches, so it cannot prove offline use.)
 */
export async function startServer() {
  const root = resolve(process.cwd(), "dist");
  let down = false;
  const server: Server = createServer((req, res) => {
    if (down) return req.socket.destroy();
    const p = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
    let f = join(root, p);
    if (!f.startsWith(root) || !existsSync(f) || statSync(f).isDirectory()) f = join(root, "index.html");
    res.writeHead(200, { "content-type": TYPES[extname(f)] ?? "application/octet-stream" });
    res.end(readFileSync(f));
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const port = (server.address() as { port: number }).port;
  return { url: `http://localhost:${port}/`, setDown: (v: boolean) => { down = v; }, close: () => new Promise<void>((ok) => { server.closeAllConnections(); server.close(() => ok()); }) };
}
