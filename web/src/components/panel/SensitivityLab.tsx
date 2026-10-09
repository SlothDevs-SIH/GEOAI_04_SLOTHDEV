import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { type SensInfo, applySensitivity } from "../../lib/sensitivity";
import { Card } from "./Panels";

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
    return bytes.length === info.width * info.height * 2 ? { info, bytes } : undefined;
  } catch {
    return undefined;
  }
}

const fmt = (n: number) => n.toLocaleString("en-IN");

/**
 * Drag the change threshold and the minimum area and watch the detections change at once, computed in the browser.
 * It repeats the server filters on a compact raster (see engine/sensitivity.py), so at the default settings it gives
 * the server's own count; the server result above stays the source of truth. Scenes without the data show nothing.
 */
export default function SensitivityLab({ base }: { base: string }) {
  const [loaded, setLoaded] = useState<Loaded>();
  const [threshold, setThreshold] = useState(0);
  const [minArea, setMinArea] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let alive = true;
    loadSens(base).then((l) => {
      if (!alive || !l) return;
      setLoaded(l);
      setThreshold(l.info.default_threshold);
      setMinArea(l.info.min_area_m2);
    });
    return () => {
      alive = false;
    };
  }, [base]);

  const t = useDeferredValue(threshold);
  const m = useDeferredValue(minArea);
  const result = useMemo(() => {
    if (!loaded) return undefined;
    const { info, bytes } = loaded;
    const minPx = Math.ceil(m / (info.pixel_m * info.pixel_m));
    return applySensitivity(bytes, info.width, info.height, t, minPx, info.keep_codes);
  }, [loaded, t, m]);

  // draw the after image with the surviving changes in red (skipped where there is no canvas, as in tests)
  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !loaded || !result) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const { info } = loaded;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      ctx.drawImage(img, 0, 0, info.width, info.height);
      const over = ctx.getImageData(0, 0, info.width, info.height);
      for (let i = 0; i < result.mask.length; i++) {
        if (!result.mask[i]) continue;
        over.data[4 * i] = 230;
        over.data[4 * i + 1] = 40;
        over.data[4 * i + 2] = 40;
        over.data[4 * i + 3] = 255;
      }
      ctx.putImageData(over, 0, 0);
    };
    img.src = `${base}/after.webp`;
  }, [loaded, result, base]);

  if (!loaded || !result) return null;
  const { info } = loaded;
  const hectares = (result.pixels * info.pixel_m * info.pixel_m) / 1e4;
  const atDefault = Math.abs(threshold - info.default_threshold) < 1e-9 && minArea === info.min_area_m2;
  return (
    <Card title="Sensitivity lab (live)" testid="sensitivity-lab">
      <canvas ref={canvas} width={info.width} height={info.height} className="w-full rounded border border-slate-200" aria-label="After image with the changes found at the current sensitivity in red" />
      <p className="mt-2 text-lg" data-testid="lab-count" aria-live="polite">
        <b className="text-emerald-700">{fmt(result.count)}</b> changes · {hectares.toFixed(1)} ha
      </p>
      <p className="text-xs text-slate-500">Server result at the default settings: {fmt(info.server_after_filter)} changes.</p>
      <label className="mt-2 block text-sm">Change threshold: <b>{threshold.toFixed(3)}</b>
        <input type="range" min={0} max={1} step={0.005} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}
          className="block w-full" data-testid="lab-threshold" />
      </label>
      <label className="mt-1 block text-sm">Smallest change to keep: <b>{fmt(minArea)} m²</b>
        <input type="range" min={0} max={5000} step={50} value={minArea} onChange={(e) => setMinArea(Number(e.target.value))}
          className="block w-full" data-testid="lab-minarea" />
      </label>
      <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
        <button type="button" disabled={atDefault} onClick={() => { setThreshold(info.default_threshold); setMinArea(info.min_area_m2); }}
          className="rounded border border-slate-300 px-2 py-0.5 disabled:opacity-40" data-testid="lab-reset">Reset to the server settings</button>
        <span>Interactive preview of the same filters; lower threshold = more detections, including more false alarms.</span>
      </div>
    </Card>
  );
}
