import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveTheme, useUi } from "./ui";

beforeEach(() => {
  localStorage.clear();
  useUi.getState().setTheme("dark");
});
afterEach(() => vi.useRealTimers());

describe("ui store", () => {
  it("ships Midnight Terrain (dark) first", () => {
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(useUi.getState().resolved).toBe("dark");
  });
  it("switches to the light theme, stamps <html> and remembers the choice", () => {
    useUi.getState().setTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(useUi.getState().resolved).toBe("light");
    expect(localStorage.getItem("geoai04.theme")).toBe("light");
  });
  it("resolves 'system' from the OS preference", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((q: string) => ({ matches: q.includes("dark"), media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList);
    expect(resolveTheme("system")).toBe("dark");
    expect(resolveTheme("light")).toBe("light");
    vi.restoreAllMocks();
  });
  it("shows a toast and auto-dismisses it after 3 s", () => {
    vi.useFakeTimers();
    useUi.getState().showToast("Copied");
    expect(useUi.getState()).toMatchObject({ toastVisible: true, toastMessage: "Copied" });
    vi.advanceTimersByTime(3100);
    expect(useUi.getState().toastVisible).toBe(false);
  });
  it("opens and closes the image viewer", () => {
    useUi.getState().openImageViewer("a.webp");
    expect(useUi.getState().imageViewerUri).toBe("a.webp");
    useUi.getState().closeImageViewer();
    expect(useUi.getState().imageViewerUri).toBeNull();
  });
});
