import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockStaticFetch } from "../test/staticFetch";

// The live API and the map are replaced: this file tests the page logic of the "any area" flow.
const api = vi.hoisted(() => ({
  fetchPreview: vi.fn(),
  startFetch: vi.fn(),
  getJob: vi.fn(),
  getJobSummary: vi.fn(),
}));
vi.mock("../lib/api", async (orig) => ({
  ...(await orig<typeof import("../lib/api")>()),
  API_URL: "http://api.test",
  apiHealth: async () => true,
  loadJobScene: async () => (await orig<typeof import("../lib/api")>()).loadScene("navi-mumbai-airport"),
  ...api,
}));
vi.mock("../components/map/AreaPicker", () => ({
  default: ({ onChange }: { onChange: (b?: [number, number, number, number]) => void }) => (
    <div data-testid="area-picker">
      <button type="button" onClick={() => onChange([77.1, 28.5, 77.17, 28.56])}>draw good box</button>
      <button type="button" onClick={() => onChange([77, 28, 78, 29])}>draw huge box</button>
    </div>
  ),
}));
vi.mock("../components/map/CompareMap", () => ({ default: () => <div data-testid="compare-map" /> }));
vi.mock("qrcode", () => ({ default: { toDataURL: async () => "data:image/png;base64," } }));

import Analyse from "./Analyse";
import Result from "./Result";

const PICK = {
  bbox: [77.1, 28.5, 77.17, 28.56], size_km: [6.8, 6.6],
  before: { scene: "S2_a", date: "2020-01-18", tile_cloud_pct: 0, aoi_invalid_pct: 0.4, days_from_target: -2 },
  after: { scene: "S2_b", date: "2025-01-22", tile_cloud_pct: 0, aoi_invalid_pct: 31, days_from_target: 2 },
  warnings: ["the after image is 31% cloud or no-data over this box"],
};

beforeEach(() => {
  mockStaticFetch();
  vi.clearAllMocks();
});
afterEach(cleanup);

const page = () => render(<MemoryRouter><Analyse /></MemoryRouter>);

