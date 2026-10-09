import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { applySensitivity } from "../../lib/sensitivity";
import type { Sens } from "../../hooks/useData";
import { useSens } from "../../hooks/useData";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { Button } from "../ui/Button";
import { CardSection } from "../ui/Card";
import { SliderField } from "../ui/Controls";
import { Skeleton } from "../ui/Skeleton";
import { Txt } from "../ui/Txt";

const fmt = (n: number) => n.toLocaleString("en-IN");

/** The after image with the surviving changes painted over it. Web draws on a canvas; native shows the numbers only. */
function MaskCanvas({ base, sens, mask }: { base: string; sens: Sens; mask: Uint8Array }) {
  const { c } = useTheme();
  const ref = useRef<HTMLCanvasElement>(null);
  const img = useRef<HTMLImageElement | undefined>(undefined);
  const [ready, setReady] = useState(0);
  const { width, height } = sens.info;
  useEffect(() => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => { img.current = im; setReady((r) => r + 1); };
    im.src = `${base}/after.webp`;
  }, [base]);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    if (img.current) ctx.drawImage(img.current, 0, 0, width, height);
    else { ctx.fillStyle = c.surfaceAlt; ctx.fillRect(0, 0, width, height); }
    const over = ctx.getImageData(0, 0, width, height);
    const [r, g, b] = [244, 63, 94]; // critical rose: changes found at the current sensitivity
    for (let i = 0; i < mask.length; i++) if (mask[i]) { over.data[4 * i] = r; over.data[4 * i + 1] = g; over.data[4 * i + 2] = b; over.data[4 * i + 3] = 255; }
    ctx.putImageData(over, 0, 0);
  }, [mask, ready, width, height, c.surfaceAlt]);
  return <canvas ref={ref} width={width} height={height} data-testid="lab-canvas" aria-label="After image with the changes found at the current sensitivity highlighted"
    style={{ width: "100%", height: "auto", borderRadius: radius.sm, border: `1px solid ${c.border}` }} />;
}

/**
 * R-28: drag the change threshold and minimum area and watch detections change at once, computed on the device.
 * It repeats the server filters on a compact raster (engine/sensitivity.py), so at the default settings it gives the server's own count.
 * Scenes without slider data show nothing.
 */
export function SensitivityLab({ base }: { base: string }) {
  const sens = useSens(base);
  const [threshold, setThreshold] = useState<number>();
  const [minArea, setMinArea] = useState<number>();
  useEffect(() => { if (sens) { setThreshold(sens.info.default_threshold); setMinArea(sens.info.min_area_m2); } }, [sens]);
  const t = useDeferredValue(threshold);
  const m = useDeferredValue(minArea);
  const result = useMemo(() => {
    if (!sens || t == null || m == null) return undefined;
    const { info, bytes } = sens;
    return applySensitivity(bytes, info.width, info.height, t, Math.ceil(m / (info.pixel_m * info.pixel_m)), info.keep_codes);
  }, [sens, t, m]);
  if (!sens) return null;
  if (!result || threshold == null || minArea == null) return <View testID="sensitivity-lab"><Skeleton height={220} /></View>;
  const { info } = sens;
  const hectares = (result.pixels * info.pixel_m * info.pixel_m) / 1e4;
  const atDefault = Math.abs(threshold - info.default_threshold) < 1e-9 && minArea === info.min_area_m2;
  return (
    <View testID="sensitivity-lab">
      <CardSection title="Sensitivity lab (live)" slug="sensitivity" collapsible defaultOpen>
        {Platform.OS === "web" && <MaskCanvas base={base} sens={sens} mask={result.mask} />}
        <Txt testID="lab-count" v="h3" accessibilityLiveRegion="polite" aria-live="polite">
          <Txt v="h3" tone="success">{fmt(result.count)}</Txt> changes · {hectares.toFixed(1)} ha
        </Txt>
        <Txt v="tiny" tone="muted">Server result at the default settings: {fmt(info.server_after_filter)} changes.</Txt>
        <View testID="lab-threshold"><SliderField name="threshold" label="Change threshold" value={threshold} min={0} max={1} step={0.005} onChange={setThreshold} format={(v) => v.toFixed(3)} /></View>
        <View testID="lab-minarea"><SliderField name="minarea-lab" label="Smallest change to keep" value={minArea} min={0} max={5000} step={50} onChange={setMinArea} format={(v) => `${fmt(v)} m²`} /></View>
        <Button name="lab-reset" label="Reset to the server settings" variant="secondary" disabled={atDefault} onPress={() => { setThreshold(info.default_threshold); setMinArea(info.min_area_m2); }} />
        <Txt v="tiny" tone="muted">Interactive preview of the same filters; lower threshold = more detections, including more false alarms.</Txt>
      </CardSection>
    </View>
  );
}
