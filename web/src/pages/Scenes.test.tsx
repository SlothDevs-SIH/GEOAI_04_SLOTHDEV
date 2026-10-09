import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mockStaticFetch } from "../test/staticFetch";
import type { SceneMeta } from "../lib/types";
import Scenes from "./Scenes";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const scene = (o: Partial<SceneMeta> & { id: string }): SceneMeta => ({
  name: o.id, place: "", event: "An event", kind: "encroachment", mode: "spectral", before_date: "2019-01-13", after_date: "2024-12-17",
  before_label: "", after_label: "", source: "", demo: true, ...o,
});
const FIXTURE: SceneMeta[] = [
  scene({ id: "a", name: "Alpha build-out", kind: "encroachment", raw_detections: 2185, after_filter: 265, event: "Large construction project",
    ...({ variants: [{ mode: "learned" }, { mode: "hybrid" }] } as object) }),
  scene({ id: "b", name: "Beta flood", kind: "flood", before_date: "2016-08-12", after_date: "2016-08-12", raw_detections: 3490, after_filter: 37 }),
  scene({ id: "c", name: "Gamma control", kind: "control", event: "False-alarm test: farmland with no large new buildings" }),
  scene({ id: "d", name: "Delta regional", kind: "regional" }),
];

const stubIndex = (body: unknown, status = 200) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
const renderScenes = () => render(<MemoryRouter><Scenes /></MemoryRouter>);

describe("Scenes: populated", () => {
  it("renders one card per scene from the fixture, each a link to its scene, plus the Try your own card", async () => {
    stubIndex(FIXTURE);
    renderScenes();
    const cards = await screen.findAllByTestId("scene-card");
    expect(cards).toHaveLength(4);
    expect(cards[0]).toHaveAttribute("href", "/scene/a");
    expect(cards[0].tagName).toBe("A");                                  // keyboard focusable link
    expect(screen.getByTestId("scene-grid")).toBeInTheDocument();
    const analyse = screen.getByTestId("analyse-card");
    expect(analyse).toHaveAttribute("href", "/analyse");
    expect(analyse).toHaveTextContent("Try your own");
    expect(analyse.className).toContain("border-dashed");
  });

  it("shows kind chip, dates, raw -> real counts (en-IN) and the demo badge", async () => {
    stubIndex(FIXTURE);
    renderScenes();
    const [alpha, beta, gamma, delta] = await screen.findAllByTestId("scene-card");
    expect(within(alpha).getByTestId("kind-chip")).toHaveTextContent("Encroachment");
    expect(within(beta).getByTestId("kind-chip")).toHaveTextContent("Flood · radar");
    expect(within(gamma).getByTestId("kind-chip")).toHaveTextContent("False-alarm control");
    expect(within(delta).getByTestId("kind-chip")).toHaveTextContent("Regional check");
    expect(alpha).toHaveTextContent("2019-01-13 → 2024-12-17");
    expect(beta).toHaveTextContent("2016-08-12");                          // same-day pair shows one date
    expect(beta).not.toHaveTextContent("2016-08-12 → 2016-08-12");
    expect(within(alpha).getByTestId("scene-counts")).toHaveTextContent("2,185 raw → 265 real");
    expect(within(beta).getByTestId("scene-counts")).toHaveTextContent("3,490 raw → 37 real");
    expect(within(gamma).queryByTestId("scene-counts")).toBeNull();        // no counts in the data: nothing invented
    expect(within(alpha).getByTestId("demo-badge")).toHaveTextContent("Demo data (precomputed)");
  });

  it("shows the '3 detectors' chip only on scenes with precomputed variants", async () => {
    stubIndex(FIXTURE);
    renderScenes();
    const [alpha, beta] = await screen.findAllByTestId("scene-card");
    expect(within(alpha).getByTestId("detectors-chip")).toHaveTextContent("3 detectors");
    expect(within(beta).queryByTestId("detectors-chip")).toBeNull();
  });

  it("shows the season-control event text from the data (no 'only crops changed' claim)", async () => {
    stubIndex(FIXTURE);
    renderScenes();
    const gamma = (await screen.findAllByTestId("scene-card"))[2];
    expect(gamma).toHaveTextContent("farmland with no large new buildings");
    expect(gamma).not.toHaveTextContent("only crops changed");
  });

  it("has the hero copy and the team footer", async () => {
    stubIndex(FIXTURE);
    renderScenes();
    expect(screen.getByTestId("hero")).toHaveTextContent("See what really changed, not every pixel that moved.");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("See what really changed");
    await screen.findAllByTestId("scene-card");
    expect(screen.getByText("Team Slothdevs")).toBeInTheDocument();
  });

  it("staggers the entrance of the first 12 cards only (A-01)", async () => {
    stubIndex(Array.from({ length: 14 }, (_, i) => scene({ id: `s${i}`, name: `Scene ${i}` })));
    renderScenes();
    const cards = await screen.findAllByTestId("scene-card");
    expect(cards).toHaveLength(14);
    expect(cards[0].className).toContain("anim-in");
    expect(cards[3].style.getPropertyValue("--i")).toBe("3");
    expect(cards[11].className).toContain("anim-in");
    expect(cards[12].className).not.toContain("anim-in");
    expect(cards[13].className).not.toContain("anim-in");
  });

  it("works with the real bundled demo index: nine scenes, the hybrid ones marked", async () => {
    mockStaticFetch();
    renderScenes();
    await waitFor(() => expect(screen.getAllByTestId("scene-card")).toHaveLength(9));
    expect(screen.getAllByTestId("detectors-chip")).toHaveLength(5);
    expect(screen.getByTestId("analyse-card")).toBeInTheDocument();
  });
});

describe("Scenes: loading, empty, error", () => {
  it("shows 8 skeleton cards while loading, then replaces them", async () => {
    let release: (r: Response) => void = () => undefined;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((res) => { release = res; })));
    renderScenes();
    expect(screen.getAllByTestId("scene-skeleton")).toHaveLength(8);
    expect(screen.getByTestId("scene-grid-loading")).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByTestId("scene-card")).toBeNull();
    release(new Response(JSON.stringify(FIXTURE), { status: 200 }));
    await screen.findAllByTestId("scene-card");
    expect(screen.queryByTestId("scene-skeleton")).toBeNull();
  });

  it("shows 'No scenes found.' for an empty list, still offering Try your own", async () => {
    stubIndex([]);
    renderScenes();
    const empty = await screen.findByTestId("empty-state");
    expect(empty).toHaveTextContent("No scenes found.");
    expect(screen.queryByTestId("scene-card")).toBeNull();
    expect(screen.getByTestId("analyse-card")).toBeInTheDocument();
  });

  it("shows an error with Try again, and retrying loads the scenes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("nope", { status: 500, statusText: "Server Error" }))
      .mockResolvedValue(new Response(JSON.stringify(FIXTURE), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    renderScenes();
    const err = await screen.findByTestId("error-state");
    expect(err).toHaveTextContent("Could not load the demo scenes");
    expect(err).toHaveTextContent("500");
    expect(screen.queryByTestId("scene-card")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getAllByTestId("scene-card")).toHaveLength(4));
    expect(screen.queryByTestId("error-state")).toBeNull();
  });
});
