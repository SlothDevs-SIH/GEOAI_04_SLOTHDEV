import { beforeEach, describe, expect, it } from "vitest";
import { useReview } from "./review";

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
});
