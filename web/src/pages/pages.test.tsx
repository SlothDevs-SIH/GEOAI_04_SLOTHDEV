import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockStaticFetch } from "../test/staticFetch";
import Accuracy from "./Accuracy";
import Analyse from "./Analyse";
import Result from "./Result";
import Scenes from "./Scenes";

// MapLibre needs WebGL, which jsdom lacks; the map itself is covered by the Playwright smoke test.
vi.mock("../components/map/CompareMap", () => ({ default: () => <div data-testid="compare-map" /> }));
vi.mock("qrcode", () => ({ default: { toDataURL: async () => "data:image/png;base64," } }));

const at = (path: string, el: React.ReactNode, route = "*") =>
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={el} /></Routes></MemoryRouter>);

afterEach(cleanup);            // vitest globals are off, so testing-library does not unmount between tests by itself

beforeEach(() => {
  mockStaticFetch();
  localStorage.clear();
});

describe("Scenes", () => {
  it("lists the demo scenes and the analyse card", async () => {
    at("/", <Scenes />);
    await waitFor(() => expect(screen.getAllByTestId("scene-card")).toHaveLength(9));
    expect(screen.getByText("Try your own")).toBeInTheDocument();
  });
});

describe("Result", () => {
  it("shows the raw → real counter and toggles it", async () => {
    at("/scene/navi-mumbai-airport", <Result />, "/scene/:id");
    const counter = await screen.findByTestId("counter");
    expect(counter).toHaveTextContent("2,185 raw detections → 265 real changes");
    fireEvent.click(screen.getByTestId("filter-toggle"));
    await waitFor(() => expect(screen.getByTestId("counter")).toHaveTextContent("Filter off: 2,185 raw detections"), { timeout: 3000 });
  });
  it("selecting a change shows its reason, and confirm is remembered", async () => {
    at("/scene/navi-mumbai-airport", <Result />, "/scene/:id");
    const rows = await screen.findAllByTestId("change-row");
    fireEvent.click(rows[0]);
    expect(await screen.findByTestId("reason")).toHaveTextContent(/Why:/);
    fireEvent.click(screen.getByTestId("confirm"));
    expect(screen.getByTestId("confirm")).toHaveTextContent("Confirmed");
    expect(localStorage.getItem("geoai04.review.v1")).toContain("navi-mumbai-airport");
  });
  it("radar scene shows accuracy against expert labels", async () => {
    at("/scene/assam-flood-2016", <Result />, "/scene/:id");
    expect(await screen.findByTestId("scene-eval")).toHaveTextContent("IoU");
  });
  it("unknown scene shows an error, not a blank page", async () => {
    at("/scene/nowhere", <Result />, "/scene/:id");
    expect(await screen.findByText(/Could not load this scene/)).toBeInTheDocument();
  });
});

describe("Accuracy", () => {
  it("renders measured tables from results.json", async () => {
    at("/accuracy", <Accuracy />);
    expect(await screen.findByTestId("acc-m8")).toBeInTheDocument();
    expect(screen.getAllByRole("table").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByTestId("acc-ablation")).toHaveTextContent("speckle");
  });
  it("shows the optical, per-location, high-res and real-event radar results, and no stale 'not measured' claim", async () => {
    at("/accuracy", <Accuracy />);
    const oscd = await screen.findByTestId("acc-oscd");
    expect(oscd).toHaveTextContent("Learned Siamese U-Net");
    expect(oscd).toHaveTextContent("gate winner");
    expect(oscd).toHaveTextContent("0.54 [0.34, 0.66]");                     // learned F1 with its interval
    expect(oscd).toHaveTextContent("0.38 [0.13, 0.52]");                     // spectral F1 with its interval
    const loc = screen.getByTestId("acc-oscd-locations");
    expect(loc).toHaveTextContent("lasvegas");
    expect(loc).toHaveTextContent("valencia");
    expect(loc).toHaveTextContent("10 worldwide locations");
    expect(loc).toHaveTextContent("Spectral beats naive in only 3 of 10");
    expect(screen.getByTestId("acc-learned-fa")).toHaveTextContent("season-control");
    const levir = screen.getByTestId("acc-levir");
    expect(levir).toHaveTextContent("0.90 [0.89, 0.91]");
    expect(levir).toHaveTextContent("reproduced");
    expect(levir).toHaveTextContent("academic use only");
    const radar = screen.getByTestId("acc-radar-events");
    expect(radar).toHaveTextContent("assam_2024");
    expect(radar).toHaveTextContent("56.43 km²");
    const nm = screen.getByTestId("acc-not-measured");
    expect(nm).toHaveTextContent("NASA OPERA");                              // still open, taken from the results file
    expect(nm).not.toHaveTextContent("blocked in our build environment");     // the old hard-coded claim is gone
  });
});

describe("Accuracy: seed study card", () => {
  it("appears only when the results file has a variant study, with mean and spread", async () => {
    const real = JSON.parse(readFileSync(resolve(__dirname, "../../public/eval/results.json"), "utf8"));
    real.oscd.variant_study = { split: "validation locations only", seeds: [0, 1, 2], note: "validation only; shipped model untouched",
      variants: { "cap10": { pos_weight_cap: 10, summary: { pipeline_f1: { mean: 0.31, sd: 0.02, n: 3 }, pipeline_precision: { mean: 0.5, sd: 0.04, n: 3 },
        pipeline_recall: { mean: 0.25, sd: 0.03, n: 3 }, farmland_polygons_per_km2: null } } } };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(real), { status: 200 })));
    at("/accuracy", <Accuracy />);
    const card = await screen.findByTestId("acc-variant-study");
    expect(card).toHaveTextContent("0.31 ± 0.02");
    expect(card).toHaveTextContent("validation only; shipped model untouched");
    cleanup();
    mockStaticFetch();                                              // the real results file has no study yet
    at("/accuracy", <Accuracy />);
    await screen.findByTestId("acc-oscd");
    expect(screen.queryByTestId("acc-variant-study")).toBeNull();
  });
});

describe("Analyse", () => {
  it("says the live service is offline when no API is configured", async () => {
    at("/analyse", <Analyse />);
    expect(await screen.findByTestId("analyse-offline")).toHaveTextContent("Live analysis is offline");
  });
});
