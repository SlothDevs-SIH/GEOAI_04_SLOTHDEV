import { useState } from "react";
import { Platform, View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useEffect } from "react";
import { useMotion } from "../../hooks/useMotion";
import { useTheme } from "../../theme/ThemeProvider";
import { MIN_TOUCH, radius, space } from "../../theme/tokens";
import { Press } from "./Press";
import { Txt } from "./Txt";

/** A switch with a text label: A-04 thumb slide + border colour, 48 dp target. */
export function LabeledSwitch({ testID, label, value, onChange, strong }: { testID: string; label: string; value: boolean; onChange: (v: boolean) => void; strong?: boolean }) {
  const { c } = useTheme();
  const { ms } = useMotion();
  const x = useSharedValue(value ? 18 : 0);
  useEffect(() => { x.value = withTiming(value ? 18 : 0, { duration: ms(180) }); }, [value, x, ms]);
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <Press testID={testID} accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value }} aria-checked={value} onPress={() => onChange(!value)}
      style={{ flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: strong ? space[3] : 0, borderRadius: radius.sm, borderWidth: strong ? 2 : 0, borderColor: value ? c.accent : c.borderStrong, backgroundColor: strong ? c.surface : "transparent" }}>
      <View style={{ width: 42, height: 24, borderRadius: 12, backgroundColor: value ? c.accent : c.surfaceHover, borderWidth: 1, borderColor: value ? c.accent : c.borderStrong, padding: 2 }}>
        <Animated.View style={[{ width: 18, height: 18, borderRadius: 9, backgroundColor: value ? c.textOnAccent : c.textMuted }, thumb]} />
      </View>
      <Txt v={strong ? "small" : "body"}>{label}</Txt>
    </Press>
  );
}

/** R-27: slider with pan, tap-on-track, arrow keys (web) and increment/decrement actions (screen readers). */
export function SliderField({ name, label, value, min, max, step, onChange, format }: {
  name: string; label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string;
}) {
  const { c } = useTheme();
  const [w, setW] = useState(1);
  const span = max - min;
  const snap = (v: number) => Math.max(min, Math.min(max, Math.round((v - min) / step) * step + min));
  const frac = span ? (value - min) / span : 0;
  const set = (px: number) => onChange(snap(min + (px / Math.max(w - 24, 1)) * span));
  const start = useSharedValue(0);
  const pan = Gesture.Pan().minDistance(0)
    .onBegin((e) => { start.value = e.x - 12; runOnJS(set)(e.x - 12); })
    .onUpdate((e) => runOnJS(set)(start.value + e.translationX));
  const kb = Platform.OS === "web" ? ({ tabIndex: 0, onKeyDown: (e: { key: string; shiftKey: boolean; preventDefault: () => void }) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (d) { e.preventDefault(); onChange(snap(value + d * step * (e.shiftKey ? 10 : 1))); }
  } } as object) : null;
  const text = format ? format(value) : String(value);
  return (
    <View style={{ gap: space[1] }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Txt v="small" tone="secondary">{label}</Txt>
        <Txt v="small" testID={`${name}-value`}>{text}</Txt>
      </View>
      <GestureDetector gesture={pan}>
        <View testID={`slider-${name}`} accessible accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min, max, now: value, text }}
          accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
          onAccessibilityAction={(e) => onChange(snap(value + (e.nativeEvent.actionName === "increment" ? step : -step)))}
          role="slider" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} {...kb}
          onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ height: MIN_TOUCH, justifyContent: "center", cursor: "pointer" } as object}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: c.borderStrong }}>
            <View style={{ width: `${frac * 100}%`, height: 4, borderRadius: 2, backgroundColor: c.accent }} />
          </View>
          <View style={{ position: "absolute", left: 12 + frac * Math.max(w - 24, 0) - 12, width: 24, height: 24, borderRadius: 12, backgroundColor: c.text, borderColor: c.accent, borderWidth: 3 }} />
        </View>
      </GestureDetector>
    </View>
  );
}

/** Pill toggle used for tier filters: text + state, never colour alone. */
export function Chip({ testID, label, selected, onPress, icon }: { testID?: string; label: string; selected: boolean; onPress: () => void; icon?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <Press testID={testID} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} aria-pressed={selected} onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: space[1] + 2, paddingHorizontal: space[3], borderRadius: radius.pill, borderWidth: 1, borderColor: selected ? c.accent : c.borderStrong, backgroundColor: selected ? c.accentSoft : "transparent" }}>
      {icon}
      <Txt v="small" tone={selected ? "accent" : "secondary"}>{label}</Txt>
    </Press>
  );
}
