import { useCallback, useEffect, useRef, useState } from "react";
import { staticBase } from "../../lib/api";
import { SaveResult, saveDataOn, saveScene, savedIds } from "../../lib/offline";
import { Button } from "../ui/Primitives";

type State = { phase: "idle" } | { phase: "saving"; done: number; total: number } | { phase: "saved" } | { phase: "error"; message: string };

/** Save one scene (or many, in order) for offline use; reports progress for a screen reader through a polite live region. */
export function useSaveOffline(ids: string[]) {
  const [state, setState] = useState<State>(() => (ids.length > 0 && ids.every((i) => savedIds().includes(i)) ? { phase: "saved" } : { phase: "idle" }));
  const busy = useRef(false);
  useEffect(() => {
    setState(ids.length > 0 && ids.every((i) => savedIds().includes(i)) ? { phase: "saved" } : { phase: "idle" });
  }, [ids.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const start = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    let last: SaveResult = { ok: true, files: 0 };
    for (const id of ids) {
      if (savedIds().includes(id)) continue;
      last = await saveScene(staticBase(id), id, (d, t) => setState({ phase: "saving", done: d, total: t }));
      if (!last.ok) break;
    }
    busy.current = false;
    setState(last.ok ? { phase: "saved" } : { phase: "error", message: last.message });
  }, [ids.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  return { state, start };
}

export default function SaveOffline({ ids, label = "Save for offline", compact = false, testid = "save-offline" }: { ids: string[]; label?: string; compact?: boolean; testid?: string }) {
  const { state, start } = useSaveOffline(ids);
  const dataSaver = saveDataOn();
  const text = state.phase === "saving" ? `Saving… ${state.done} of ${state.total} files`
    : state.phase === "saved" ? "Saved on this device for now"
    : state.phase === "error" ? state.message
    : dataSaver ? "Data Saver is on: tap to save anyway" : "";
  return (
    <div data-testid={`${testid}-box`} className={compact ? "mt-s8 flex flex-col gap-s4" : "flex flex-col gap-s4"}>
      <Button variant={state.phase === "saved" ? "ghost" : "secondary"} data-testid={testid} loading={state.phase === "saving"}
        disabled={state.phase === "saved"} onClick={start} aria-describedby={`${testid}-status`}>
        {state.phase === "saved" ? "✓ Saved for offline" : state.phase === "error" ? "Try saving again" : label}
      </Button>
      <p id={`${testid}-status`} data-testid={`${testid}-status`} role="status" aria-live="polite" className={`text-tiny ${state.phase === "error" ? "text-danger" : "text-muted"}`}>{text}</p>
    </div>
  );
}
