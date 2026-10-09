import { create } from "zustand";
import type { ReviewStatus } from "../lib/types";

// Confirm / dismiss decisions per scene, kept in localStorage for demo scenes (no sign-in).
// Shape: sceneId -> changeId -> status. Detector variants use the key `<sceneId>@<mode>` (their change ids differ).
type Decisions = Record<string, Record<number, ReviewStatus>>;
export const REVIEW_KEY = "geoai04.review.v1";
/** Earlier builds stored decisions under an unversioned key; they are read once so nothing a reviewer did is lost. */
const LEGACY_KEYS = ["geoai04.review"];

const isDecisions = (v: unknown): v is Decisions => typeof v === "object" && v !== null && !Array.isArray(v);

function read(key: string): Decisions | undefined {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return undefined;
    const v: unknown = JSON.parse(raw);
    return isDecisions(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

function load(): Decisions {
  const current = read(REVIEW_KEY);
  if (current) return current;
  for (const k of LEGACY_KEYS) {
    const old = read(k);
    if (old) {
      save(old); // migrate to the versioned key
      return old;
    }
  }
  return {};
}

function save(d: Decisions) {
  try {
    localStorage.setItem(REVIEW_KEY, JSON.stringify(d));
  } catch {
    /* private mode: decisions stay in memory */
  }
}

/** Review key for a scene and detector: the default spectral result keeps the bare scene id. */
export const reviewKey = (scene: string, detector?: string) => (!detector || detector === "spectral" ? scene : `${scene}@${detector}`);

interface ReviewState {
  decisions: Decisions;
  status: (scene: string, id: number) => ReviewStatus;
  set: (scene: string, id: number, s: ReviewStatus) => void;
  reset: (scene: string) => void;
}

export const useReview = create<ReviewState>((set, get) => ({
  decisions: load(),
  status: (scene, id) => get().decisions[scene]?.[id] ?? "pending",
  set: (scene, id, s) => {
    const d = { ...get().decisions, [scene]: { ...(get().decisions[scene] ?? {}), [id]: s } };
    save(d);
    set({ decisions: d });
  },
  reset: (scene) => {
    const d = { ...get().decisions };
    delete d[scene];
    save(d);
    set({ decisions: d });
  },
}));
