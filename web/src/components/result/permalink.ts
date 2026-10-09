import { parseDetector } from "../../hooks/useScene";
import type { Detector } from "../../lib/types";

/** The part of the Result view that lives in the URL (A2): `sel`, `filter` (on|off), `swipe` (0..100) and `mode` (detector). */
export interface Permalink {
  sel: number | null;
  filterOn: boolean;
  swipe: number;
  mode: Detector;
}

export const DEFAULT_SWIPE = 50;

export function readPermalink(p: URLSearchParams): Permalink {
  const sel = p.get("sel") != null && p.get("sel") !== "" ? Number(p.get("sel")) : NaN;
  const swipe = p.get("swipe") != null && p.get("swipe") !== "" ? Number(p.get("swipe")) : NaN;
  return {
    sel: Number.isInteger(sel) ? sel : null,
    filterOn: p.get("filter") !== "off",
    swipe: Number.isFinite(swipe) ? Math.max(0, Math.min(100, swipe)) : DEFAULT_SWIPE,
    mode: parseDetector(p.get("mode")),
  };
}

/** Writes the view into a copy of `base`, leaving unrelated params alone. Defaults are omitted to keep links short. */
export function writePermalink(base: URLSearchParams, s: Permalink): URLSearchParams {
  const p = new URLSearchParams(base);
  const put = (k: string, v: string | null) => (v == null ? p.delete(k) : p.set(k, v));
  put("sel", s.sel == null ? null : String(s.sel));
  put("filter", s.filterOn ? null : "off");
  put("swipe", Math.round(s.swipe) === DEFAULT_SWIPE ? null : String(Math.round(s.swipe)));
  put("mode", s.mode === "spectral" ? null : s.mode);
  return p;
}
