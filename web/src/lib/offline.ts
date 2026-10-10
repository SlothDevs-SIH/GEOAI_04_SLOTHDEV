/** A fetch that failed because there is no network (offline, or the file was never cached), not because the server said no. */
export function isOfflineError(message: string | undefined): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return !!message && /failed to fetch|networkerror|load failed|network request failed/i.test(message);
}

/** Name of the Cache Storage bucket that holds scene files (the service worker's runtime cache uses the same one). Bump on data changes. */
export const SCENE_CACHE = "demo-scenes-v1";

const SAVED_KEY = "geoai04.saved.v1";

export function savedIds(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function markSaved(id: string) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify([...new Set([...savedIds(), id])]));
  } catch { /* private mode: the files are still cached, we just forget the label */ }
}

/** The browser asks to save data (Data Saver): never start a background download then. */
export const saveDataOn = (): boolean => {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return !!c?.saveData;
};

export type SaveResult = { ok: true; files: number } | { ok: false; reason: "unsupported" | "quota" | "network"; message: string };

interface Manifest { files: { path: string }[] }

/**
 * Download every file of a scene into the scene cache so it opens with no network.
 * `onProgress(done, total)` is called after each file. Never throws: failures come back as a result with a plain message.
 */
export async function saveScene(base: string, id: string, onProgress?: (done: number, total: number) => void): Promise<SaveResult> {
  if (typeof caches === "undefined") return { ok: false, reason: "unsupported", message: "This browser cannot save files for offline use." };
  try {
    const r = await fetch(`${base}/files.json`);
    if (!r.ok) throw new Error(`${r.status}`);
    const manifest = (await r.json()) as Manifest;
    const urls = [`${base}/files.json`, ...manifest.files.map((f) => `${base}/${f.path}`)];
    const cache = await caches.open(SCENE_CACHE);
    let done = 0;
    onProgress?.(0, urls.length);
    let next = 0;
    const worker = async () => {
      while (next < urls.length) {
        const u = urls[next++];
        await cache.add(new Request(new URL(u, document.baseURI).href));
        onProgress?.(++done, urls.length);
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    markSaved(id);
    return { ok: true, files: urls.length };
  } catch (e) {
    const err = e as Error;
    if (err.name === "QuotaExceededError" || /quota/i.test(err.message)) {
      return { ok: false, reason: "quota", message: "Not enough storage on this device to save this scene. Free some space and try again." };
    }
    return { ok: false, reason: "network", message: "Could not finish saving: check your connection and try again." };
  }
}
