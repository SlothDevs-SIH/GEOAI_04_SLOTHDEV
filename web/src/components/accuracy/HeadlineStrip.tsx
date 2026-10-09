import type { CSSProperties } from "react";
import { useCountUp, useReducedMotion } from "../../hooks/motion";
import type { HeadlineTile } from "./headline";

const TABLE_NAME: Record<string, string> = {
  "acc-m8": "radar flood table", "acc-oscd": "optical change table", "acc-levir": "building change table",
  "acc-false-alarms": "false alarms table", "acc-india": "Assam flood table",
};

function Tile({ tile, index }: { tile: HeadlineTile; index: number }) {
  const reduced = useReducedMotion();
  const v = useCountUp(tile.value, 700, index * 80); // A-05 count-up, 80 ms stagger
  const final = tile.value.toFixed(tile.digits);
  const jump = () => {
    const el = document.getElementById(tile.anchor);
    if (!el) return;
    el.scrollIntoView?.({ behavior: reduced ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
  };
  return (
    <li data-testid="headline-tile" data-key={tile.key} data-anchor={tile.anchor} style={{ "--i": index } as CSSProperties}
      className="anim-in flex flex-col rounded-md border border-line bg-surface p-s12 shadow-card">
      <p className="text-small font-normal text-secondary">{tile.label}</p>
      <p className="mt-s8 text-metric text-fg tabular-nums">
        <span aria-hidden="true">{v.toFixed(tile.digits)}</span>
        <span className="sr-only">{final}</span>
        {tile.unit && <span className="ml-1 text-small font-normal text-muted">{tile.unit}</span>}
      </p>
      {tile.secondary && <p className="text-tiny text-muted">{tile.secondary}</p>}
      {tile.caveat && <p className="mt-s4 text-tiny text-secondary">{tile.caveat}</p>}
      <button type="button" onClick={jump} aria-label={`Jump to the ${TABLE_NAME[tile.anchor] ?? "table"}`}
        className="press mt-auto inline-flex min-h-[48px] items-center gap-1 self-start pt-s8 text-small text-accent hover:underline">
        See the table <span aria-hidden="true">↓</span>
      </button>
    </li>
  );
}

/** "Headline results": the numbers a reader should see first, each linked to the table that holds the evidence. */
export default function HeadlineStrip({ tiles }: { tiles: HeadlineTile[] }) {
  if (!tiles.length) return null;
  return (
    <section aria-labelledby="headline-title" data-testid="headline-strip">
      <h2 id="headline-title" className="mb-s12 text-h2 text-fg">Headline results</h2>
      <ul className="m-0 grid list-none grid-cols-1 gap-s12 p-0 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {tiles.map((t, i) => <Tile key={t.key} tile={t} index={i} />)}
      </ul>
    </section>
  );
}
