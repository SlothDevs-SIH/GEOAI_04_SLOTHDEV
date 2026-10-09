import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

export type ThemePref = "system" | "light" | "dark";
const KEY = "geoai04.theme.v1";

interface UiState {
  toastMessage: string | null;
  toastVisible: boolean;
  themePreference: ThemePref;
  imageViewerUri: string | null;
  showToast: (msg: string) => void;
  hideToast: () => void;
  setTheme: (t: ThemePref) => void;
  openImageViewer: (uri: string) => void;
  closeImageViewer: () => void;
}

export const useUi = create<UiState>((set) => ({
  toastMessage: null,
  toastVisible: false,
  themePreference: "dark", // Midnight Terrain first
  imageViewerUri: null,
  showToast: (toastMessage) => set({ toastMessage, toastVisible: true }),
  hideToast: () => set({ toastVisible: false }),
  setTheme: (themePreference) => {
    AsyncStorage.setItem(KEY, themePreference).catch(() => undefined);
    set({ themePreference });
  },
  openImageViewer: (imageViewerUri) => set({ imageViewerUri }),
  closeImageViewer: () => set({ imageViewerUri: null }),
}));

/** Restore the saved theme once at start-up (safe when storage is unavailable). */
export async function hydrateTheme(): Promise<void> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") useUi.setState({ themePreference: v });
  } catch { /* keep the default */ }
}
