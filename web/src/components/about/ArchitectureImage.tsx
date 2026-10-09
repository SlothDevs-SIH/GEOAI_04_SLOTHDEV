import { useCallback, useEffect, useRef, useState } from "react";
import { CardSection } from "../ui/Primitives";

const SRC = `${import.meta.env.BASE_URL}architecture.png`;
const ALT = "System architecture: users, web app, API, storage, data sources, the five-step engine, outputs and the offline train-evaluate-ship pipeline";

function Viewer({ onClose }: { onClose: () => void }) {
  const [zoomed, setZoomed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") { // only the two buttons are focusable: cycle between them so focus never leaves the dialog
        const btns = Array.from(dialogRef.current?.querySelectorAll("button") ?? []);
        if (!btns.length) return;
        e.preventDefault();
        const i = btns.indexOf(document.activeElement as HTMLButtonElement);
        btns[(i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Architecture diagram, full screen" data-testid="architecture-viewer"
      className="fade-200 fixed inset-0 z-50 flex flex-col bg-scrim">
      <div className="flex items-center justify-between gap-s8 border-b border-line bg-surface px-s18 py-s8 text-small text-fg">
        <span className="hidden text-tiny text-secondary sm:inline">Double-click the picture to zoom. Press Esc or click outside to close.</span>
        <span className="ml-auto flex gap-s8">
          <button type="button" onClick={() => setZoomed((z) => !z)} aria-pressed={zoomed} data-testid="architecture-zoom"
            className="press tap rounded-sm border border-line-strong bg-surface px-s12 text-small text-fg hover:bg-surface-hover">{zoomed ? "Fit to screen" : "Zoom in"}</button>
          <button ref={closeRef} type="button" onClick={onClose} data-testid="architecture-close" aria-label="Close the diagram"
            className="press tap rounded-sm border border-line-strong bg-surface px-s12 text-small text-fg hover:bg-surface-hover">Close ✕</button>
        </span>
      </div>
      {/* click on the empty scrim (not the picture) closes; the container scrolls when zoomed */}
      <div className="thin-scroll flex min-h-0 flex-1 overflow-auto p-s12" style={{ touchAction: "pan-x pan-y pinch-zoom" }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <img src={SRC} alt={ALT} data-testid="architecture-zoomed" draggable={false}
          onDoubleClick={() => setZoomed((z) => !z)}
          className={`m-auto rounded-md bg-surface ${zoomed ? "max-w-none cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in object-contain"}`}
          style={zoomed ? { width: "250%" } : undefined} />
      </div>
    </div>
  );
}

/** B-04: the system diagram; tap or click opens a full-screen viewer (Esc / click outside closes, double-click zooms). */
export default function ArchitectureImage() {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    queueMicrotask(() => trigger.current?.focus()); // give focus back to what opened the viewer
  }, []);
  return (
    <CardSection title="Architecture" testid="architecture">
      <button ref={trigger} type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="Open the architecture diagram full screen"
        className="press block w-full cursor-zoom-in overflow-hidden rounded-sm border border-line bg-surface-alt p-0">
        <img src={SRC} alt={ALT} data-testid="architecture-diagram" loading="lazy" className="block w-full" />
      </button>
      <p className="mt-s8 text-tiny text-muted">Tap the diagram to open it full screen and zoom in.</p>
      {open && <Viewer onClose={close} />}
    </CardSection>
  );
}
