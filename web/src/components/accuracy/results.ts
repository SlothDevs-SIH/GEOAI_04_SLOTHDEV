import type { Metrics } from "../../lib/api";

/** Typed views of eval/results.json (written by eval/build_results.py). Every block is optional: a missing block is hidden, never faked. */
export type Row = { iou: number; precision: number; recall: number };
export type CI = { value: number; ci95: [number, number] };
export type Scores = { precision: CI; recall: CI; f1: CI; iou: CI };
export type LocScores = { f1: number; precision: number; recall: number; iou: number };
export type Split = { flood_only: Row; chips: number };

export interface M8Experiments { results: Record<string, Record<string, Split>>; split_sizes: Record<string, number> }
export interface M8India { m8: { flood_only: Row }; naive_per_chip_otsu: { flood_only: Row }; raw_blobs_naive: number; polygons_m8: number; chips: number; runtime_s: number }
export interface FaScene { id: string; name: string; area_km2: number; raw: number; kept: number; raw_per_km2: number; kept_per_km2: number; note: string }
export interface FalseAlarms { scenes: FaScene[] }
export interface Ablation { scenes: Record<string, { cumulative: { added: string | null; polygons: number; per_km2: number }[]; leave_one_out: { without: string; extra_vs_full: number }[] }> }
export interface Oscd {
  methods: Record<string, Scores>; default_method: string; ece: number | null; learned_trained: boolean; bootstrap: string;
  split: { test_cities: number };
  per_location?: { locations: Record<string, { region: string } & Record<string, LocScores | string>>; n_locations: number; claim: string;
    summary?: { learned_beats_spectral?: number; learned_beats_naive?: number; spectral_beats_naive: number; learned_weak_locations_f1_below_0_25?: string[] } };
  false_alarms_by_variant?: { scenes: Record<string, { what: string; area_km2: number; per_km2: Record<string, number> }>; finding: string };
  variant_study?: { split: string; seeds: number[]; note: string;
    variants: Record<string, { pos_weight_cap: number; summary: Record<string, { mean: number; sd: number; n: number } | null> }> };
}
export interface Levir { bit: Scores; naive: { f1: CI; iou: CI }; images: number; scope: string; note: string; published_bit: { f1: number; iou: number } }
export interface RadarEvent {
  event: string; source: string; area_km2: number; before_after: { polygons: number; flooded_km2: number };
  single_date: { polygons: number; flooded_km2: number };
  dry_season_pair?: { false_alarm_km2: number; false_alarm_polygons: number; single_date_km2: number; single_date_polygons: number };
}
export interface CompositeVariant { raw_detections: number; after_filter: number; changed_ha: number; detections_per_km2: number; area_km2?: number }
export interface Composites { areas: Record<string, { note?: string; variants: Record<string, CompositeVariant> }> }

export interface Results {
  exp?: M8Experiments;
  india?: M8India;
  fa?: FalseAlarms;
  ab?: Ablation;
  oscd?: Oscd;
  levir?: Levir;
  events?: RadarEvent[];
  composites?: Composites;
  /** undefined = the results file has no such list (block hidden); [] = nothing outstanding. */
  notMeasured?: string[];
}

export function readResults(m: Metrics): Results {
  return {
    exp: m.m8_experiments as M8Experiments | undefined,
    india: m.m8_india as M8India | undefined,
    fa: m.false_alarms as FalseAlarms | undefined,
    ab: m.ablation as Ablation | undefined,
    oscd: m.oscd as Oscd | undefined,
    levir: m.levir as Levir | undefined,
    events: (m.m8_change as { events?: RadarEvent[] } | undefined)?.events,
    composites: (m.composites as Composites | undefined)?.areas ? (m.composites as Composites) : undefined,
    notMeasured: Array.isArray(m.not_measured) ? (m.not_measured as string[]) : undefined,
  };
}

/** "0.54 [0.34, 0.66]": value with its 95% interval. */
export const fmtCI = (x?: CI) => (x ? `${x.value.toFixed(2)} [${x.ci95[0].toFixed(2)}, ${x.ci95[1].toFixed(2)}]` : "–");

export const RULE: Record<string, string> = { cloud: "cloud mask", seasonal: "seasonal", preset: "preset types", speckle: "speckle", min_area: "min area" };

/** The season-control scene is a farmland pair with no large new buildings, not a proven "nothing changed" scene (QA note), so its false-alarm number is an upper bound. */
export const SEASON_CONTROL_ID = "season-control";
export const seasonControlWhat = (id: string, what: string) => (id === SEASON_CONTROL_ID ? "no large new buildings (farmland)" : what);
