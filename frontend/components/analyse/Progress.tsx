import { useEffect } from "react";
import { View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useMotion } from "../../hooks/useMotion";
import type { JobState } from "../../lib/api";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, space } from "../../theme/tokens";
import { Txt } from "../ui/Txt";

export const STAGES = ["queued", "fetching", "detecting", "vectorising", "done"];

function Dot({ active, done }: { active: boolean; done: boolean }) {
  const { c } = useTheme();
  const { reduced } = useMotion();
  const s = useSharedValue(1);
  useEffect(() => {
    s.value = active && !reduced ? withRepeat(withSequence(withTiming(1.15, { duration: 500, easing: Easing.inOut(Easing.quad) }), withTiming(1, { duration: 500 })), -1) : 1;
  }, [active, reduced, s]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return <Animated.View style={[{ width: 14, height: 14, borderRadius: 7, backgroundColor: done || active ? c.actionSecondary : c.surfaceHover, borderWidth: 1, borderColor: done || active ? c.actionSecondary : c.borderStrong }, st]} />;
}

/** A-10c: stage dots + a connecting line that fills (A-12); every stage is also spelled out. */
export function ProgressStepper({ job }: { job: JobState }) {
  const { c } = useTheme();
  const { ms } = useMotion();
  const idx = job.status === "done" ? STAGES.length - 1 : Math.max(0, STAGES.indexOf(job.stage ?? "queued"));
  const fill = useSharedValue(idx / (STAGES.length - 1));
  useEffect(() => { fill.value = withTiming(idx / (STAGES.length - 1), { duration: ms(400) }); }, [idx, fill, ms]);
  const line = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  return (
    <View testID="progress-stepper" accessibilityLiveRegion="polite" accessibilityLabel={`Progress: ${STAGES[idx]}`} style={{ gap: space[2] }}>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: c.surfaceHover }}><Animated.View style={[{ height: 4, borderRadius: 2, backgroundColor: c.actionSecondary }, line]} /></View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {STAGES.map((st, i) => (
          <View key={st} testID={`stage-${st}`} style={{ alignItems: "center", gap: 2, flex: 1 }}>
            <Dot active={i === idx && job.status !== "done" && job.status !== "error"} done={i < idx || job.status === "done"} />
            <Txt v="micro" tone={i === idx ? "accent" : "muted"}>{st}</Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

