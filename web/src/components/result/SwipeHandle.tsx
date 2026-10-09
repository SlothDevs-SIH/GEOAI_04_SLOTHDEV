import { useState } from "react";
import { useReducedMotion } from "../../hooks/motion";

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/**
 * R-02: the before / after divider. Drag it with a mouse, pen or finger (1:1 with the pointer; the 48 px grab area is wider than the line),
 * or focus it and use the arrow keys: 2 % per press, 10 % with Shift, Home / End for the ends. The grip grows to 1.15x while dragging.
 * Must be rendered inside a `position: relative` box that spans the map: positions are percentages of its width.
 */
export default function SwipeHandle({ value, onChange }: { value: number; onChange: (pct: number) => void }) {
  const reduced = useReducedMotion();
  const [dragging, setDragging] = useState(false);

  const fromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.parentElement?.getBoundingClientRect();
    if (r && r.width > 0) onChange(clamp(((e.clientX - r.left) / r.width) * 100));
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const big = e.shiftKey ? 10 : 2;
    let next: number | undefined;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = value - big;
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = value + big;
    else if (e.key === "PageDown") next = value - 10;
    else if (e.key === "PageUp") next = value + 10;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = 100;
    if (next == null) return;
    e.preventDefault();
    onChange(clamp(next));
  };
  const v = Math.round(value);
  return (
    <div role="slider" tabIndex={0} aria-label="Swipe between before and after" aria-orientation="horizontal"
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-valuetext={`Divider at ${v} percent: ${v} percent before, ${100 - v} percent after`}
      data-testid="swipe-handle" data-dragging={dragging || undefined}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); setDragging(true); fromPointer(e); }}
      onPointerMove={(e) => dragging && fromPointer(e)}
      onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)} onLostPointerCapture={() => setDragging(false)}
      onKeyDown={onKeyDown}
      className={`group absolute inset-y-0 z-10 w-12 -translate-x-1/2 touch-none ${dragging ? "cursor-grabbing" : "cursor-ew-resize"}`}
      style={{ left: `${value}%`, outline: "none" }}>
      <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 bg-white" style={{ boxShadow: "0 0 6px var(--c-swipe-shadow)" }} />
      <span aria-hidden="true" data-testid="swipe-grip"
        className="absolute left-1/2 top-1/2 flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-900 group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-focus"
        style={{
          border: "3px solid var(--c-swipe-ring)",
          boxShadow: "0 2px 8px var(--c-swipe-shadow)",
          transform: `translate(-50%, -50%) scale(${dragging && !reduced ? 1.15 : 1})`,
          transition: reduced ? undefined : "transform 120ms ease-out",
        }}>
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 5L2 9l4 4M12 5l4 4-4 4" />
        </svg>
      </span>
    </div>
  );
}
