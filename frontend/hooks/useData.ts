import { useCallback, useEffect, useState } from "react";
import { listScenes, loadJobScene, loadMetrics, loadRaw, loadScene, STATIC_ROOT, staticBase, type Metrics } from "../lib/api";
import type { FeatureCollection, SceneData, SceneMeta } from "../lib/types";
import type { SensInfo } from "../lib/sensitivity";

export interface Async<T> { data?: T; error?: string; loading: boolean; retry: () => void }

function useAsync<T>(fn: (() => Promise<T>) | undefined, deps: unknown[]): Async<T> {
  const [s, setS] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!fn) return;
    let alive = true;
    setS((p) => ({ data: p.data, loading: true }));
    fn().then((data) => alive && setS({ data, loading: false }), (e: Error) => alive && setS({ error: e.message, loading: false }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  const retry = useCallback(() => setN((x) => x + 1), []);
  return { ...s, retry };
}

export const useScenes = (): Async<SceneMeta[]> => useAsync(listScenes, []);
/** A demo scene by id, or (job = true) a finished live analysis by job id. */
export const useScene = (id: string | undefined, job = false): Async<SceneData> =>
  useAsync(id ? () => (job ? loadJobScene(id) : loadScene(id)) : undefined, [id, job]);
export const useMetrics = (): Async<Metrics> => useAsync(loadMetrics, []);

/** The unfiltered layer, loaded only when the false-alarm filter is switched off. */
export function useRaw(base: string | undefined, wanted: boolean): FeatureCollection | undefined {
  const [raw, setRaw] = useState<{ base: string; fc: FeatureCollection }>();
  useEffect(() => {
    if (!base || !wanted || raw?.base === base) return;
    loadRaw(base).then((fc) => setRaw({ base, fc })).catch(() => undefined);
  }, [base, wanted, raw?.base]);
  return raw && raw.base === base ? raw.fc : undefined;
}

export interface Sens { info: SensInfo; bytes: Uint8Array }
/** Slider data (sens.json + sens.bin); undefined when a scene does not ship it, so the lab stays hidden. */
export function useSens(base: string | undefined): Sens | undefined {
  const [s, setS] = useState<{ base: string; v: Sens }>();
  useEffect(() => {
    if (!base) return;
    let alive = true;
    (async () => {
      try {
        const ri = await fetch(`${base}/sens.json`);
        if (!ri.ok) return;
        const info = (await ri.json()) as SensInfo;
        const rb = await fetch(`${base}/sens.bin`);
        if (!rb.ok) return;
        const bytes = new Uint8Array(await rb.arrayBuffer());
        if (alive) setS({ base, v: { info, bytes } });
      } catch { /* optional feature */ }
    })();
    return () => { alive = false; };
  }, [base]);
  return s && s.base === base ? s.v : undefined;
}

export { staticBase, STATIC_ROOT };
