import type { ApiHealth, DetectorMode } from "../../lib/api";

export interface ModeInfo {
  id: DetectorMode;
  label: string;
  short: string;
  note: string;
}

/** The detectors offered for Sentinel-2 areas and uploads. `deep` (BIT) is for 0.5 m RGB imagery, so it is not listed. */
export const MODES: ModeInfo[] = [
  {
    id: "spectral",
    label: "Spectral rules",
    short: "Default",
    note: "Transparent spectral-index rules (vegetation, water, built-up). The default: every detection can be explained.",
  },
  {
    id: "learned",
    label: "Learned · PyTorch→ONNX",
    short: "Siamese U-Net",
    note: "A Siamese U-Net trained with PyTorch, exported to ONNX and run with ONNX Runtime. Best held-out F1 (0.54 vs 0.38), but on no-change farmland it raises about 12x more polygons than the rules.",
  },
  {
    id: "hybrid",
    label: "Hybrid",
    short: "Learned + rules",
    note: "The learned model proposes changes and the spectral rules must also name a real change type. Fewer farmland false alarms, but it also drops real change.",
  },
];

export interface Availability {
  available: boolean;
  reason?: string;
  backend?: string;
}

/** Turn a Python exception string from /health into a short sentence a non-engineer can read. */
export function plainReason(raw: string | undefined): string {
  if (!raw) return "the server did not say why";
  if (/ModuleNotFoundError|ImportError/.test(raw)) return "the ONNX Runtime package is not installed on this server";
  if (/FileNotFoundError|No such file/i.test(raw)) return "the trained model file is not on this server";
  const text = raw.replace(/^\w+(Error|Exception):\s*/, "").trim();
  return text.length > 140 ? `${text.slice(0, 137)}...` : text || "the server did not say why";
}

/**
 * Whether a detector can be used, from the parsed /health body.
 * `health` undefined means "not known yet / no server": spectral is always allowed, the others are not.
 */
export function modeAvailability(health: ApiHealth | undefined, mode: DetectorMode): Availability {
  if (mode === "spectral") return { available: true };
  if (!health) return { available: false, reason: "Needs the analysis server, which is not reachable right now." };
  const learned = health.model_status?.learned;
  const listed = health.modes?.includes(mode) ?? health.models?.learned ?? learned?.available;
  if (listed) return { available: true, backend: learned?.backend };
  const why = health.modes === undefined && learned === undefined
    ? "this server did not report its detectors"
    : plainReason(learned?.reason);
  return { available: false, reason: `Not available on this server: ${why}.` };
}
