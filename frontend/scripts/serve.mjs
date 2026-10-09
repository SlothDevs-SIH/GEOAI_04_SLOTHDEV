// Static server for dist/ with SPA fallback (every unknown path serves index.html), used by e2e and local preview.
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const port = Number(process.env.PORT ?? 4173);
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".geojson": "application/geo+json", ".webp": "image/webp", ".png": "image/png", ".ico": "image/x-icon", ".bin": "application/octet-stream" };
createServer((req, res) => {
  const p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  let f = join(root, p);
  if (!existsSync(f) || statSync(f).isDirectory()) f = existsSync(join(f, "index.html")) && p !== "/" ? join(f, "index.html") : join(root, "index.html");
  res.writeHead(200, { "content-type": types[extname(f)] ?? "application/octet-stream" });
  res.end(readFileSync(f));
}).listen(port, () => console.log(`serving dist on :${port}`));
