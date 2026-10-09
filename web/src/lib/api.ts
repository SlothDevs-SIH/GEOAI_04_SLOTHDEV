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

/** Detectors for Sentinel-2 pairs (`deep` BIT is for 0.5 m RGB imagery and is not offered on the Analyse screen). */
export type DetectorMode = "spectral" | "learned" | "hybrid";

export interface FetchRequest {
  bbox: [number, number, number, number]; // west, south, east, north
  before_date: string;
  after_date: string;
  preset: string;
  mode?: DetectorMode; // default "spectral" on the server
  composite?: number; // median of this many clear images per date (1 = the single clearest image)
  persistence?: number; // 0 = off; 2 to 4 = a change must appear in this many later images
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

/** FastAPI sends `detail` as a string for our errors and as a list of {msg} objects for request validation errors. */
function detailText(d: unknown, fallback: string): string {
  const detail = (d as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((x) => (x as { msg?: string })?.msg ?? String(x)).join("; ") || fallback;
  return fallback;
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API_URL}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(detailText(d, `${r.status} ${r.statusText}`));
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

export interface ModeStatus {
  available?: boolean;
  reason?: string;
  backend?: string;
  threshold?: number | null;
  note?: string;
}

/** The parts of GET /health the site uses. Every field is optional: an older server may omit some. */
export interface ApiHealth {
  ok?: boolean;
  version?: string;
  modes?: string[];                                   // available detectors, plus "radar"
  models?: { learned?: boolean; deep?: boolean };
  model_status?: Record<string, ModeStatus>;
  default_mode?: string;
  measured_default_method?: string | null;
}

/** The parsed /health body, or undefined when no API is configured or it does not answer (4 s limit). */
export async function fetchHealth(timeoutMs = 4000): Promise<ApiHealth | undefined> {
  if (!API_URL) return undefined;
  try {
    const r = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return undefined;
    const body = await r.json().catch(() => ({}));
    return (body && typeof body === "object" ? body : {}) as ApiHealth;
  } catch {
    return undefined;
  }
}

export async function apiHealth(): Promise<boolean> {
  return (await fetchHealth()) !== undefined;
}

export interface UploadRequest {
  before?: File;
  after: File;
  preset: string;
  mode: DetectorMode | "radar";
}

/** Start an analysis of uploaded GeoTIFFs (`/analyze`). Resolves with the job id; throws with the server's message. */
export async function startAnalyze(req: UploadRequest): Promise<{ job_id: string }> {
  const fd = new FormData();
  if (req.before && req.mode !== "radar") fd.append("before", req.before);
  fd.append("after", req.after);
  fd.append("preset", req.preset);
  fd.append("mode", req.mode);
  const r = await fetch(`${API_URL}/analyze`, { method: "POST", body: fd });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(detailText(d, r.statusText || `HTTP ${r.status}`));
  return d as { job_id: string };
}