describe("Analyse any area", () => {
  it("shows the area picker first, and the buttons stay off until a good box is drawn", async () => {
    page();
    expect(await screen.findByTestId("area-picker")).toBeInTheDocument();
    expect(screen.getByTestId("check-scenes")).toBeDisabled();
    expect(screen.getByTestId("analyse-area")).toBeDisabled();
    expect(screen.getByTestId("box-problem")).toHaveTextContent("Click two opposite corners");
  });

  it("refuses a box that is too big, in plain words", async () => {
    page();
    fireEvent.click(await screen.findByText("draw huge box"));
    expect(screen.getByTestId("box-problem")).toHaveTextContent(/limit is 15/);
    expect(screen.getByTestId("analyse-area")).toBeDisabled();
  });

  it("previews the scenes that will be used, with their warnings", async () => {
    api.fetchPreview.mockResolvedValue(PICK);
    page();
    fireEvent.click(await screen.findByText("draw good box"));
    expect(screen.getByTestId("box-size")).toHaveTextContent("6.");
    fireEvent.click(screen.getByTestId("check-scenes"));
    const pick = await screen.findByTestId("scene-pick");
    expect(pick).toHaveTextContent("2020-01-18");
    expect(pick).toHaveTextContent("2025-01-22");
    expect(pick).toHaveTextContent("31% cloud or no-data");
    expect(api.fetchPreview).toHaveBeenCalledWith(expect.objectContaining({ bbox: [77.1, 28.5, 77.17, 28.56], preset: "encroachment" }));
  });

  it("sends the false-alarm options only when asked, and never persistence for floods", async () => {
    api.startFetch.mockResolvedValue({ job_id: "opt1" });
    api.getJob.mockResolvedValue({ status: "error", error: "stopped for this test" });   // a finished job re-enables the button
    page();
    fireEvent.click(await screen.findByText("draw good box"));
    fireEvent.click(screen.getByTestId("analyse-area"));
    await waitFor(() => expect(api.startFetch).toHaveBeenCalledTimes(1));
    expect(api.startFetch.mock.calls[0][0]).toMatchObject({ composite: 1, persistence: 0 });
    await screen.findByTestId("job-error", {}, { timeout: 4000 });
    fireEvent.change(screen.getByTestId("composite"), { target: { value: "3" } });
    fireEvent.click(screen.getByTestId("persistence"));
    fireEvent.click(screen.getByTestId("analyse-area"));
    await waitFor(() => expect(api.startFetch).toHaveBeenCalledTimes(2));
    expect(api.startFetch.mock.calls[1][0]).toMatchObject({ composite: 3, persistence: 2, preset: "encroachment" });
    await waitFor(() => expect(screen.getByTestId("analyse-area")).not.toBeDisabled(), { timeout: 4000 });
    fireEvent.change(screen.getByDisplayValue(/Encroachment/), { target: { value: "flood" } });
    expect(screen.getByTestId("persistence")).toBeDisabled();
    fireEvent.click(screen.getByTestId("analyse-area"));
    await waitFor(() => expect(api.startFetch).toHaveBeenCalledTimes(3));
    expect(api.startFetch.mock.calls[2][0]).toMatchObject({ preset: "flood", persistence: 0 });
  });

  it("shows the server message when no scene can be found", async () => {
    api.fetchPreview.mockRejectedValue(new Error("no Sentinel-2 scene covers this box within 20 days"));
    page();
    fireEvent.click(await screen.findByText("draw good box"));
    fireEvent.click(screen.getByTestId("check-scenes"));
    expect(await screen.findByTestId("pick-error")).toHaveTextContent("no Sentinel-2 scene covers");
  });

  it("will not start when the before date is not earlier than the after date", async () => {
    page();
    fireEvent.click(await screen.findByText("draw good box"));
    const [before, after] = Array.from(document.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
    fireEvent.change(before, { target: { value: "2025-02-01" } });
    fireEvent.change(after, { target: { value: "2025-01-01" } });
    expect(screen.getByTestId("analyse-area")).toBeDisabled();
    expect(screen.getByText(/before date must be earlier/)).toBeInTheDocument();
  });

  it("runs the whole flow: start, progress with the scenes used, result, and a link to the swipe map", async () => {
    api.startFetch.mockResolvedValue({ job_id: "abc123" });
    api.getJob.mockResolvedValue({ status: "done", stage: "done", warnings: [], fetch: { before: PICK.before, after: PICK.after } });
    api.getJobSummary.mockResolvedValue({ raw_detections: 2185, after_filter: 265, total_area_m2: 2507000, by_tier: {} });
    page();
    fireEvent.click(await screen.findByText("draw good box"));
    fireEvent.click(screen.getByTestId("analyse-area"));
    expect(await screen.findByTestId("analyse-result", {}, { timeout: 4000 })).toHaveTextContent("265");
    expect(screen.getByTestId("scenes-used")).toHaveTextContent("S2_a");
    expect(screen.getByTestId("open-on-map")).toHaveAttribute("href", "/job/abc123");
  });

  it("shows a failed job reason and stops", async () => {
    api.startFetch.mockResolvedValue({ job_id: "bad1" });
    api.getJob.mockResolvedValue({ status: "error", error: "the best image near 2020-01-20 is 90% cloud" });
    page();
    fireEvent.click(await screen.findByText("draw good box"));
    fireEvent.click(screen.getByTestId("analyse-area"));
    expect(await screen.findByTestId("job-error", {}, { timeout: 4000 })).toHaveTextContent("90% cloud");
    expect(screen.queryByTestId("analyse-result")).not.toBeInTheDocument();
  });

  it("offers a radar upload that needs only one image and explains the limit", async () => {
    page();
    fireEvent.click(await screen.findByTestId("tab-radar"));
    expect(screen.getByTestId("analyse-radar")).toBeDisabled();
    expect(screen.getByText(/open flood water from one date/)).toBeInTheDocument();
  });
});

describe("a finished live job opens like a demo scene", () => {
  it("renders the swipe-map page for /job/:id", async () => {
    render(<MemoryRouter initialEntries={["/job/abc123"]}><Routes><Route path="/job/:id" element={<Result job />} /></Routes></MemoryRouter>);
    expect(await screen.findByTestId("counter")).toHaveTextContent("raw detections");
    await waitFor(() => expect(screen.getByTestId("compare-map")).toBeInTheDocument());
  });
});
