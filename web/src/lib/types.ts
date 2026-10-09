// Shapes written by scripts/export_demo_assets.py and returned by the API (BACKEND_PLAN §6).

export type Tier = "critical" | "high" | "medium" | "low";
export type ReviewStatus = "pending" | "confirmed" | "dismissed";

export interface SceneMeta {
  id: string;
  name: string;
  place: string;
  event: string;
  kind: "flood" | "encroachment" | "control" | string;
  mode: "spectral" | "radar" | string;
  before_date: string;
  after_date: string;
  before_label: string;
  after_label: string;
  source: string;
  story?: string;
  corners?: [number, number][];
  labels?: string;
  demo: boolean;
  after_filter?: number;
  raw_detections?: number;
}

export interface ChangeProps {
  id: number;
  tier: Tier;
  change_type: string;
  area_m2: number;
  area_ha: number;
  magnitude: number;
  confidence: number;
  needs_review: boolean;
  centroid_lat: number;
  centroid_lon: number;
  reason: string;
  score: number;
  review_status: ReviewStatus;
  cropland_ha?: number;
}

export interface Feature<P> {
  type: "Feature";
  properties: P;
  geometry: { type: string; coordinates: unknown };
}

export interface FeatureCollection<P = Record<string, unknown>> {
  type: "FeatureCollection";
  features: Feature<P>[];
}

export interface Impact {
  changed_ha: number;
  cropland_ha: number | null;
  built_up_ha: number | null;
  buildings: number | null;
  road_segments: number | null;
  cropland_reliability?: "ok" | "upper_bound";
  sources: string[];
  notes: string[];
}

export interface Summary {
  mode: string;
  preset?: string;
  raw_detections: number;
  after_filter: number;
  dropped: Record<string, number>;
  total_area_m2: number;
  by_tier: Partial<Record<Tier, number>>;
  by_type: Record<string, number>;
  runtime_s?: number;
  area_km2?: number;
  s_per_km2?: number;
  impact: Impact;
  warnings: string[];
  quality?: Record<string, unknown>;
  sources: string[];
  limits: string[];
  subtitle?: string;
  evaluation?: {
    against: string;
    m8: { iou: number; precision: number; recall: number; fp: number };
    naive: { iou: number; precision: number; recall: number; fp: number };
  };
}

export interface SceneData {
  meta: SceneMeta;
  summary: Summary;
  filtered: FeatureCollection<ChangeProps>;
  base: string; // URL prefix for this scene's static files
}
