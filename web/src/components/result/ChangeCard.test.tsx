import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ChangeProps } from "../../lib/types";
import ChangeCard from "./ChangeCard";

afterEach(cleanup);

const p: ChangeProps = {
  id: 1, tier: "critical", change_type: "built_up_gain", area_m2: 94600, area_ha: 9.46, magnitude: 0.57, confidence: 0.91, needs_review: false,
  centroid_lat: 18.61425, centroid_lon: 73.75729, score: 53643, review_status: "pending",
  reason: "new construction / built-up: vegetation index fell (-0.14), water index rose (+0.23)",
};

describe("ChangeCard (what a click on a polygon tells you)", () => {
  it("says the rank, the priority, what the change is, why it was flagged and what to do", () => {
    render(<ChangeCard feature={p} base="/demos/x" total={475} onReview={() => undefined} />);
    expect(screen.getByTestId("rank")).toHaveTextContent("Rank 1 of 475 · Critical priority");
    expect(screen.getByTestId("meaning")).toHaveTextContent(/roofs, roads or concrete/);
    expect(screen.getByTestId("reason")).toHaveTextContent("Why: vegetation index fell (-0.14), water index rose (+0.23)");
    expect(screen.getByTestId("advice")).toHaveTextContent(/Check first/);
    expect(screen.getByTestId("pitches")).toHaveTextContent("about 13 football pitches");
  });
  it("leaves out the football pitches for small changes and keeps the empty-state hint", () => {
    render(<ChangeCard feature={{ ...p, area_m2: 800, tier: "low" }} base="/demos/x" onReview={() => undefined} />);
    expect(screen.queryByTestId("pitches")).toBeNull();
    expect(screen.getByTestId("rank")).toHaveTextContent("Rank 1 · Low priority");
    cleanup();
    render(<ChangeCard base="/demos/x" onReview={() => undefined} />);
    expect(screen.getByTestId("change-card-empty")).toHaveTextContent(/Click a polygon/);
  });
});
