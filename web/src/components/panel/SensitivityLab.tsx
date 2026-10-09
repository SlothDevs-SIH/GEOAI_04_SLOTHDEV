import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import { type SensInfo, applySensitivity } from "../../lib/sensitivity";
import { Button, CardSection, Skeleton } from "../ui/Primitives";

interface Loaded {
  info: SensInfo;
  bytes: Uint8Array;
}

async function loadSens(base: string): Promise<Loaded | undefined> {
  try {
    const [j, b] = await Promise.all([fetch(`${base}/sens.json`), fetch(`${base}/sens.bin`)]);
    if (!j.ok || !b.ok) return undefined;
    const info = (await j.json()) as SensInfo;
    const bytes = new Uint8Array(await b.arrayBuffer());
    return bytes.length === info.width * info.height * 3 ? { info, bytes } : undefined;
  } catch {
    return undefined;
  }
}

const fmt = (n: number) => n.toLocaleString("en-IN");
// surviving changes are painted in the critical-tier rose (#F43F5E in the dark palette) on top of the after image
const MASK_RGB = [244, 63, 94] as const;

/**
 * Drag the change threshold and the minimum area and watch the detections change at once, computed in the browser.
 * It repeats the server filters on a compact raster (see engine/sensitivity.py), so at the default settings it gives
 * the server's own count; the server result above stays the source of truth. Scenes without the data show nothing.
 */
export default function SensitivityLab({ base }: { base: string }) {
  const [loaded, setLoaded] = useState<{ base: string; l?: Loaded }>();
  const [threshold, setThreshold] = useState(0);
  const [minArea, setMinArea] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const idT = useId();
  const idA = useId();

  useEffect(() => {
    let alive = true;
    loadSens(base).then((l) => {
      if (!alive) return;
      setLoaded({ base, l });
      if (l) {
        setThreshold(l.info.default_threshold);
        setMinArea(l.info.min_area_m2);
      }
    });
    return () => {
      alive = false;
    };
  }, [base]);

  const data = loaded?.base === base ? loaded.l : undefined;
  const t = useDeferredValue(threshold);
  const m = useDeferredValue(minArea);
  const result = useMemo(() => {
    if (!data) return undefined;
    const { info, bytes } = data;
    const minPx = Math.ceil(m / (info.pixel_m * info.pixel_m));
    return applySensitivity(bytes, info.width, info.height, t, minPx, info.keep_codes);
  }, [data, t, m]);

  // draw the after image with the surviving changes painted over it (skipped where there is no canvas, as in tests)
  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !data || !result) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const { info } = data;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.drawImage(img, 0, 0, info.width, info.height);
      const over = ctx.getImageData(0, 0, info.width, info.height);
      for (let i = 0; i < result.mask.length; i++) {
        if (!result.mask[i]) continue;
        over.data[4 * i] = MASK_RGB[0];
        over.data[4 * i + 1] = MASK_RGB[1];
        over.data[4 * i + 2] = MASK_RGB[2];
        over.data[4 * i + 3] = 255;
      }
      ctx.putImageData(over, 0, 0);
    };
    img.src = `${base}/after.webp`;
  }, [data, result, base]);

  if (!loaded || loaded.base !== base) return <div data-testid="sensitivity-loading" aria-hidden="true"><Skeleton height={120} radius={13} /></div>; // shimmer while the files load
  if (!data || !result) return null; // scenes without slider data show nothing
  const { info } = data;
  const hectares = (result.pixels * info.pixel_m * info.pixel_m) / 1e4;
  const atDefault = Math.abs(threshold - info.default_threshold) < 1e-9 && minArea === info.min_area_m2;
  return (
    <CardSection title="Sensitivity lab (live)" testid="sensitivity-lab">
      <canvas ref={canvas} width={info.width} height={info.height} className="w-full rounded-sm border border-line"
        aria-label="After image with the changes found at the current sensitivity painted over it" />
      <p className="mt-s8 text-h3 text-secondary" data-testid="lab-count" aria-live="polite">
        <b key={result.count} className="fade-150 text-accent">{fmt(result.count)}</b> changes · {hectares.toFixed(1)} ha
      </p>
      <p className="text-tiny text-muted">Server result at the default settings: {fmt(info.server_after_filter)} changes.</p>
      <label htmlFor={idT} className="mt-s8 flex items-baseline justify-between text-small text-secondary">
        Change threshold <b className="tabular-nums text-fg">{threshold.toFixed(3)}</b>
      </label>
      <input id={idT} type="range" min={0} max={1} step={0.005} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}
        className="block h-12 w-full cursor-pointer accent-accent" data-testid="lab-threshold" />
      <label htmlFor={idA} className="flex items-baseline justify-between text-small text-secondary">
        Smallest change to keep <b className="tabular-nums text-fg">{fmt(minArea)} m²</b>
      </label>
      <input id={idA} type="range" min={0} max={5000} step={50} value={minArea} onChange={(e) => setMinArea(Number(e.target.value))}
        className="block h-12 w-full cursor-pointer accent-accent" data-testid="lab-minarea" />
      <Button variant="ghost" disabled={atDefault} data-testid="lab-reset" className="mt-s4 w-full"
        onClick={() => { setThreshold(info.default_threshold); setMinArea(info.min_area_m2); }}>Reset to the server settings</Button>
      <p className="mt-s8 text-tiny text-muted">Interactive preview of the same filters; lower threshold = more detections, including more false alarms.</p>
    </CardSection>
  );
}
