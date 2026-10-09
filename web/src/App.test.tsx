import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfflineBadge } from "./App";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("offline badge", () => {
  it("is hidden while online", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    render(<OfflineBadge />);
    expect(screen.queryByTestId("offline-badge")).not.toBeInTheDocument();
  });

  it("appears when the browser goes offline and disappears when it comes back", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    render(<OfflineBadge />);
    act(() => { window.dispatchEvent(new Event("offline")); });
    expect(screen.getByTestId("offline-badge")).toHaveTextContent("Offline · demo data");
    act(() => { window.dispatchEvent(new Event("online")); });
    expect(screen.queryByTestId("offline-badge")).not.toBeInTheDocument();
  });

  it("is shown right away when the page is opened offline", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    render(<OfflineBadge />);
    expect(screen.getByTestId("offline-badge")).toBeInTheDocument();
  });
});
