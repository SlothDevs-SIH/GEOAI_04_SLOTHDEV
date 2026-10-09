import type { Results } from "./results";
import { SEASON_CONTROL_ID } from "./results";

export interface HeadlineTile {
  key: string;
  /** Plain-language label: what was measured, on what. */
  label: string;
  /** The number we lead with (our system), shown with `digits` decimals. */
  value: number;
  digits: number;
  unit?: string;
  /** The comparison, in words and numbers, so the tile never relies on colour. */
  secondary: string;
  /** Honest qualifier shown under the numbers. */
  caveat?: string;
  /** id of the table block below that holds the full numbers. */
  anchor: string;
}

const f2 = (v: number) => v.toFixed(2);

/** Headline tiles, derived only from results.json (nothing hard-coded). A tile whose data is missing is left out. */
export function headlineTiles(r: Results): HeadlineTile[] {
  const tiles: HeadlineTile[] = [];

  const ours = r.exp?.results?.m8_hysteresis?.bolivia_heldout;
  const naive = r.exp?.results?.naive_per_chip_otsu?.bolivia_heldout;
  if (ours?.flood_only && naive?.flood_only) {
    tiles.push({
      key: "radar-unseen", anchor: "acc-m8", value: ours.flood_only.iou, digits: 2,
      label: `Flood-map overlap (IoU) in a country it never saw (Bolivia, ${ours.chips} chips)`,
      secondary: `Naive method: ${f2(naive.flood_only.iou)}`,
    });
  }

  const oscd = r.oscd;
  if (oscd?.methods?.learned?.f1) {
    const parts = [
      oscd.methods?.spectral?.f1 ? `Spectral ${f2(oscd.methods.spectral.f1.value)}` : "",
      oscd.methods?.naive?.f1 ? `naive ${f2(oscd.methods.naive.f1.value)}` : "",
    ].filter(Boolean);
    tiles.push({
      key: "oscd", anchor: "acc-oscd", value: oscd.methods.learned.f1.value, digits: 2,
      label: `Optical change F1 (learned detector), ${oscd.split.test_cities} held-out locations`,
      secondary: parts.join(", "),
      caveat: "Intervals overlap: better on average, not clearly better.",
    });
  }

  if (r.levir?.bit?.f1) {
    tiles.push({
      key: "levir", anchor: "acc-levir", value: r.levir.bit.f1.value, digits: 2,
      label: `Building change F1 on 0.5 m imagery (BIT, ${r.levir.scope})`,
      secondary: r.levir.naive?.f1 ? `Naive method: ${f2(r.levir.naive.f1.value)}` : "",
    });
  }

  const sc = r.fa?.scenes.find((s) => s.id === SEASON_CONTROL_ID);
  if (sc) {
    tiles.push({
      key: "false-alarms", anchor: "acc-false-alarms", value: sc.kept_per_km2, digits: 2, unit: "per km²",
      label: "False alarms left after the filter on farmland with no large new buildings",
      secondary: `Filter off: ${sc.raw_per_km2} per km²`,
      caveat: "An upper bound: some of what remains may be real small changes.",
    });
  }

  if (r.india?.m8?.flood_only && r.india.naive_per_chip_otsu?.flood_only) {
    tiles.push({
      key: "assam", anchor: "acc-india", value: r.india.m8.flood_only.iou, digits: 2,
      label: `Assam flood 2016 overlap (IoU) with expert labels, all ${r.india.chips} chips`,
      secondary: `Naive method: ${f2(r.india.naive_per_chip_otsu.flood_only.iou)}`,
    });
  }

  return tiles;
}
