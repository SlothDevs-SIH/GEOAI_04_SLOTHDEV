import { Platform } from "react-native";

/** Web only: the service worker precaches the shell and demo scenes so the demo works offline. */
export function registerServiceWorker(): void {
  if (Platform.OS !== "web" || typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  if (typeof location !== "undefined" && location.hostname !== "localhost" && location.protocol !== "https:") return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  });
  if (document.readyState === "complete") navigator.serviceWorker.register("/sw.js").catch(() => undefined);
}
