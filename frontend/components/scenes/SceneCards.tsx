import { useRouter } from "expo-router";
import { Image, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useMotion } from "../../hooks/useMotion";
import { staticBase } from "../../lib/api";
import { num } from "../../lib/format";
import type { SceneMeta } from "../../lib/types";
import { useTheme } from "../../theme/ThemeProvider";
import { radius, shadow, space } from "../../theme/tokens";
import { DemoBadge } from "../ui/Badge";
import { Press } from "../ui/Press";
import { Txt } from "../ui/Txt";

const KIND: Record<string, string> = { flood: "Flood · radar", encroachment: "Encroachment", control: "False-alarm control", regional: "Regional check" };

export function HeroHeader() {
  return (
    <View testID="hero" style={{ gap: space[2] }}>
      <Txt v="display" accessibilityRole="header">See what really changed, not every pixel that moved.</Txt>
      <Txt v="body" tone="secondary" style={{ maxWidth: 720 }}>
        Compare two satellite images of the same place. We filter out seasonal, lighting and radar-speckle false alarms,
        then rank the real changes by severity, explain each one, and export them for GIS.
      </Txt>
    </View>
  );
}

export function SceneCard({ scene, index }: { scene: SceneMeta; index: number }) {
  const { c } = useTheme();
  const { reduced } = useMotion();
  const router = useRouter();
  const enter = !reduced && index < 12 ? FadeInDown.duration(260).delay(index * 40) : undefined;
  return (
    <Animated.View entering={enter} style={{ flexGrow: 1, flexBasis: 240, maxWidth: 420 }}>
      <Press testID="scene-card" accessibilityRole="link" accessibilityLabel={`${scene.name}. ${scene.event}`} minSize={false}
        onPress={() => router.push(`/scene/${scene.id}`)}
        style={[{ backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: radius.md, overflow: "hidden" }, shadow.card]}>
        <Image source={{ uri: `${staticBase(scene.id)}/after.webp` }} accessibilityIgnoresInvertColors style={{ width: "100%", aspectRatio: 1.4, backgroundColor: c.skeletonBase }} resizeMode="cover" />
        <View style={{ padding: space[3], gap: space[1] }}>
          <Txt v="micro" tone="accent" style={{ textTransform: "uppercase", letterSpacing: 0.6 }}>{KIND[scene.kind] ?? scene.kind}</Txt>
          <Txt v="h3">{scene.name}</Txt>
          <Txt v="tiny" tone="muted">{scene.event}</Txt>
          <Txt v="tiny" tone="muted">{scene.before_date === scene.after_date ? scene.after_date : `${scene.before_date} → ${scene.after_date}`}</Txt>
          {scene.raw_detections != null && (
            <Txt v="body" style={{ marginTop: space[1] }}>
              <Txt v="small">{num(scene.raw_detections)}</Txt> raw → <Txt v="small" tone="success">{num(scene.after_filter)}</Txt> real
            </Txt>
          )}
          <View style={{ marginTop: space[2] }}><DemoBadge /></View>
        </View>
      </Press>
    </Animated.View>
  );
}

export function AnalyseCard() {
  const { c } = useTheme();
  const router = useRouter();
  return (
    <View style={{ flexGrow: 1, flexBasis: 240, maxWidth: 420 }}>
      <Press testID="analyse-card" accessibilityRole="link" accessibilityLabel="Try your own: draw an area anywhere in India, or upload images" onPress={() => router.push("/analyse")}
        style={{ flex: 1, minHeight: 200, borderWidth: 2, borderStyle: "dashed", borderColor: c.borderStrong, borderRadius: radius.md, padding: space[4], alignItems: "center", gap: space[1] }}>
        <Txt v="display" tone="accent">＋</Txt>
        <Txt v="h3">Try your own</Txt>
        <Txt v="tiny" tone="muted" style={{ textAlign: "center" }}>Draw an area anywhere in India, or upload images</Txt>
      </Press>
    </View>
  );
}
