import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUi } from "../../store/ui";
import { Button, CardSection, DemoBadge, EmptyState, ErrorState, InlineAlert, StatusChip, Switch, TabSegment } from "./Primitives";
import { TierChip } from "./Shapes";
import { ErrorBoundary, Layout, ThemeToggle } from "./Shell";

afterEach(cleanup);

describe("TierChip", () => {
  it("shows the word and a glyph, so colour is never the only signal", () => {
    const { container } = render(<TierChip tier="critical" />);
    expect(screen.getByTestId("tier-chip")).toHaveTextContent("Critical");
    expect(container.querySelector("svg")).not.toBeNull();
  });
});

describe("primitives", () => {
  it("StatusChip shows the status text", () => {
    render(<StatusChip status="In progress" />);
    expect(screen.getByTestId("status-chip")).toHaveTextContent("In progress");
  });
  it("DemoBadge distinguishes demo, live and offline", () => {
    const { rerender } = render(<DemoBadge />);
    expect(screen.getByTestId("demo-badge")).toHaveTextContent("Demo data (precomputed)");
    rerender(<DemoBadge kind="live" />);
    expect(screen.getByTestId("demo-badge")).toHaveTextContent("Live analysis");
    rerender(<DemoBadge kind="offline" />);
    expect(screen.getByTestId("demo-badge")).toHaveTextContent("Offline");
  });
  it("Switch is a labelled role=switch that toggles", () => {
    const on = vi.fn();
    render(<Switch checked={false} onChange={on} label="False-alarm filter" />);
    const sw = screen.getByRole("switch", { name: "False-alarm filter" });
    expect(sw).toHaveAttribute("aria-checked", "false");
    fireEvent.click(sw);
    expect(on).toHaveBeenCalledWith(true);
  });
  it("Button is disabled and busy while loading", () => {
    render(<Button loading>Go</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
  });
  it("TabSegment reports the chosen tab and marks it selected", () => {
    const on = vi.fn();
    render(<TabSegment tabs={[["a", "All"], ["b", "Review"]]} active="a" onChange={on} counts={{ a: 3 }} />);
    expect(screen.getByRole("tab", { name: /All/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: /Review/ }));
    expect(on).toHaveBeenCalledWith("b");
  });
  it("CardSection collapses and expands", () => {
    render(<CardSection title="Extra" collapsible defaultOpen={false}>body</CardSection>);
    const btn = screen.getByRole("button", { name: /Extra/ });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });
  it("EmptyState, ErrorState and InlineAlert render their messages; ErrorState offers a retry", () => {
    const retry = vi.fn();
    render(<><EmptyState title="Nothing here" /><ErrorState message="boom" onRetry={retry} /><InlineAlert variant="warning" message="careful" /></>);
    expect(screen.getByTestId("empty-state")).toHaveTextContent("Nothing here");
    expect(screen.getByRole("alert")).toHaveTextContent("boom");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
    expect(screen.getByTestId("alert-warning")).toHaveTextContent("careful");
  });
});

describe("shell", () => {
  it("ThemeToggle flips the theme", () => {
    useUi.getState().setTheme("dark");
    render(<ThemeToggle />);
    fireEvent.click(screen.getByTestId("theme-toggle"));
    expect(document.documentElement.dataset.theme).toBe("light");
    useUi.getState().setTheme("dark");
  });
  it("Layout has the header, the four-item nav and a skip link, and shows toasts", () => {
    render(<MemoryRouter><Layout><p>page</p></Layout></MemoryRouter>);
    expect(screen.getByTestId("app-header")).toBeInTheDocument();
    for (const name of ["Scenes", "Analyse", "Accuracy", "About"]) expect(screen.getAllByRole("link", { name }).length).toBeGreaterThan(0);
    expect(screen.getByText("Skip to content")).toBeInTheDocument();
    act(() => useUi.getState().showToast("Copied"));
    expect(screen.getByTestId("toast")).toHaveTextContent("Copied");
  });
  it("ErrorBoundary shows an ErrorState instead of a blank screen", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const Bomb = () => { throw new Error("kaboom"); };
    render(<ErrorBoundary><Bomb /></ErrorBoundary>);
    expect(screen.getByTestId("error-boundary")).toHaveTextContent("kaboom");
    vi.restoreAllMocks();
  });
});
