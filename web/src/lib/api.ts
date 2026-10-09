import type { ChangeProps, FeatureCollection, SceneData, SceneMeta, Summary } from "./types";

/** Live API base URL (optional). The site works without it for demo scenes (static-first). */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

const STATIC = `${import.meta.env.BASE_URL}demos`;

async function getJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
  return (await r.json()) as T;
}

export const staticBase = (id: string) => `${STATIC}/${id}`;

/** Demo index: static file first, then the API. */
export async function listScenes(): Promise<SceneMeta[]> {
  try {
    return await getJSON<SceneMeta[]>(`${STATIC}/index.json`);
  } catch (e) {
    if (API_URL) return getJSON<SceneMeta[]>(`${API_URL}/demos`);
    throw e;
  }
}

/** One scene: static files first (BACKEND_PLAN §8), then the API's /demos routes. */
export async function loadScene(id: string): Promise<SceneData> {
  const bases = [staticBase(id), ...(API_URL ? [`${API_URL}/demos/${id}/files`] : [])];
  let lastErr: unknown;
  for (const base of bases) {
    try {
      const [meta, summary, filtered] = await Promise.all([
        getJSON<SceneMeta>(`${base}/meta.json`),
        getJSON<Summary>(`${base}/summary.json`),
        getJSON<FeatureCollection<ChangeProps>>(`${base}/result_filtered.geojson`),
      ]);
      return { meta, summary, filtered, base };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`scene ${id} not found`);
}

/** A finished live job, opened like a demo scene: the API writes the same files under /jobs/<id>/files. */
export async function loadJobScene(jobId: string): Promise<SceneData> {
  const base = `${API_URL}/jobs/${jobId}/files`;
  const [meta, summary, filtered] = await Promise.all([
    getJSON<SceneMeta>(`${base}/meta.json`),
    getJSON<Summary>(`${base}/summary.json`),
    getJSON<FeatureCollection<ChangeProps>>(`${base}/result_filtered.geojson`),
  ]);
  return { meta, summary, filtered, base };
}

export interface FetchRequest {
  bbox: [number, number, number, number]; // west, south, east, north
  before_date: string;
  after_date: string;
  preset: string;
}

export interface ScenePick {
  scene: string;
  date: string;
  tile_cloud_pct: number;
  aoi_invalid_pct: number;
  days_from_target: number;
}

export interface FetchPreview {
  bbox: number[];
  size_km: [number, number];
  before: ScenePick;
  after: ScenePick;
  warnings: string[];
}

export interface JobState {
  status: string;
  stage?: string;
  progress?: number;
  warnings?: string[];
  error?: string;
  fetch?: { before: ScenePick; after: ScenePick };
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d as { detail?: string }).detail ?? `${r.status} ${r.statusText}`);
  return d as T;
}

/** Which scenes would be used for this box and these dates (no bands are downloaded). */
export const fetchPreview = (req: FetchRequest) => postJSON<FetchPreview>("/fetch-s2/preview", req);
/** Start an analysis of any box: the server fetches both scenes, then runs the normal engine as a job. */
export const startFetch = (req: FetchRequest) => postJSON<{ job_id: string }>("/fetch-s2", req);
export const getJob = (id: string) => getJSON<JobState>(`${API_URL}/jobs/${id}`);
export const getJobSummary = <T = unknown>(id: string) => getJSON<T>(`${API_URL}/jobs/${id}/summary`);

export const loadRaw = (base: string) => getJSON<FeatureCollection>(`${base}/result_raw.geojson`);

export interface Metrics {
  [k: string]: unknown;
}

export async function loadMetrics(): Promise<Metrics> {
  try {
    return await getJSON<Metrics>(`${import.meta.env.BASE_URL}eval/results.json`);
  } catch (e) {
    if (API_URL) return getJSON<Metrics>(`${API_URL}/metrics`);
    throw e;
  }
}

export async function apiHealth(): Promise<boolean> {
  if (!API_URL) return false;
  try {
    const r = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(4000) });
    return r.ok;
  } catch {
    return false;
  }
}
