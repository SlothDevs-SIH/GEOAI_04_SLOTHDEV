import { useEffect, useRef, useState } from "react";
import type { ChangeProps, ReviewStatus } from "../../lib/types";
import { Button } from "../ui/Primitives";
import ChangeRow from "./ChangeRow";

const PAGE = 200;

/** L-08: the ranked list. Arrow keys move between rows; a selection made on the map is scrolled into view inside the list. */
export default function ChangeList({ items, status, selectedId, onSelect, onLongPress, onResetFilters, filtersActive }: {
  items: ChangeProps[]; status: (id: number) => ReviewStatus; selectedId: number | null; onSelect: (id: number) => void;
  onLongPress?: (p: ChangeProps) => void; onResetFilters?: () => void; filtersActive?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, PAGE);

  useEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('[aria-current="true"]');
    const c = box.current;
    if (!el || !c) return;
    // scroll only the list itself (scrollIntoView would also move the whole page)
    const top = el.offsetTop; // the list box is position: relative, so this is relative to its scrolling content
    if (top < c.scrollTop) c.scrollTop = top;
    else if (top + el.offsetHeight > c.scrollTop + c.clientHeight) c.scrollTop = top + el.offsetHeight - c.clientHeight;
  }, [selectedId]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const rows = [...(box.current?.querySelectorAll<HTMLElement>('[data-testid="change-row"]') ?? [])];
    const i = rows.indexOf(document.activeElement as HTMLElement);
    if (i < 0) return;
    e.preventDefault();
    rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
  };

  if (!items.length) {
    return (
      <div data-testid="change-list-empty" className="flex flex-col items-start gap-s8 p-s12 text-body text-secondary">
        <p>No changes match these filters.</p>
        {filtersActive && onResetFilters && <Button variant="secondary" onClick={onResetFilters}>Reset filters</Button>}
      </div>
    );
  }
  return (
    <div>
      <div ref={box} onKeyDown={onKeyDown} className="thin-scroll relative max-h-[420px] overflow-y-auto rounded-sm border border-line">
        <ul data-testid="change-list" aria-label="Changes ranked by severity" className="divide-y divide-line">
          {shown.map((p, i) => (
            <ChangeRow key={p.id} feature={p} index={i} isSelected={selectedId === p.id} status={status(p.id)} onSelect={onSelect} onLongPress={onLongPress} />
          ))}
        </ul>
      </div>
      {items.length > shown.length && (
        <p className="mt-s8 flex flex-wrap items-center gap-s8 text-tiny text-muted">
          Showing the top {PAGE} of {items.length.toLocaleString("en-IN")}.
          <Button variant="ghost" className="min-h-[48px]" onClick={() => setAll(true)}>Show all</Button>
        </p>
      )}
    </div>
  );
}
