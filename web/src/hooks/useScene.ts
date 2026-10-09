import { useEffect, useState } from "react";
import { loadJobScene, loadRaw, loadScene } from "../lib/api";
import type { FeatureCollection, SceneData } from "../lib/types";

type State<T> = { data?: T; error?: string; loading: boolean };

/** A demo scene by id, or (job = true) a finished live analysis by job id. */
export function useScene(id: string | undefined, job = false): State<SceneData> {
  const [s, setS] = useState<State<SceneData>>({ loading: true });
  useEffect(() => {
    if (!id) return;
    let alive = true;
    (job ? loadJobScene(id) : loadScene(id))
      .then((data) => alive && setS({ data, loading: false }))
      .catch((e: Error) => alive && setS({ error: e.message, loading: false }));
    return () => {
      alive = false;
    };
  }, [id, job]);
  return s;
}

/** The unfiltered layer is loaded only when the false-alarm filter is switched off. */
export function useRaw(base: string | undefined, wanted: boolean): FeatureCollection | undefined {
  const [raw, setRaw] = useState<{ base: string; fc: FeatureCollection }>();
  useEffect(() => {
    if (!base || !wanted || raw?.base === base) return;
    loadRaw(base).then((fc) => setRaw({ base, fc })).catch(() => undefined);
  }, [base, wanted, raw?.base]);
  return raw && raw.base === base ? raw.fc : undefined;
}
