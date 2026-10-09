import { useCallback, useEffect, useState } from "react";
import { listScenes } from "../../lib/api";
import type { SceneMeta } from "../../lib/types";

type State = { data?: SceneMeta[]; error?: string; loading: boolean };

/** A7 "Scenes": bundled /demos/index.json first, then the API. `retry` runs the same load again. */
export function useScenes(): State & { retry: () => void } {
  const [state, setState] = useState<State>({ loading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    listScenes()
      .then((data) => alive && setState({ data, loading: false }))
      .catch((e: Error) => alive && setState({ error: e.message, loading: false }));
    return () => {
      alive = false;
    };
  }, [attempt]);
  const retry = useCallback(() => {
    setState({ loading: true });
    setAttempt((a) => a + 1);
  }, []);
  return { ...state, retry };
}
