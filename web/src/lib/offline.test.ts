import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isOfflineError, saveScene, savedIds } from "./offline";

function fakeCaches(add: (r: Request) => Promise<void>) {
  const added: string[] = [];
  vi.stubGlobal("caches", { open: async () => ({ add: async (r: Request) => { await add(r); added.push(r.url); } }) });
  return added;
}
const manifest = { files: [{ path: "meta.json" }, { path: "after.webp" }, { path: "crops/1_after.webp" }] };

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(manifest))));
});
afterEach(() => vi.unstubAllGlobals());

describe("saveScene", () => {
  it("caches files.json and every listed file, reports progress and remembers the scene", async () => {
    const added = fakeCaches(async () => undefined);
    const seen: [number, number][] = [];
    const r = await saveScene("http://x/demos/s", "s", (d, t) => seen.push([d, t]));
    expect(r).toEqual({ ok: true, files: 4 });
    expect(added.map((u) => u.replace("http://x/demos/s/", "")).sort()).toEqual(["after.webp", "crops/1_after.webp", "files.json", "meta.json"]);
    expect(seen.at(-1)).toEqual([4, 4]);
    expect(savedIds()).toEqual(["s"]);
  });
  it("reports a full device in plain words and does not mark the scene saved", async () => {
    fakeCaches(async () => { throw Object.assign(new Error("full"), { name: "QuotaExceededError" }); });
    const r = await saveScene("http://x/demos/s", "s");
    expect(r).toMatchObject({ ok: false, reason: "quota" });
    expect(savedIds()).toEqual([]);
  });
  it("reports a network failure", async () => {
    fakeCaches(async () => { throw new TypeError("Failed to fetch"); });
    expect(await saveScene("http://x/demos/s", "s")).toMatchObject({ ok: false, reason: "network" });
  });
  it("says so when the browser has no Cache Storage", async () => {
    vi.stubGlobal("caches", undefined);
    expect(await saveScene("http://x/demos/s", "s")).toMatchObject({ ok: false, reason: "unsupported" });
  });
});

describe("isOfflineError", () => {
  it("recognises a network failure but not a server answer", () => {
    expect(isOfflineError("Failed to fetch")).toBe(true);
    expect(isOfflineError("404 Not Found for /demos/x/meta.json")).toBe(false);
  });
});
