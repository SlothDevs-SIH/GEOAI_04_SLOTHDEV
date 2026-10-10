import type { ChangeProps, Tier } from "./types";

/** Plain-language wording for a change, shared by the selected-change card, the map popup and (mirrored) the PDF report. */
export const TYPE_MEANING: Record<string, string> = {
  built_up_gain: "Land that was open (vegetation or bare soil) now looks built-up: roofs, roads or concrete.",
  vegetation_loss: "Green cover has gone: trees or crops removed, or land stripped bare.",
  vegetation_gain: "Green cover has increased: new crops or regrowth.",
  water_gain: "Ground that was dry is now covered by water.",
  water_loss: "Water that was there before has gone.",
  other: "The land changed a lot but not in a way that matches a known type. Look at the images.",
};

export const TIER_ADVICE: Record<Tier, string> = {
  critical: "Check first. A large, strong change; send someone or review recent imagery now.",
  high: "Check soon. A substantial change that is probably real.",
  medium: "Check when you can, for example on a routine inspection.",
  low: "Small or weak change. Often noise: confirm before acting.",
};

const PITCH_HA = 0.714; // 105 m x 68 m

export const typeMeaning = (t: string) => TYPE_MEANING[t] ?? "";
export const tierAdvice = (t: string) => TIER_ADVICE[t as Tier] ?? "";

/** "about 13 football pitches" for large changes, null when the comparison would not help. */
export function pitches(areaM2: number): string | null {
  const n = areaM2 / 10000 / PITCH_HA;
  return n >= 1.5 ? `about ${Math.round(n).toLocaleString("en-IN")} football pitches` : null;
}

/** The engine writes "<type>: <evidence>"; the card shows the type separately, so only the evidence is the reason. */
export const evidenceOf = (reason: string) => reason.split(": ").slice(1).join(": ") || reason;

export interface RankMarker { id: number; lon: number; lat: number; tier: Tier }

/** The `top` highest-priority changes among those on screen, numbered by their rank (the id; rank 1 = most severe). */
export function rankMarkers(visible: ChangeProps[], top = 10): RankMarker[] {
  return [...visible].sort((a, b) => a.id - b.id).slice(0, top)
    .map((p) => ({ id: p.id, lon: p.centroid_lon, lat: p.centroid_lat, tier: p.tier }));
}
