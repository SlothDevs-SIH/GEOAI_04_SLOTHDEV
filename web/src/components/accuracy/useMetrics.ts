import { useCallback, useEffect, useState } from "react";
import { loadMetrics, type Metrics } from "../../lib/api";

type State = { data?: Metrics; error?: string; loading: boolean };

/** A7 "Accuracy": bundled /eval/results.json first, then the API's /metrics. */
export function useMetrics(): State & { retry: () => void } {
  const [state, setState] = useState<State>({ loading: true });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    loadMetrics()
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
