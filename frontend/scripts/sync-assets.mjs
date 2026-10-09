// Copies the exported demo scenes and eval results into public/ so Expo serves them from the web root.
// Source of truth is web/public (written by scripts/export_demo_assets.py and eval/build_results.py).
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../web/public");
const dst = resolve(here, "../public");
if (!existsSync(src)) {
  console.error(`sync-assets: ${src} not found`);
  process.exit(1);
}
mkdirSync(dst, { recursive: true });
for (const name of ["demos", "eval", "architecture.png", "icon-192.png", "icon-512.png"]) {
  rmSync(resolve(dst, name), { recursive: true, force: true });
  cpSync(resolve(src, name), resolve(dst, name), { recursive: true });
}
console.log("sync-assets: copied demos, eval, icons to public/");
