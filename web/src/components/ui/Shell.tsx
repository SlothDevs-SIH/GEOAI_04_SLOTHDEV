import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useUi } from "../../store/ui";
import { ErrorState } from "./Primitives";

/** G-01 / A-13: slides in when the browser is offline. The demo scenes still work from the cache. */
export function OfflineBadge() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  if (online) return null;
  return (
    <span className="slide-down rounded-xs bg-badge-offline-bg px-2 py-0.5 text-micro text-badge-offline-fg" data-testid="offline-badge" role="status">
      Offline · demo data
    </span>
  );
}

/** N-05 */
export function ThemeToggle() {
  const { resolved, setTheme } = useUi();
  const next = resolved === "dark" ? "light" : "dark";
  return (
    <button type="button" data-testid="theme-toggle" onClick={() => setTheme(next)} aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`} className="press tap rounded-sm border border-line text-fg hover:bg-surface-hover">
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        {resolved === "dark"
          ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>
          : <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />}
      </svg>
    </button>
  );
}

/** G-02: auto-dismissing toast (3 s). */
export function Toast() {
  const { toastMessage, toastVisible, hideToast } = useUi();
  if (!toastVisible || !toastMessage) return null;
  return (
    <div role="status" aria-live="polite" data-testid="toast" onClick={hideToast}
      className="slide-down fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-md border border-line-strong bg-surface-alt px-s18 py-s12 text-small text-fg shadow-modal lg:bottom-6">
      {toastMessage}
    </div>
  );
}

/** G-09 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  componentDidCatch(e: Error, info: ErrorInfo) { console.error(e, info.componentStack); }
  render() {
    return this.state.error
      ? <div data-testid="error-boundary"><ErrorState message={this.state.error} onRetry={() => this.setState({ error: null })} /></div>
      : this.props.children;
  }
}

const NAV: [string, string, string][] = [
  ["/", "Scenes", "M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"],
  ["/analyse", "Analyse", "M4 4h16v16H4zM4 12h16M12 4v16"],
  ["/accuracy", "Accuracy", "M4 20V10M10 20V4M16 20v-8M22 20H2"],
  ["/about", "About", "M12 2a10 10 0 1 0 0.01 0zM12 11v6M12 7.5v.5"],
];

/** N-03 header (+ desktop nav) */
export function AppHeader() {
  return (
    <header data-testid="app-header" className="sticky top-0 z-30 flex items-center gap-x-6 border-b border-line bg-surface/95 px-s18 py-s8 backdrop-blur">
      <NavLink to="/" className="flex min-h-[48px] items-center gap-2 text-h3 text-fg no-underline">
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="var(--c-accent)" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></svg>
        <span>GEOAI 04<span className="hidden text-muted sm:inline"> · Change that matters</span></span>
      </NavLink>
      <nav className="ml-2 hidden gap-1 md:flex" aria-label="Main">
        {NAV.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === "/"}
            className={({ isActive }) => `press tap rounded-sm px-s12 text-small no-underline ${isActive ? "bg-accent-soft text-accent" : "text-secondary hover:text-fg"}`}>{label}</NavLink>
        ))}
      </nav>
      <span className="ml-auto flex items-center gap-2">
        <OfflineBadge />
        <span className="hidden rounded-xs border border-line px-2 py-0.5 text-micro text-muted sm:inline">Team Slothdevs</span>
        <ThemeToggle />
      </span>
    </header>
  );
}

/** N-02 mobile bottom tab bar */
export function TabBar() {
  return (
    <nav data-testid="tab-bar" aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-line bg-surface md:hidden">
      {NAV.map(([to, label, d]) => (
        <NavLink key={to} to={to} end={to === "/"} data-testid={`tab-${label.toLowerCase()}`}
          className={({ isActive }) => `press flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-micro no-underline ${isActive ? "text-accent" : "text-muted"}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><path d={d} /></svg>
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Page frame: header, A-17 route cross-fade (150 ms), mobile tab bar, toast. */
export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen bg-bg text-fg">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-sm focus:bg-accent focus:px-3 focus:py-2 focus:text-on-accent">Skip to content</a>
      <AppHeader />
      <main id="main" key={pathname} className="fade-150 pb-20 md:pb-0">
        <ErrorBoundary>{children}</ErrorBoundary>
      </main>
      <TabBar />
      <Toast />
    </div>
  );
}
