import { beforeEach, describe, expect, it, vi } from "vitest";
import { REVIEW_KEY, reviewKey, useReview } from "./review";

describe("review store", () => {
  beforeEach(() => useReview.getState().reset("s"));
  it("stores decisions per scene and persists them", () => {
    useReview.getState().set("s", 7, "confirmed");
    expect(useReview.getState().status("s", 7)).toBe("confirmed");
    expect(useReview.getState().status("s", 8)).toBe("pending");
    expect(useReview.getState().status("other", 7)).toBe("pending");
    expect(JSON.parse(localStorage.getItem("geoai04.review.v1")!).s["7"]).toBe("confirmed");
  });
  it("reset clears one scene", () => {
    useReview.getState().set("s", 1, "dismissed");
    useReview.getState().reset("s");
    expect(useReview.getState().status("s", 1)).toBe("pending");
  });
  it("cycles pending -> confirmed -> pending", () => {
    const { set, status } = useReview.getState();
    set("s", 3, "confirmed");
    expect(status("s", 3)).toBe("confirmed");
    set("s", 3, "pending");
    expect(useReview.getState().status("s", 3)).toBe("pending");
  });
  it("uses the versioned storage key and keeps detector variants apart", () => {
    expect(REVIEW_KEY).toBe("geoai04.review.v1");
    expect(reviewKey("scene")).toBe("scene");
    expect(reviewKey("scene", "spectral")).toBe("scene");
    expect(reviewKey("scene", "learned")).toBe("scene@learned");
  });
  it("loads saved decisions on start, migrating the legacy key and ignoring corrupt data", async () => {
    localStorage.removeItem(REVIEW_KEY);
    localStorage.setItem("geoai04.review", JSON.stringify({ old: { 5: "confirmed" } }));
    vi.resetModules();
    let fresh = await import("./review");
    expect(fresh.useReview.getState().status("old", 5)).toBe("confirmed");
    expect(JSON.parse(localStorage.getItem(REVIEW_KEY)!).old["5"]).toBe("confirmed"); // migrated
    localStorage.removeItem("geoai04.review");
    localStorage.setItem(REVIEW_KEY, "{not json");
    vi.resetModules();
    fresh = await import("./review");
    expect(fresh.useReview.getState().decisions).toEqual({});
    localStorage.removeItem(REVIEW_KEY);
  });
});
