// Recording helpers: a visible cursor with click ripples, captions, title cards, smooth scrolling. Used by record.mjs.
import { chromium } from "@playwright/test";

export const BASE = process.env.BASE ?? "http://localhost:4173/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const hold = sleep;

const OVERLAY = `
(() => {
  if (window.__rec) return; window.__rec = true;
  const css = document.createElement("style");
  css.textContent = \`
  #rec-cursor{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transform:translate(-100px,-100px);transition:none}
  #rec-cursor svg{filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))}
  .rec-ripple{position:fixed;z-index:2147483646;pointer-events:none;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:3px solid #22D3EE;animation:rec-rip .6s ease-out forwards}
  @keyframes rec-rip{to{transform:scale(4);opacity:0}}
  #rec-cap{position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483645;max-width:86%;padding:12px 22px;border-radius:14px;
    background:rgba(7,17,31,.88);border:1px solid #294158;color:#F1F5F9;font:600 var(--cap-size,22px)/1.35 Inter,system-ui,sans-serif;text-align:center;opacity:0;transition:opacity .35s;pointer-events:none}
  #rec-cap.on{opacity:1}
  #rec-card{position:fixed;inset:0;z-index:2147483644;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:40px;
    background:radial-gradient(ellipse at 50% 30%,#10263f 0%,#07111F 70%);color:#F1F5F9;font-family:Inter,system-ui,sans-serif;opacity:0;transition:opacity .6s;pointer-events:none}
  #rec-card.on{opacity:1}
  #rec-card h1{margin:0;font-size:var(--h-size,54px);line-height:1.1;font-weight:750;letter-spacing:-.02em}
  #rec-card h1 b{color:#22D3EE}
  #rec-card p{margin:0;font-size:var(--p-size,24px);color:#BAC7D7;max-width:900px;line-height:1.4}
  #rec-card .big{font-size:var(--big-size,96px);font-weight:750;color:#22D3EE;font-variant-numeric:tabular-nums}
  \`;
  const c = document.createElement("div"); c.id = "rec-cursor";
  c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M3 2l7 18 2.6-7.4L20 10z" fill="#fff" stroke="#07111F" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  const cap = document.createElement("div"); cap.id = "rec-cap";
  const card = document.createElement("div"); card.id = "rec-card";
  const add = () => { document.head.appendChild(css); document.body.append(c, cap, card); };
  if (document.body) add(); else document.addEventListener("DOMContentLoaded", add);
  addEventListener("mousemove", (e) => { c.style.transform = "translate(" + (e.clientX - 3) + "px," + (e.clientY - 2) + "px)"; }, true);
  addEventListener("mousedown", (e) => { const r = document.createElement("div"); r.className = "rec-ripple"; r.style.left = e.clientX + "px"; r.style.top = e.clientY + "px"; document.body.append(r); setTimeout(() => r.remove(), 700); }, true);
  window.__caption = (t) => { const el = document.getElementById("rec-cap"); if (!t) { el.classList.remove("on"); return; } el.textContent = t; el.classList.add("on"); };
  window.__card = (html) => { const el = document.getElementById("rec-card"); if (!html) { el.classList.remove("on"); return; } el.innerHTML = html; el.classList.add("on"); };
})();`;

export async function open({ width, height, scale = 1, out, size }) {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium", args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, recordVideo: { dir: out, size: size ?? { width: Math.round(width * scale), height: Math.round(height * scale) } }, reducedMotion: "no-preference" });
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  const mouse = { x: width / 2, y: height / 2 };
  const api = {
    page,
    async goto(path) { await page.goto(BASE + path); await page.waitForLoadState("load"); await hold(600); },
    caption: (t) => page.evaluate((x) => window.__caption(x), t),
    card: (html) => page.evaluate((x) => window.__card(x), html),
    async glide(target, { steps = 28, dx = 0, dy = 0 } = {}) {
      const loc = typeof target === "string" ? page.locator(target).first() : target;
      await loc.scrollIntoViewIfNeeded().catch(() => undefined);
      const b = await loc.boundingBox();
      if (!b) return;
      const tx = b.x + b.width / 2 + dx, ty = b.y + b.height / 2 + dy;
      await page.mouse.move(tx, ty, { steps }); mouse.x = tx; mouse.y = ty;
      await hold(250);
    },
    async click(target, opts) { await api.glide(target, opts); await page.mouse.down(); await hold(80); await page.mouse.up(); await hold(350); },
    async dragX(target, toFrac, { steps = 40 } = {}) {   // drag a horizontal handle to a fraction of the viewport width
      const loc = typeof target === "string" ? page.locator(target).first() : target;
      const b = await loc.boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 20 });
      await page.mouse.down(); await hold(120);
      await page.mouse.move(toFrac.x, b.y + b.height / 2, { steps }); await hold(120);
      await page.mouse.up(); await hold(300);
    },
    async scroll(y, ms = 1200) { await page.evaluate((v) => window.scrollTo({ top: v, behavior: "smooth" }), y); await hold(ms); },
    async close() { const v = page.video(); await ctx.close(); const path = await v.path(); await browser.close(); return path; },
  };
  return api;
}
