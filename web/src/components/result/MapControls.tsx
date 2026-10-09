const btn = "press tap bg-surface/90 text-fg hover:bg-surface-hover first:rounded-t-sm last:rounded-b-sm";

/** R-05: zoom in, zoom out and reset-view buttons, 48 px each (MapLibre's own 29 px zoom buttons are too small to tap). */
export default function MapControls({ onZoomIn, onZoomOut, onResetView }: { onZoomIn: () => void; onZoomOut: () => void; onResetView: () => void }) {
  return (
    <div data-testid="map-controls" role="group" aria-label="Map zoom"
      className="absolute bottom-s26 right-s8 z-20 flex flex-col divide-y divide-line rounded-sm border border-line shadow-card">
      <button type="button" className={btn} onClick={onZoomIn} aria-label="Zoom in" data-testid="zoom-in">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>
      <button type="button" className={btn} onClick={onZoomOut} aria-label="Zoom out" data-testid="zoom-out">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 9h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </button>
      <button type="button" className={btn} onClick={onResetView} aria-label="Reset view to the whole scene" data-testid="reset-view">
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V3h4M15 7V3h-4M3 11v4h4M15 11v4h-4" /></svg>
      </button>
    </div>
  );
}
