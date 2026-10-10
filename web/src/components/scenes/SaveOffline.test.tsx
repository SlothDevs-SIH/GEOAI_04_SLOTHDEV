import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SaveOffline from "./SaveOffline";

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ files: [{ path: "a" }, { path: "b" }] }))));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("SaveOffline", () => {
  it("shows progress in a live region, then the saved state", async () => {
    vi.stubGlobal("caches", { open: async () => ({ add: async () => undefined }) });
    render(<SaveOffline ids={["s"]} />);
    expect(screen.getByTestId("save-offline-status")).toHaveAttribute("aria-live", "polite");
    fireEvent.click(screen.getByTestId("save-offline"));
    await waitFor(() => expect(screen.getByTestId("save-offline")).toHaveTextContent("Saved for offline"));
    expect(screen.getByTestId("save-offline-status")).toHaveTextContent("Saved on this device for now");
    expect(screen.getByTestId("save-offline")).toBeDisabled();
  });
  it("shows a plain message and a retry when the device is full", async () => {
    vi.stubGlobal("caches", { open: async () => ({ add: async () => { throw Object.assign(new Error("q"), { name: "QuotaExceededError" }); } }) });
    render(<SaveOffline ids={["s"]} />);
    fireEvent.click(screen.getByTestId("save-offline"));
    await waitFor(() => expect(screen.getByTestId("save-offline-status")).toHaveTextContent(/Not enough storage/));
    expect(screen.getByTestId("save-offline")).toHaveTextContent("Try saving again");
  });
  it("starts as saved when the scene was saved before", () => {
    localStorage.setItem("geoai04.saved.v1", JSON.stringify(["s"]));
    render(<SaveOffline ids={["s"]} />);
    expect(screen.getByTestId("save-offline")).toHaveTextContent("Saved for offline");
  });
});
