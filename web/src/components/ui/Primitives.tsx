import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

/** L-07: titled card; `collapsible` adds the A-11 accordion. */
export function CardSection({ title, children, testid, collapsible = false, defaultOpen = true, className = "" }: {
  title?: string; children: ReactNode; testid?: string; collapsible?: boolean; defaultOpen?: boolean; className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section data-testid={testid} className={`rounded-md border border-line bg-surface p-s18 shadow-card ${className}`}>
      {title && (collapsible ? (
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}
          className="press flex min-h-[48px] w-full items-center justify-between text-left text-micro uppercase tracking-wider text-muted">
          <span>{title}</span>
          <svg className="chevron" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
        </button>
      ) : (
        <h2 className="mb-s8 text-micro uppercase tracking-wider text-muted">{title}</h2>
      ))}
      {collapsible ? <div className="accordion" data-open={open}><div>{children}</div></div> : children}
    </section>
  );
}

const STATUS: Record<string, string> = {
  "Used now": "text-status-used border-status-used/50 bg-success-soft",
  "In progress": "text-status-progress border-status-progress/50 bg-warning-soft",
  Planned: "text-status-planned border-status-planned/50 bg-badge-demo-bg",
};
/** B-03 */
export function StatusChip({ status }: { status: string }) {
  return <span data-testid="status-chip" className={`inline-block whitespace-nowrap rounded-xs border px-1.5 py-0.5 text-micro ${STATUS[status] ?? STATUS.Planned}`}>{status}</span>;
}

/** S-04: Demo data / Live analysis / Offline demo data. */
export function DemoBadge({ kind = "demo" }: { kind?: "demo" | "live" | "offline" }) {
  const cfg = {
    demo: ["Demo data (precomputed)", "text-badge-demo-fg bg-badge-demo-bg"],
    live: ["Live analysis", "text-badge-live-fg bg-badge-live-bg"],
    offline: ["Offline · demo data", "text-badge-offline-fg bg-badge-offline-bg"],
  }[kind];
  return <span data-testid="demo-badge" data-kind={kind} className={`inline-block rounded-xs px-2 py-0.5 text-micro ${cfg[1]}`}>{cfg[0]}</span>;
}

const ALERT: Record<string, string> = {
  error: "border-danger bg-danger-soft text-fg",
  warning: "border-warning bg-warning-soft text-fg",
  info: "border-info bg-info-soft text-fg",
  success: "border-success bg-success-soft text-fg",
};
const ALERT_ICON: Record<string, string> = { error: "✕", warning: "!", info: "i", success: "✓" };
/** A-14c */
export function InlineAlert({ variant = "info", message, children }: { variant?: "error" | "warning" | "info" | "success"; message?: ReactNode; children?: ReactNode }) {
  return (
    <div role={variant === "error" ? "alert" : "status"} data-testid={`alert-${variant}`} className={`flex gap-s8 rounded-sm border px-s12 py-s8 text-body ${ALERT[variant]}`}>
      <b aria-hidden="true" className="w-4 text-center">{ALERT_ICON[variant]}</b>
      <div className="min-w-0">{message}{children}</div>
    </div>
  );
}

