import { useEffect, useRef } from "react";
import { area, pct } from "../../lib/format";
import { typeLabel } from "../../lib/tiers";
import type { ChangeProps, ReviewStatus } from "../../lib/types";
import { TierChip } from "../ui/Shapes";

export { TierChip };

const LONG_PRESS_MS = 550;

/**
 * R-23: one ranked change. A 56 px tall button: rank, tier chip (glyph + word), type, area and confidence.
 * Confirmed / dismissed / needs-review are spelled out in words, not just shown by colour.
 * Long-press (touch) copies the centroid; the card has a copy button for everyone else.
 */
export default function ChangeRow({ feature: p, isSelected, status = "pending", onSelect, onLongPress, index = 99 }: {
  feature: ChangeProps; isSelected: boolean; status?: ReviewStatus; onSelect: (id: number) => void;
  onLongPress?: (p: ChangeProps) => void; index?: number;
}) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const fired = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  const start = () => {
    if (!onLongPress) return;
    fired.current = false;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { fired.current = true; onLongPress(p); }, LONG_PRESS_MS);
  };
  const stop = () => clearTimeout(timer.current);
  const note = status === "confirmed" ? "Confirmed" : status === "dismissed" ? "Dismissed" : p.needs_review ? "Needs review" : "";
  return (
    <li className={index < 12 ? "anim-in" : undefined} style={index < 12 ? ({ "--i": index } as React.CSSProperties) : undefined}>
      <button type="button" data-testid="change-row" data-id={p.id} data-status={status}
        aria-current={isSelected ? "true" : undefined}
        onClick={() => { if (fired.current) { fired.current = false; return; } onSelect(p.id); }}
        onPointerDown={(e) => { if (e.pointerType === "touch") start(); }} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
        onContextMenu={(e) => { if (onLongPress) e.preventDefault(); }}
        className={`press lift flex min-h-[56px] w-full items-center gap-s8 border-l-4 px-s8 py-s4 text-left ${isSelected ? "border-accent bg-accent-soft" : "border-transparent hover:bg-surface-hover"} ${status === "dismissed" ? "opacity-70" : ""}`}>
        <span className="w-9 shrink-0 text-small tabular-nums text-secondary">#{p.id}</span>
        <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
          <TierChip tier={p.tier} />
          <span className="max-w-full truncate text-tiny text-secondary">{typeLabel(p.change_type)}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className="text-small tabular-nums text-fg">{area(p.area_m2)}</span>
          <span className="text-tiny tabular-nums text-secondary">{pct(p.confidence)}</span>
        </span>
        {note && (
          <span className={`shrink-0 rounded-xs border px-1.5 py-0.5 text-micro ${status === "confirmed" ? "border-success bg-success-soft text-fg" : status === "dismissed" ? "border-line-strong text-secondary line-through" : "border-warning bg-warning-soft text-fg"}`}>
            {status === "confirmed" ? "✓ " : ""}{note}
          </span>
        )}
      </button>
    </li>
  );
}
