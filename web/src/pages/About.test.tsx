import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import About from "./About";

afterEach(cleanup);

const renderAbout = () => render(<MemoryRouter><About /></MemoryRouter>);
const rowOf = (layer: string) => {
  const rows = within(screen.getByTestId("tech-stack")).getAllByRole("row");
  const row = rows.find((r) => within(r).queryByRole("rowheader")?.textContent === layer);
  expect(row, layer).toBeDefined();
  return row!;
};

describe("About: how it works", () => {
  it("shows the four numbered steps", () => {
    renderAbout();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("How it works");
    const steps = screen.getAllByTestId("step-card");
    expect(steps).toHaveLength(4);
    ["Align", "Detect", "Filter false alarms", "Explain and rank"].forEach((t, i) => expect(steps[i]).toHaveTextContent(t));
  });
});

describe("About: tech stack", () => {
  it("shows every layer with an honest status, and the architecture diagram", () => {
    renderAbout();
    const card = screen.getByTestId("tech-stack");
    for (const word of ["React 19", "MapLibre", "FastAPI", "Rasterio", "PyTorch", "ONNX Runtime", "Sentinel-1", "Vercel", "Workbox", "engine/detectors.py"]) {
      expect(card).toHaveTextContent(word);
    }
    expect(screen.getByTestId("architecture-diagram")).toHaveAttribute("src", expect.stringContaining("architecture.png"));
    expect(screen.getByTestId("architecture-diagram")).toHaveAttribute("alt", expect.stringContaining("System architecture"));
  });

  it("reports the verified integration as Used now, with honest qualifiers, and hosting as Planned", () => {
    renderAbout();
    const deep = rowOf("Deep learning");
    expect(deep).toHaveTextContent("Used now");
    expect(deep).toHaveTextContent("ONNX Runtime in the live API");
    expect(deep).toHaveTextContent("Spectral mode stays the default");
    const hires = rowOf("High-res mode");
    expect(hires).toHaveTextContent("Used now");
    expect(hires).toHaveTextContent("not in the default container");     // the qualifier must stay next to the status
    expect(rowOf("Detector registry")).toHaveTextContent("Used now");
    expect(rowOf("Offline PWA")).toHaveTextContent("Used now");
    expect(rowOf("Hosting")).toHaveTextContent("Planned");
    expect(rowOf("Hosting")).not.toHaveTextContent("Used now");
    expect(rowOf("Web app")).toHaveTextContent("Used now");
  });

  it("every row carries exactly one status chip with a known word", () => {
    renderAbout();
    const rows = within(screen.getByTestId("tech-stack")).getAllByRole("row").slice(1);  // skip the header row
    expect(rows.length).toBeGreaterThanOrEqual(10);
    for (const r of rows) {
      const chips = within(r).getAllByTestId("status-chip");
      expect(chips).toHaveLength(1);
      expect(["Used now", "In progress", "Planned"]).toContain(chips[0].textContent);
    }
  });
});

describe("About: architecture diagram viewer", () => {
  it("opens full screen on click and closes with Esc", () => {
    renderAbout();
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /architecture diagram full screen/i }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByTestId("architecture-zoomed")).toHaveAttribute("src", expect.stringContaining("architecture.png"));
    act(() => { fireEvent.keyDown(document, { key: "Escape" }); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes from the close button and from a click on the scrim, but not from a click on the picture", () => {
    renderAbout();
    const open = () => fireEvent.click(screen.getByRole("button", { name: /architecture diagram full screen/i }));
    open();
    fireEvent.click(screen.getByTestId("architecture-zoomed"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("architecture-close"));
    expect(screen.queryByRole("dialog")).toBeNull();
    open();
    fireEvent.click(screen.getByTestId("architecture-zoomed").parentElement!);          // the scrim around the picture
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("double-click toggles zoom, and the zoom button does the same", () => {
    renderAbout();
    fireEvent.click(screen.getByRole("button", { name: /architecture diagram full screen/i }));
    const img = screen.getByTestId("architecture-zoomed");
    expect(img.style.width).toBe("");
    fireEvent.doubleClick(img);
    expect(img.style.width).toBe("250%");
    fireEvent.click(screen.getByTestId("architecture-zoom"));
    expect(img.style.width).toBe("");
    expect(screen.getByTestId("architecture-zoom")).toHaveAttribute("aria-pressed", "false");
  });

  it("moves focus into the dialog and back to the diagram button afterwards", async () => {
    renderAbout();
    const trigger = screen.getByRole("button", { name: /architecture diagram full screen/i });
    fireEvent.click(trigger);
    expect(screen.getByTestId("architecture-close")).toHaveFocus();
    fireEvent.click(screen.getByTestId("architecture-close"));
    await Promise.resolve();
    expect(trigger).toHaveFocus();
  });
});

describe("About: data, licences and limits", () => {
  it("lists the data sources with their licences, including the restricted ones", () => {
    renderAbout();
    const card = screen.getByTestId("data-licences");
    for (const w of ["Sentinel-2", "Sentinel-1", "WorldCover", "CC-BY 4.0", "JRC", "OpenStreetMap", "ODbL", "OSCD", "Sen1Floods11"]) expect(card).toHaveTextContent(w);
    expect(card).toHaveTextContent("Academic use only");
    expect(card).toHaveTextContent("Google Earth imagery terms");
  });

  it("states the honest limits", () => {
    renderAbout();
    const limits = screen.getByTestId("limits");
    expect(limits).toHaveTextContent("cannot see people");
    expect(limits).toHaveTextContent("where to look");
    expect(limits).toHaveTextContent("Maharashtra");
    expect(limits).toHaveTextContent("six other regions");
    expect(limits).toHaveTextContent("sandbars");
    expect(limits).toHaveTextContent("bare soil");
    expect(limits).toHaveTextContent("open water from one date");
    expect(limits).toHaveTextContent("2016");
  });
});
