import { create } from "zustand";

export type ThemePref = "system" | "light" | "dark";
export type Resolved = "light" | "dark";

const systemDark = () => typeof window === "undefined" || !window.matchMedia || !!window.matchMedia("(prefers-color-scheme: dark)")?.matches;

export function resolveTheme(pref: ThemePref): Resolved {
  return pref === "system" ? (systemDark() ? "dark" : "light") : pref;
}

function load(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "dark"; // Midnight Terrain ships first
  } catch {
    return "dark";
  }
}

function apply(pref: ThemePref) {
  if (typeof document === "undefined") return;
  const r = resolveTheme(pref);
  document.documentElement.dataset.theme = r;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", r === "dark" ? "#07111f" : "#f3f7fb");
}

interface UiState {
  themePreference: ThemePref;
  resolved: Resolved;
  toastMessage: string | null;
  toastVisible: boolean;
  imageViewerUri: string | null;
  setTheme: (t: ThemePref) => void;
  showToast: (msg: string) => void;
  hideToast: () => void;
  openImageViewer: (uri: string) => void;
  closeImageViewer: () => void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
const initial = load();
apply(initial);

export const useUi = create<UiState>((set) => ({
  themePreference: initial,
  resolved: resolveTheme(initial),
  toastMessage: null,
  toastVisible: false,
  imageViewerUri: null,
  setTheme: (t) => {
    try { localStorage.setItem(KEY, t); } catch { /* private mode */ }
    apply(t);
    set({ themePreference: t, resolved: resolveTheme(t) });
  },
  showToast: (msg) => {
    clearTimeout(toastTimer);
    set({ toastMessage: msg, toastVisible: true });
    toastTimer = setTimeout(() => set({ toastVisible: false }), 3000); // auto-dismiss after 3 s
  },
  hideToast: () => set({ toastVisible: false }),
  openImageViewer: (uri) => set({ imageViewerUri: uri }),
  closeImageViewer: () => set({ imageViewerUri: null }),
}));

if (typeof window !== "undefined" && window.matchMedia) {
  window.matchMedia("(prefers-color-scheme: dark)")?.addEventListener?.("change", () => {
    const { themePreference, setTheme } = useUi.getState();
    if (themePreference === "system") setTheme("system");
  });
}
