import { useMemo, useState } from "react";
import AnalyseCard from "../components/scenes/AnalyseCard";
import HeroHeader from "../components/scenes/HeroHeader";
import SaveOffline from "../components/scenes/SaveOffline";
import { SceneGrid, SceneGridSkeleton } from "../components/scenes/SceneGrid";
import { useScenes } from "../components/scenes/useScenes";
import { EmptyState, ErrorState } from "../components/ui/Primitives";

export default function Scenes() {
  const { data: scenes, error, loading, retry } = useScenes();
  const [filter, setFilter] = useState<string>("all");

  const filteredScenes = useMemo(() => {
    if (!scenes) return [];
    if (filter === "all") return scenes;
    if (filter === "encroachment") return scenes.filter((s) => s.kind === "encroachment");
    if (filter === "flood") return scenes.filter((s) => s.kind === "flood");
    if (filter === "control") return scenes.filter((s) => s.kind === "control");
    if (filter === "regional") return scenes.filter((s) => s.kind === "regional");
    return scenes;
  }, [scenes, filter]);

  const counts = useMemo(() => {
    if (!scenes) return { all: 0, encroachment: 0, flood: 0, control: 0, regional: 0 };
    return {
      all: scenes.length,
      encroachment: scenes.filter((s) => s.kind === "encroachment").length,
      flood: scenes.filter((s) => s.kind === "flood").length,
      control: scenes.filter((s) => s.kind === "control").length,
      regional: scenes.filter((s) => s.kind === "regional").length,
    };
  }, [scenes]);

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
        {scenes && scenes.length > 0 && (
          <>
            <div className="mb-s18 flex flex-wrap items-center gap-s8">
              <SaveOffline ids={scenes.map((x) => x.id)} label={`Save all scenes (~${Math.round(scenes.length * 4.4)} MB)`} testid="save-all" />
              <button
                type="button"
                data-testid="filter-all"
                onClick={() => setFilter("all")}
                className={`rounded-xs px-3 py-1.5 text-tiny font-medium transition-colors cursor-pointer ${filter === "all" ? "bg-accent text-slate-950 font-semibold" : "bg-surface border border-line text-secondary hover:text-fg"}`}
              >
                All Scenes ({counts.all})
              </button>
              {counts.encroachment > 0 && (
                <button
                  type="button"
                  data-testid="filter-encroachment"
                  onClick={() => setFilter("encroachment")}
                  className={`rounded-xs px-3 py-1.5 text-tiny font-medium transition-colors cursor-pointer ${filter === "encroachment" ? "bg-amber-400 text-slate-950 font-semibold" : "bg-surface border border-line text-secondary hover:text-fg"}`}
                >
                  ★ Priority 1: Encroachment ({counts.encroachment})
                </button>
              )}
              {counts.flood > 0 && (
                <button
                  type="button"
                  data-testid="filter-flood"
                  onClick={() => setFilter("flood")}
                  className={`rounded-xs px-3 py-1.5 text-tiny font-medium transition-colors cursor-pointer ${filter === "flood" ? "bg-cyan-400 text-slate-950 font-semibold" : "bg-surface border border-line text-secondary hover:text-fg"}`}
                >
                  ★ Priority 2: Flood / Radar ({counts.flood})
                </button>
              )}
              {counts.control > 0 && (
                <button
                  type="button"
                  data-testid="filter-control"
                  onClick={() => setFilter("control")}
                  className={`rounded-xs px-3 py-1.5 text-tiny font-medium transition-colors cursor-pointer ${filter === "control" ? "bg-accent text-slate-950 font-semibold" : "bg-surface border border-line text-secondary hover:text-fg"}`}
                >
                  False-Alarm Control ({counts.control})
                </button>
              )}
              {counts.regional > 0 && (
                <button
                  type="button"
                  data-testid="filter-regional"
                  onClick={() => setFilter("regional")}
                  className={`rounded-xs px-3 py-1.5 text-tiny font-medium transition-colors cursor-pointer ${filter === "regional" ? "bg-accent text-slate-950 font-semibold" : "bg-surface border border-line text-secondary hover:text-fg"}`}
                >
                  Regional Checks ({counts.regional})
                </button>
              )}
            </div>
            <SceneGrid scenes={filteredScenes} />
          </>
        )}
      </div>
      <footer className="mt-s36 border-t border-line pt-s18 text-tiny text-muted">
        <span>Team Slothdevs</span>
      </footer>
    </div>
  );
}
