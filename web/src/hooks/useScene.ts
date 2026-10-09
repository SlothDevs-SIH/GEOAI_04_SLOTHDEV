import { useCallback, useEffect, useMemo, useState } from "react";
import { loadJobScene, loadRaw, loadScene } from "../lib/api";
import type { ChangeProps, Detector, FeatureCollection, SceneData, Summary } from "../lib/types";

export const DETECTORS: Detector[] = ["spectral", "learned", "hybrid"];
export const parseDetector = (v: string | null | undefined): Detector => (DETECTORS.includes(v as Detector) ? (v as Detector) : "spectral");

/** Folder (under the scene's static base) that holds one detector's files; the default spectral result sits in the scene root. */
export const variantBase = (base: string, mode: Detector) => (mode === "spectral" ? base : `${base}/variants/${mode}`);

interface VariantFiles {
  summary: Summary;
  filtered: FeatureCollection<ChangeProps>;
}

export interface SceneState {
  data?: SceneData;
  error?: string;
  loading: boolean;
  /** The detector actually requested: the URL mode, or spectral when this scene has no such variant. */
  mode: Detector;
  /** True while a non-default detector's files are being fetched; `data` still shows the previous detector meanwhile. */
  variantLoading: boolean;
  variantError?: string;
  /** The default spectral result's counts, kept so the detector switch can show them while another variant is open. */
  spectral?: { raw: number; kept: number };
  retry: () => void;
}

async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url}`);
  return (await r.json()) as T;
}

interface Store {
  key: string; // `${job}:${id}`, so a stale answer from the previous scene is never shown
  base?: SceneData;
  error?: string;
  variants: Partial<Record<Detector, VariantFiles>>;
  failed: Partial<Record<Detector, string>>;
  shown: Detector; // detector whose data is on screen
}
const EMPTY: Omit<Store, "key"> = { variants: {}, failed: {}, shown: "spectral" };

/**
 * A demo scene by id, or (job = true) a finished live analysis by job id.
 * `mode` selects a precomputed detector variant (learned / hybrid) of the same scene; it is ignored for scenes without one.
 * The variant's files load on demand and the previous detector's data stays visible until they arrive.
 */
export function useScene(id: string | undefined, job = false, mode: Detector = "spectral"): SceneState {
  const key = `${job ? "job" : "scene"}:${id ?? ""}`;
  const [store, setStore] = useState<Store>({ key, ...EMPTY });
  const [nonce, setNonce] = useState(0);
  const [variantNonce, setVariantNonce] = useState(0);
  const retry = useCallback(() => {
    setNonce((n) => n + 1);
    setVariantNonce((n) => n + 1);
  }, []);

  // 1. the scene itself (spectral files)
  useEffect(() => {
    if (!id) return;
    let alive = true;
    setStore({ key, ...EMPTY });
    (job ? loadJobScene(id) : loadScene(id))
      .then((base) => alive && setStore((s) => (s.key === key ? { ...s, base } : s)))
      .catch((e: Error) => alive && setStore((s) => (s.key === key ? { ...s, error: e.message } : s)));
    return () => {
      alive = false;
    };
  }, [id, job, key, nonce]);

  const base = store.key === key ? store.base : undefined;
  const effective: Detector = mode !== "spectral" && base?.meta.variants?.some((v) => v.mode === mode) ? mode : "spectral";

  // 2. a variant's files, when one is requested and not yet loaded
  useEffect(() => {
    if (!base) return;
    if (effective === "spectral") {
      setStore((s) => (s.key === key && s.shown !== "spectral" ? { ...s, shown: "spectral" } : s));
      return;
    }
    let alive = true;
    const have = store.variants[effective];
    if (have) {
      setStore((s) => (s.key === key && s.shown !== effective ? { ...s, shown: effective } : s));
      return;
    }
    const dir = variantBase(base.base, effective);
    setStore((s) => (s.key === key && s.failed[effective] ? { ...s, failed: { ...s.failed, [effective]: undefined } } : s));
    Promise.all([getJSON<Summary>(`${dir}/summary.json`), getJSON<FeatureCollection<ChangeProps>>(`${dir}/result_filtered.geojson`)])
      .then(([summary, filtered]) => {
        if (!alive) return;
        setStore((s) => (s.key !== key ? s : { ...s, variants: { ...s.variants, [effective]: { summary, filtered } }, failed: { ...s.failed, [effective]: undefined }, shown: effective }));
      })
      .catch((e: Error) => alive && setStore((s) => (s.key === key ? { ...s, failed: { ...s.failed, [effective]: e.message } } : s)));
    return () => {
      alive = false;
    };
    // `store.variants` is read only to skip a fetch that already succeeded
  }, [base, effective, key, variantNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const data = useMemo<SceneData | undefined>(() => {
    if (!base) return undefined;
    const v = store.shown === "spectral" ? undefined : store.variants[store.shown];
    if (!v) return { ...base, detector: "spectral", dataBase: base.base };
    return { ...base, summary: v.summary, filtered: v.filtered, detector: store.shown, dataBase: variantBase(base.base, store.shown) };
  }, [base, store.shown, store.variants]);

  const spectral = base && { raw: base.summary.raw_detections, kept: base.summary.after_filter };
  const failedMsg = store.key === key ? store.failed[effective] : undefined;
  return {
    data,
    error: store.key === key ? store.error : undefined,
    loading: !!id && !base && !(store.key === key && store.error),
    mode: effective,
    variantLoading: !!base && effective !== store.shown && !failedMsg,
    variantError: failedMsg,
    spectral,
    retry,
  };
}

const EMPTY_FC: FeatureCollection = { type: "FeatureCollection", features: [] };

/** The unfiltered layer is loaded only when the false-alarm filter is switched off. A failed load falls back to an empty layer. */
export function useRaw(base: string | undefined, wanted: boolean): FeatureCollection | undefined {
  const [raw, setRaw] = useState<{ base: string; fc: FeatureCollection }>();
  useEffect(() => {
    if (!base || !wanted || raw?.base === base) return;
    let alive = true;
    loadRaw(base).then((fc) => alive && setRaw({ base, fc })).catch(() => alive && setRaw({ base, fc: EMPTY_FC }));
    return () => {
      alive = false;
    };
  }, [base, wanted, raw?.base]);
  return raw && raw.base === base ? raw.fc : undefined;
}