/** A-12c */
export function Button({ variant = "primary", loading = false, className = "", children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger"; loading?: boolean }) {
  const v = {
    primary: "bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-pressed border-transparent",
    secondary: "bg-surface-alt text-fg border-line-strong hover:bg-surface-hover",
    ghost: "bg-transparent text-accent border-line hover:bg-accent-soft",
    danger: "bg-danger-soft text-fg border-danger hover:bg-danger-soft",
  }[variant];
  return (
    <button type="button" {...rest} disabled={rest.disabled || loading} aria-busy={loading || undefined}
      className={`press tap rounded-sm border px-s18 text-small font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${v} ${className}`}>
      {loading && <span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />}
      {children}
    </button>
  );
}

/** G-03 */
export function Skeleton({ width = "100%", height = 16, radius, className = "" }: { width?: number | string; height?: number | string; radius?: number; className?: string }) {
  return <div data-testid="skeleton" aria-hidden="true" className={`skeleton ${className}`} style={{ width, height, borderRadius: radius }} />;
}

/** G-04 */
export function EmptyState({ title, body, actionLabel, onAction }: { title: string; body?: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div data-testid="empty-state" className="flex flex-col items-center gap-s8 p-s26 text-center">
      <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true" className="text-muted"><path d="M3 7l9-4 9 4-9 4zM3 12l9 4 9-4M3 17l9 4 9-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      <h2 className="text-h3">{title}</h2>
      {body && <p className="max-w-md text-secondary">{body}</p>}
      {actionLabel && onAction && <Button variant="secondary" onClick={onAction}>{actionLabel}</Button>}
    </div>
  );
}

/** G-05 */
export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div data-testid="error-state" role="alert" className="flex flex-col items-center gap-s8 p-s26 text-center">
      <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true" className="text-danger"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M12 7v6M12 16.5v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      <h2 className="text-h3">Something went wrong</h2>
      <p className="max-w-md text-secondary">{message}</p>
      {onRetry && <Button variant="secondary" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/** A-04 accessible switch (role=switch, 48 px target). */
export function Switch({ checked, onChange, label, testid, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; testid?: string; disabled?: boolean }) {
  return (
    <label className="flex min-h-[48px] cursor-pointer items-center gap-s8 text-small text-fg">
      <button type="button" role="switch" aria-checked={checked} aria-label={label} data-testid={testid} disabled={disabled}
        onClick={() => onChange(!checked)} className="switch press disabled:opacity-50" />
      <span>{label}</span>
    </label>
  );
}

/** R-22 / A-01c: tab strip with the A-06 sliding underline. */
export function TabSegment<T extends string>({ tabs, active, onChange, counts, testidPrefix = "tab" }: {
  tabs: [T, string][]; active: T; onChange: (t: T) => void; counts?: Partial<Record<T, number>>; testidPrefix?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [bar, setBar] = useState({ x: 0, w: 0 });
  useLayoutEffect(() => {
    const el = refs.current[active];
    if (el) setBar({ x: el.offsetLeft, w: el.offsetWidth });
  }, [active, tabs.length, counts]);
  useEffect(() => {
    const on = () => { const el = refs.current[active]; if (el) setBar({ x: el.offsetLeft, w: el.offsetWidth }); };
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [active]);
  return (
    <div role="tablist" className="thin-scroll relative flex gap-s4 overflow-x-auto border-b border-line">
      {tabs.map(([k, label]) => (
        <button key={k} ref={(el) => { refs.current[k] = el; }} role="tab" type="button" aria-selected={active === k}
          data-testid={`${testidPrefix}-${k}`} onClick={() => onChange(k)}
          className={`press tap whitespace-nowrap px-s12 text-small ${active === k ? "text-accent" : "text-muted hover:text-fg"}`}>
          {label}{counts?.[k] != null && <span className="ml-1 text-tiny text-muted">({counts[k]})</span>}
        </button>
      ))}
      <span aria-hidden="true" className="tab-underline absolute bottom-0 left-0 h-0.5 bg-accent" style={{ width: bar.w, transform: `translateX(${bar.x}px)` }} />
    </div>
  );
}

/** L-05 / L-06: horizontal scroller with a fading right edge and a thin scrollbar. */
export function Scroller({ children, testid = "table-scroller" }: { children: ReactNode; testid?: string }) {
  return (
    <div className="relative">
      <div tabIndex={0} data-testid={testid} className="thin-scroll overflow-x-auto" role="region" aria-label="Scrollable table">{children}</div>
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-6" style={{ background: "linear-gradient(90deg, transparent, var(--c-surface))" }} />
    </div>
  );
}
