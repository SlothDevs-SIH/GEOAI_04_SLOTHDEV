import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import About from "./About";

afterEach(cleanup);

describe("About: tech stack", () => {
  it("shows every layer with an honest status, and the architecture diagram", () => {
    render(<MemoryRouter><About /></MemoryRouter>);
    const card = screen.getByTestId("tech-stack");
    for (const word of ["React 19", "MapLibre", "FastAPI", "Rasterio", "PyTorch", "ONNX Runtime", "Sentinel-1", "Vercel"]) {
      expect(card).toHaveTextContent(word);
    }
    expect(screen.getByTestId("architecture-diagram")).toHaveAttribute("src", expect.stringContaining("architecture.png"));
    expect(screen.getByTestId("architecture-diagram")).toHaveAttribute("alt", expect.stringContaining("System architecture"));
  });

  it("never shows an unfinished item as shipped", () => {
    render(<MemoryRouter><About /></MemoryRouter>);
    const rows = within(screen.getByTestId("tech-stack")).getAllByRole("row");
    const statusOf = (word: string) => {
      const row = rows.find((r) => r.textContent?.includes(word));
      expect(row, word).toBeDefined();
      return row!.textContent ?? "";
    };
    expect(statusOf("PyTorch")).toContain("In progress");
    expect(statusOf("PyTorch")).not.toContain("Used now");
    expect(statusOf("BIT Siamese")).toContain("Planned");
    expect(statusOf("Vercel")).toContain("Planned");
    expect(statusOf("MapLibre")).toContain("Used now");
  });
});
