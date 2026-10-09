import { create } from "zustand";
import type { ReviewStatus } from "../lib/types";

// Confirm / dismiss decisions per scene, kept in localStorage for demo scenes (no sign-in).
type Decisions = Record<string, Record<number, ReviewStatus>>;
const KEY = "geoai04.review.v1";

function load(): Decisions {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Decisions;
  } catch {
    return {};
  }
}

function save(d: Decisions) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* private mode: decisions stay in memory */
  }
}

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
