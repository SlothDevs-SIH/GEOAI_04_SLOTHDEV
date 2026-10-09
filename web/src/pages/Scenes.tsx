import AnalyseCard from "../components/scenes/AnalyseCard";
import HeroHeader from "../components/scenes/HeroHeader";
import { SceneGrid, SceneGridSkeleton } from "../components/scenes/SceneGrid";
import { useScenes } from "../components/scenes/useScenes";
import { EmptyState, ErrorState } from "../components/ui/Primitives";

export default function Scenes() {
  const { data: scenes, error, loading, retry } = useScenes();
  return (
    <div className="mx-auto max-w-6xl px-s18 py-s26 md:py-s36">
      <HeroHeader />
      <div className="mt-s26 md:mt-s36">
        {loading && <SceneGridSkeleton />}
        {error && <ErrorState message={`Could not load the demo scenes (${error}).`} onRetry={retry} />}
        {scenes && scenes.length === 0 && (
          <div className="flex flex-col gap-s18">
            <EmptyState title="No scenes found." body="The demo scene list is empty. You can still analyse your own area." />
            <div className="mx-auto w-full max-w-xs"><AnalyseCard /></div>
          </div>
        )}
        {scenes && scenes.length > 0 && <SceneGrid scenes={scenes} />}
      </div>
      <footer className="mt-s36 border-t border-line pt-s18 text-tiny text-muted">
        <span>Team Slothdevs</span>
      </footer>
    </div>
  );
}
