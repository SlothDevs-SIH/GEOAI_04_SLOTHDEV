import { useRouter } from "expo-router";
import { View } from "react-native";
import { AnalyseCard, HeroHeader, SceneCard } from "../components/scenes/SceneCards";
import { ScreenScroll } from "../components/layout/Screen";
import { EmptyState, ErrorState } from "../components/ui/Alerts";
import { Skeleton } from "../components/ui/Skeleton";
import { useScenes } from "../hooks/useData";
import { space } from "../theme/tokens";

export default function Scenes() {
  const { data, error, loading, retry } = useScenes();
  const router = useRouter();
  return (
    <ScreenScroll onRefresh={retry} refreshing={loading && !!data}>
      <HeroHeader />
      {error && <ErrorState message={`Could not load the demo scenes (${error}).`} onRetry={retry} />}
      {!data && !error && (
        <View testID="scene-grid" style={{ flexDirection: "row", flexWrap: "wrap", gap: space[4] }}>
          {Array.from({ length: 8 }, (_, i) => <View key={i} style={{ flexGrow: 1, flexBasis: 240, maxWidth: 420, gap: space[2] }}><Skeleton height={170} /><Skeleton width="60%" /><Skeleton width="40%" /></View>)}
        </View>
      )}
      {data && data.length === 0 && <EmptyState title="No scenes found." actionLabel="Analyse your own area" onAction={() => router.push("/analyse")} />}
      {data && data.length > 0 && (
        <View testID="scene-grid" style={{ flexDirection: "row", flexWrap: "wrap", gap: space[4] }}>
          {data.map((s, i) => <SceneCard key={s.id} scene={s} index={i} />)}
          <AnalyseCard />
        </View>
      )}
    </ScreenScroll>
  );
}
