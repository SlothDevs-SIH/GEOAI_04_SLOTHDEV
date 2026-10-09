import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "../../test/fixtures/sens_fixture.json";
import SensitivityLab from "./SensitivityLab";

const bin = Uint8Array.from(atob(fixture.data_base64), (c) => c.charCodeAt(0));
const info = {
  width: fixture.width, height: fixture.height, pixel_m: 10, default_threshold: fixture.default_threshold,
  default_min_area_px: 3, min_area_m2: 300, keep_codes: fixture.cases[0].keep_codes, type_names: {},
  server_after_filter: fixture.server_after_filter,
};

function serve(files: Record<string, () => Response>) {
  vi.stubGlobal("fetch", vi.fn(async (u: RequestInfo | URL) => {
    const f = files[String(u)];
    return f ? f() : new Response("not found", { status: 404 });
  }));
}

beforeEach(() => {
  serve({
    "scene/sens.json": () => new Response(JSON.stringify(info)),
    "scene/sens.bin": () => new Response(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength) as ArrayBuffer),
  });
});
afterEach(cleanup);

describe("Sensitivity lab", () => {
  it("starts at the server settings and shows the server count", async () => {
    render(<SensitivityLab base="scene" />);
    expect(await screen.findByTestId("lab-count")).toHaveTextContent(`${fixture.server_after_filter} changes`);
    expect(screen.getByTestId("lab-reset")).toBeDisabled();
  });

  it("changes the count as the sliders move, and resets", async () => {
    render(<SensitivityLab base="scene" />);
    const count = await screen.findByTestId("lab-count");
    fireEvent.change(screen.getByTestId("lab-threshold"), { target: { value: "0.9" } });
    await waitFor(() => expect(count).toHaveTextContent("2 changes"));            // python: threshold 0.9, min 3 px -> 2
    fireEvent.change(screen.getByTestId("lab-threshold"), { target: { value: String(fixture.default_threshold) } });
    fireEvent.change(screen.getByTestId("lab-minarea"), { target: { value: "5000" } });
    await waitFor(() => expect(count).toHaveTextContent("2 changes"));            // the 9-pixel speck is dropped, the blocks stay
    expect(screen.getByTestId("lab-reset")).not.toBeDisabled();
    fireEvent.click(screen.getByTestId("lab-reset"));
    await waitFor(() => expect(count).toHaveTextContent(`${fixture.server_after_filter} changes`));
  });

  it("shows nothing for a scene that has no slider data", async () => {
    serve({});
    const { container } = render(<SensitivityLab base="scene" />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing when the data file has the wrong size", async () => {
    serve({ "scene/sens.json": () => new Response(JSON.stringify(info)), "scene/sens.bin": () => new Response(new Uint8Array(10)) });
    const { container } = render(<SensitivityLab base="scene" />);
    await new Promise((r) => setTimeout(r, 50));
    expect(container).toBeEmptyDOMElement();
  });
});
