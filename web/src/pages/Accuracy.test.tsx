import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockStaticFetch } from "../test/staticFetch";
import Accuracy from "./Accuracy";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const real = (): Json => JSON.parse(readFileSync(resolve(__dirname, "../../public/eval/results.json"), "utf8"));
const stubResults = (body: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
const renderAccuracy = () => render(<MemoryRouter><Accuracy /></MemoryRouter>);

beforeEach(() => {
  // reduced motion: the headline numbers show their final value at once (A-05 count-up is instant)
  Object.defineProperty(window, "matchMedia", {
    configurable: true, writable: true,
    value: () => ({ matches: true, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "matchMedia");
});

const IDS = ["acc-m8", "acc-india", "acc-false-alarms", "acc-ablation", "acc-oscd", "acc-oscd-locations", "acc-levir", "acc-not-measured"];

describe("Accuracy: tables from results.json", () => {
  it("renders every measured block in the spec order, each as a card with a table in a scroller", async () => {
    mockStaticFetch();
    renderAccuracy();
    await screen.findByTestId("acc-m8");
    const nodes = IDS.map((id) => screen.getByTestId(id));
    for (let i = 1; i < nodes.length; i++) {
      expect(nodes[i - 1].compareDocumentPosition(nodes[i]) & Node.DOCUMENT_POSITION_FOLLOWING, `${IDS[i - 1]} before ${IDS[i]}`).toBeTruthy();
    }
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Measured accuracy");
    expect(screen.getAllByRole("table").length).toBeGreaterThanOrEqual(9);
    for (const id of ["acc-m8", "acc-oscd", "acc-levir", "acc-false-alarms"]) {
      const scroller = screen.getByTestId(`${id}-scroller`);
      expect(scroller).toHaveAttribute("tabindex", "0");                        // keyboard scrollable
      expect(within(scroller).getByRole("table")).toBeInTheDocument();
    }
  });

  it("keeps every measured number of the previous page", async () => {
    mockStaticFetch();
    renderAccuracy();
    const m8 = await screen.findByTestId("acc-m8");
    expect(m8).toHaveTextContent("0.70 / ");                                  // M8 + region growing on Bolivia: IoU first
    expect(m8).toHaveTextContent("Unseen country (Bolivia) (15 chips)");
    expect(screen.getByTestId("acc-ablation")).toHaveTextContent("speckle");
    const india = screen.getByTestId("acc-india");
    expect(india).toHaveTextContent("0.175");                                 // naive flood IoU, all 68 chips
    expect(india).toHaveTextContent("0.41");
    const fa = screen.getByTestId("acc-false-alarms");
    expect(fa).toHaveTextContent("3,083");
    expect(fa).toHaveTextContent("86.9");
    expect(fa).toHaveTextContent("0.62");
    const oscd = screen.getByTestId("acc-oscd");
    expect(oscd).toHaveTextContent("Learned Siamese U-Net");
    expect(oscd).toHaveTextContent("gate winner");
    expect(oscd).toHaveTextContent("0.54 [0.34, 0.66]");
    expect(oscd).toHaveTextContent("0.38 [0.13, 0.52]");
    const loc = screen.getByTestId("acc-oscd-locations");
    expect(loc).toHaveTextContent("lasvegas");
    expect(loc).toHaveTextContent("10 worldwide locations");
    expect(loc).toHaveTextContent("Spectral beats naive in only 3 of 10");
    expect(loc).toHaveTextContent("weak (F1 below 0.25) in valencia, norcia, saclay_w");
    expect(screen.getByTestId("acc-learned-fa")).toHaveTextContent("season-control");
    const levir = screen.getByTestId("acc-levir");
    expect(levir).toHaveTextContent("0.90 [0.89, 0.91]");
    expect(levir).toHaveTextContent("reproduced");
    expect(levir).toHaveTextContent("academic use only");
    expect(levir).toHaveTextContent("0.89");                                  // quoted published BIT F1
    const radar = screen.getByTestId("acc-radar-events");
    expect(radar).toHaveTextContent("assam_2024");
    expect(radar).toHaveTextContent("56.43 km²");
    const nm = screen.getByTestId("acc-not-measured");
    expect(nm).toHaveTextContent("NASA OPERA");
    expect(nm).not.toHaveTextContent("blocked in our build environment");
  });
});

describe("Accuracy: CI bars", () => {
  it("draws one bar per interval in the OSCD and LEVIR tables, each labelled with its numbers", async () => {
    mockStaticFetch();
    renderAccuracy();
    const oscd = await screen.findByTestId("acc-oscd");
    const bars = within(oscd).getAllByTestId("ci-bar");
    expect(bars).toHaveLength(12);                                            // 3 methods x (F1, IoU, precision, recall)
    for (const b of bars) {
      expect(b).toHaveAttribute("role", "img");
      expect(b.getAttribute("aria-label")).toMatch(/\d\.\d\d, 95% interval \d\.\d\d to \d\.\d\d/);
      const [v, lo, hi] = [Number(b.dataset.value), Number(b.dataset.lo), Number(b.dataset.hi)];
      expect(lo).toBeLessThanOrEqual(v);
      expect(v).toBeLessThanOrEqual(hi);
    }
    expect(within(oscd).getByLabelText("Learned Siamese U-Net (PyTorch, ONNX) F1: 0.54, 95% interval 0.34 to 0.66, on a scale from 0 to 1")).toBeInTheDocument();
    const levir = screen.getByTestId("acc-levir");
    expect(within(levir).getAllByTestId("ci-bar")).toHaveLength(4);           // BIT and naive, F1 and IoU (the published row has no interval)
    expect(within(levir).getByLabelText(/BIT F1: 0\.90, 95% interval 0\.89 to 0\.91/)).toBeInTheDocument();
  });

  it("labels the bar with its numbers and puts the dot at its value on the 0..1 axis", async () => {
    const { default: CIBar } = await import("../components/accuracy/CIBar");
    const { container } = render(<CIBar value={0.5} ci95={[0.25, 0.75]} label="X" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-label", "X: 0.50, 95% interval 0.25 to 0.75, on a scale from 0 to 1");
    const circle = container.querySelector("circle")!;
    expect(Number(circle.getAttribute("cx"))).toBeCloseTo(56, 5);            // the middle of a 112 px bar
  });
});

describe("Accuracy: headline results", () => {
  it("derives every tile from the results data (change the data, the tile changes)", async () => {
    const d = real();
    d.m8_experiments.results.m8_hysteresis.bolivia_heldout.flood_only.iou = 0.123;
    d.m8_experiments.results.naive_per_chip_otsu.bolivia_heldout.flood_only.iou = 0.045;
    d.oscd.methods.learned.f1.value = 0.4321;
    d.oscd.methods.spectral.f1.value = 0.2111;
    d.levir.bit.f1.value = 0.6789;
    d.false_alarms.scenes.find((s: Json) => s.id === "season-control").kept_per_km2 = 0.77;
    d.false_alarms.scenes.find((s: Json) => s.id === "season-control").raw_per_km2 = 91.5;
    d.m8_india.m8.flood_only.iou = 0.555;
    stubResults(d);
    renderAccuracy();
    const strip = await screen.findByTestId("headline-strip");
    expect(within(strip).getByRole("heading", { name: "Headline results" })).toBeInTheDocument();
    const tiles = within(strip).getAllByTestId("headline-tile");
    expect(tiles.map((t) => t.dataset.key)).toEqual(["radar-unseen", "oscd", "levir", "false-alarms", "assam"]);
    const tile = (k: string) => tiles.find((t) => t.dataset.key === k)!;
    expect(tile("radar-unseen")).toHaveTextContent("0.12");
    expect(tile("radar-unseen")).toHaveTextContent("Naive method: 0.04");
    expect(tile("oscd")).toHaveTextContent("0.43");
    expect(tile("oscd")).toHaveTextContent("Spectral 0.21");
    expect(tile("oscd")).toHaveTextContent("Intervals overlap");
    expect(tile("levir")).toHaveTextContent("0.68");
    expect(tile("false-alarms")).toHaveTextContent("0.77");
    expect(tile("false-alarms")).toHaveTextContent("Filter off: 91.5 per km²");
    expect(tile("false-alarms")).toHaveTextContent("upper bound");
    expect(tile("assam")).toHaveTextContent("0.56");
  });

  it("each tile jumps to the table that holds its numbers", async () => {
    mockStaticFetch();
    renderAccuracy();
    const strip = await screen.findByTestId("headline-strip");
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    for (const tile of within(strip).getAllByTestId("headline-tile")) {
      const id = tile.dataset.anchor!;
      expect(document.getElementById(id), id).not.toBeNull();
      expect(document.getElementById(id)!.querySelector("table")).not.toBeNull();
      fireEvent.click(within(tile).getByRole("button", { name: /Jump to the/ }));
      expect(scrollIntoView).toHaveBeenLastCalledWith(expect.objectContaining({ block: "start" }));
      expect(document.getElementById(id)).toHaveFocus();
    }
    expect(scrollIntoView).toHaveBeenCalledTimes(5);
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");        // jsdom has none: remove the stub again
  });

  it("leaves out a tile whose data is missing, and hides the strip when nothing is left", async () => {
    const d = real();
    delete d.levir;
    delete d.m8_india;
    stubResults(d);
    renderAccuracy();
    const strip = await screen.findByTestId("headline-strip");
    expect(within(strip).getAllByTestId("headline-tile").map((t) => t.dataset.key)).toEqual(["radar-unseen", "oscd", "false-alarms"]);
    cleanup();
    stubResults({ not_measured: ["a thing"] });
    renderAccuracy();
    await screen.findByTestId("acc-not-measured");
    expect(screen.queryByTestId("headline-strip")).toBeNull();
  });
});

describe("Accuracy: missing blocks, loading, error", () => {
  it("hides blocks the results file does not have, instead of showing empty cards", async () => {
    const d = real();
    delete d.oscd;
    delete d.levir;
    delete d.ablation;
    delete d.m8_change;
    delete d.not_measured;
    stubResults(d);
    renderAccuracy();
    await screen.findByTestId("acc-m8");
    for (const id of ["acc-oscd", "acc-oscd-locations", "acc-learned-fa", "acc-levir", "acc-ablation", "acc-radar-events", "acc-not-measured", "acc-composites"]) {
      expect(screen.queryByTestId(id), id).toBeNull();
    }
    expect(screen.getByTestId("acc-india")).toBeInTheDocument();
    expect(screen.getByTestId("acc-false-alarms")).toBeInTheDocument();
  });

  it("shows 'nothing outstanding' only when the file has an explicit empty list", async () => {
    const d = real();
    d.not_measured = [];
    stubResults(d);
    renderAccuracy();
    expect(await screen.findByTestId("acc-not-measured")).toHaveTextContent("Nothing outstanding");
  });

  it("shows the seed study card only when the file has a variant study", async () => {
    const d = real();
    d.oscd.variant_study = { split: "validation locations only", seeds: [0, 1, 2], note: "validation only; shipped model untouched",
      variants: { cap10: { pos_weight_cap: 10, summary: { pipeline_f1: { mean: 0.31, sd: 0.02, n: 3 }, pipeline_precision: { mean: 0.5, sd: 0.04, n: 3 },
        pipeline_recall: { mean: 0.25, sd: 0.03, n: 3 }, farmland_polygons_per_km2: null } } } };
    stubResults(d);
    renderAccuracy();
    const card = await screen.findByTestId("acc-variant-study");
    expect(card).toHaveTextContent("0.31 ± 0.02");
    expect(card).toHaveTextContent("validation only; shipped model untouched");
    cleanup();
    mockStaticFetch();
    renderAccuracy();
    await screen.findByTestId("acc-oscd");
    expect(screen.queryByTestId("acc-variant-study")).toBeNull();
  });

  it("shows the composites / persistence block, with the change in changed area, when present", async () => {
    const d = real();
    const v = (raw: number, kept: number, ha: number, per: number) => ({ raw_detections: raw, after_filter: kept, changed_ha: ha, detections_per_km2: per });
    d.composites = { areas: {
      "season-control (Saswad farmland)": { note: "different seasons on purpose", variants: { single: v(3451, 11, 1.9, 0.31), persistence2: v(3451, 8, 1.5, 0.23) } },
      "pune-hinjewadi (real construction)": { note: "real construction", variants: { single: v(6830, 475, 141.7, 8.35), composite3: v(7051, 438, 125.2, 7.7), persistence2: v(6830, 435, 121.1, 7.65) } },
    } };
    stubResults(d);
    renderAccuracy();
    const card = await screen.findByTestId("acc-composites");
    expect(card).toHaveTextContent("Persistence (2 images)");
    expect(card).toHaveTextContent("-15%");                                  // Pune: 141.7 -> 121.1 ha changed
    expect(card).toHaveTextContent("one test area each");
    const order = ["acc-levir", "acc-composites", "acc-not-measured"].map((id) => screen.getByTestId(id));
    expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows skeleton rows while loading", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => undefined)));
    renderAccuracy();
    expect(screen.getByTestId("acc-loading")).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThanOrEqual(10);
    expect(screen.queryByTestId("acc-m8")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();    // the page is never blank
  });

  it("shows an error state with a working retry", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("boom", { status: 500, statusText: "Server Error" }))
      .mockResolvedValue(new Response(JSON.stringify(real()), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    renderAccuracy();
    const err = await screen.findByTestId("error-state");
    expect(err).toHaveTextContent("Could not load the measured results");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByTestId("acc-m8")).toBeInTheDocument());
    expect(screen.queryByTestId("error-state")).toBeNull();
  });
});

describe("Accuracy: season-control wording", () => {
  it("presents the farmland false-alarm number as an upper bound, never as 'nothing changed'", async () => {
    mockStaticFetch();
    renderAccuracy();
    await screen.findByTestId("acc-false-alarms");
    const notes = screen.getAllByTestId("season-control-note");
    expect(notes).toHaveLength(2);                                            // under the false-alarm table and the spectral-vs-learned table
    for (const n of notes) {
      expect(n).toHaveTextContent("0.62 per km²");
      expect(n).toHaveTextContent("upper bound");
      expect(n).toHaveTextContent("a scene with no large new buildings; remaining detections may include real small changes such as road works");
    }
    const learned = screen.getByTestId("acc-learned-fa");
    expect(learned).toHaveTextContent("no large new buildings (farmland)");
    expect(learned).not.toHaveTextContent("no real change (farmland)");
  });
});
