import { useTween } from "./useTween";

const fmt = (n: number) => n.toLocaleString("en-IN");

/**
 * R-12: "2,185 raw detections → 265 real changes" (or "Filter off: 2,185 raw detections").
 * The integers count from the old value to the new one over 600 ms when the filter or the detector changes (A-03).
 * Polite live region; it is marked busy while counting so a screen reader announces only the settled sentence.
 */
export default function CounterText({ rawCount, keptCount, filterOn }: { rawCount: number; keptCount: number; filterOn: boolean }) {
  const main = filterOn ? keptCount : rawCount;
  const rawV = Math.round(useTween(rawCount));
  const mainV = Math.round(useTween(main));
  const busy = rawV !== rawCount || mainV !== main;
  return (
    <p data-testid="counter" aria-live="polite" aria-atomic="true" aria-busy={busy}
      className="min-w-0 text-h3 text-secondary sm:text-h2">
      {filterOn
        ? <><span className="text-fg">{fmt(rawV)}</span> raw detections → <b className="text-accent">{fmt(mainV)}</b> real changes</>
        : <>Filter off: <b className="text-fg">{fmt(mainV)}</b> raw detections</>}
    </p>
  );
}
