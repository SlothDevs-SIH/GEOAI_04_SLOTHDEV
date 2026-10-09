import type { FeatureCollection, SceneData } from "../../lib/types";

export interface CompareMapProps {
  scene: SceneData;
  filterOn: boolean;
  raw?: FeatureCollection;
  showLabels: boolean;
  showPolygons: boolean;
  filter: unknown[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  swipe: number; // 0..100, position of the divider
  onSwipe: (pct: number) => void;
}
