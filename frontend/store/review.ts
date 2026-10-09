import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import type { ReviewStatus } from "../lib/types";

// Confirm / dismiss decisions per scene. Persisted (localStorage on web, AsyncStorage on native).
export type Decisions = Record<string, Record<number, ReviewStatus>>;
export const REVIEW_KEY = "geoai04.review.v1";

interface ReviewState {
  decisions: Decisions;
  hydrated: boolean;
  status: (scene: string, id: number) => ReviewStatus;
  set: (scene: string, id: number, s: ReviewStatus) => void;
  reset: (scene: string) => void;
  hydrate: () => Promise<void>;
}

const save = (d: Decisions) => AsyncStorage.setItem(REVIEW_KEY, JSON.stringify(d)).catch(() => undefined);

export const useReview = create<ReviewState>((set, get) => ({
  decisions: {},
  hydrated: false,
  status: (scene, id) => get().decisions[scene]?.[id] ?? "pending",
  set: (scene, id, s) => {
    const d = { ...get().decisions, [scene]: { ...(get().decisions[scene] ?? {}), [id]: s } };
    void save(d);
    set({ decisions: d });
  },
  reset: (scene) => {
    const d = { ...get().decisions };
    delete d[scene];
    void save(d);
    set({ decisions: d });
  },
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(REVIEW_KEY);
      // decisions made before hydration finished win over the stored ones
      if (raw) set({ decisions: { ...(JSON.parse(raw) as Decisions), ...get().decisions }, hydrated: true });
      else set({ hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
}));
