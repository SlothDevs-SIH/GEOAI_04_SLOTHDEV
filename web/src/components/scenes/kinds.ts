import type { SceneMeta } from "../../lib/types";

/** Plain-language label for a scene's `kind` (see scripts/export_demo_assets.py). */
export const KIND: Record<string, string> = {
  flood: "Flood · radar",
  encroachment: "Encroachment",
  control: "False-alarm control",
  regional: "Regional check",
};

export const kindLabel = (kind: string) => KIND[kind] ?? kind;

/** Scenes with precomputed learned / hybrid results carry `variants` in meta.json / index.json. */
export type SceneWithVariants = SceneMeta & { variants?: { mode: string; raw_detections?: number; after_filter?: number }[] };

/** Number of detector modes with precomputed results: the default spectral one plus every variant. */
export const detectorCount = (s: SceneWithVariants) => (s.variants?.length ? 1 + s.variants.length : 0);
