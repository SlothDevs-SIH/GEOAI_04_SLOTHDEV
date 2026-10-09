import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../../hooks/motion";
import { useUi } from "../../store/ui";

export const ZOOM = 2.5;

/**
 * R-32: full-size view of a before / after crop. Scrim backdrop; Esc, the close button or a click outside closes it.
 * Double-click (or the Zoom button, for keyboard and touch users) toggles 2.5x about the pointer; a zoomed image can be dragged.
 */
export default function ImageViewer() {
  const uri = useUi((s) => s.imageViewerUri);
  const close = useUi((s) => s.closeImageViewer);
  const reduced = useReducedMotion();
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState({ x: 50, y: 50 });
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setZoomed(false);
    setPan({ x: 0, y: 0 });
    setOrigin({ x: 50, y: 50 });
  }, [uri]);

  useEffect(() => {
    if (!uri) return;
    const previous = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "Tab") { e.preventDefault(); closeBtn.current?.focus(); } // focus stays on the dialog's controls
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [uri, close]);

  if (!uri) return null;

  const toggleZoom = (e?: React.MouseEvent<HTMLImageElement>) => {
    if (zoomed) {
      setZoomed(false);
      setPan({ x: 0, y: 0 });
      return;
    }
    if (e) {
      const r = e.currentTarget.getBoundingClientRect();
      if (r.width && r.height) setOrigin({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
    } else setOrigin({ x: 50, y: 50 });
    setZoomed(true);
  };

  return (
    <div data-testid="image-viewer" role="dialog" aria-modal="true" aria-label="Image viewer"
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
      className="fade-150 fixed inset-0 z-50 flex items-center justify-center bg-scrim p-s18">
      <div className="absolute right-s12 top-s12 z-10 flex gap-s8">
        <button type="button" data-testid="viewer-zoom" onClick={() => toggleZoom()} aria-pressed={zoomed}
          className="press tap rounded-sm border border-line-strong bg-surface-alt px-s12 text-small text-fg hover:bg-surface-hover">
          {zoomed ? "Fit" : `Zoom ${ZOOM}×`}
        </button>
        <button ref={closeBtn} type="button" data-testid="viewer-close" onClick={close} aria-label="Close image viewer"
          className="press tap rounded-sm border border-line-strong bg-surface-alt px-s12 text-small text-fg hover:bg-surface-hover">
          Close ✕
        </button>
      </div>
      <div className="max-h-[88vh] max-w-[94vw] overflow-hidden rounded-md shadow-modal">
        <img data-testid="viewer-image" src={uri} alt="Crop, full size" draggable={false}
          onDoubleClick={toggleZoom}
          onPointerDown={(e) => { if (zoomed) { drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; e.currentTarget.setPointerCapture?.(e.pointerId); } }}
          onPointerMove={(e) => { const d = drag.current; if (d) setPan({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y }); }}
          onPointerUp={() => (drag.current = null)} onPointerCancel={() => (drag.current = null)}
          className={`block max-h-[88vh] max-w-[94vw] select-none object-contain touch-none ${zoomed ? "cursor-grab" : "cursor-zoom-in"}`}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoomed ? ZOOM : 1})`,
            transformOrigin: `${origin.x}% ${origin.y}%`,
            transition: reduced || drag.current ? undefined : "transform 200ms ease-out",
          }} />
      </div>
    </div>
  );
}
