import { Skeleton } from "../ui/Primitives";
import type { SceneWithVariants } from "./kinds";
import AnalyseCard from "./AnalyseCard";
import SaveOffline from "./SaveOffline";
import SceneCard from "./SceneCard";

const GRID = "grid gap-s18 sm:grid-cols-2 lg:grid-cols-4";

/** L-04: the scene cards plus the "Try your own" card. */
export function SceneGrid({ scenes }: { scenes: SceneWithVariants[] }) {
  return (
    <ul data-testid="scene-grid" className={`${GRID} m-0 list-none p-0`}>
      {scenes.map((s, i) => <li key={s.id} className="flex h-full flex-col gap-s4"><div className="flex-1"><SceneCard scene={s} index={i} /></div><SaveOffline ids={[s.id]} compact testid={`save-${s.id}`} /></li>)}
      <li className="h-full"><AnalyseCard index={scenes.length} /></li>
    </ul>
  );
}

/** Loading state: 8 card-shaped skeletons (A7). */
export function SceneGridSkeleton() {
  return (
    <div data-testid="scene-grid-loading" aria-busy="true" aria-label="Loading scenes" role="status" className={GRID}>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} data-testid="scene-skeleton" className="overflow-hidden rounded-md border border-line bg-surface shadow-card">
          <Skeleton height={168} radius={0} />
          <div className="flex flex-col gap-s8 p-s12">
            <Skeleton width={96} height={14} />
            <Skeleton width="80%" height={18} />
            <Skeleton width="60%" height={12} />
            <Skeleton width="45%" height={14} />
          </div>
        </div>
      ))}
    </div>
  );
}
