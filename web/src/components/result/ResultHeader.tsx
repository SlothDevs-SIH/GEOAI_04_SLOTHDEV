import { Link } from "react-router-dom";
import { DemoBadge } from "../ui/Primitives";

/** R-10: back link, scene name, subtitle / event, and the Demo / Live badge. */
export default function ResultHeader({ name, subtitle, event, kind, backTo = "/", backLabel = "Scenes", action }: {
  action?: React.ReactNode;
  name: string; subtitle?: string; event?: string; kind: "demo" | "live"; backTo?: string; backLabel?: string;
}) {
  return (
    <div data-testid="result-header" className="flex flex-wrap items-start gap-x-s12 gap-y-s8 py-s12">
      <Link to={backTo} aria-label={`Back to ${backLabel.toLowerCase()}`}
        className="press tap -ml-s8 rounded-sm px-s8 text-small text-accent no-underline hover:bg-accent-soft">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="mr-1"><path d="M10 3L5 8l5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {backLabel}
      </Link>
      <div className="min-w-0 flex-1 basis-60">
        <h1 className="text-h2 text-fg sm:text-h1">{name}</h1>
        {(subtitle || event) && <p className="text-body text-secondary">{[subtitle, event].filter(Boolean).join(" · ")}</p>}
      </div>
      <span className="mt-s8"><DemoBadge kind={kind} /></span>
      {action && <div className="mt-s4 w-full sm:w-auto">{action}</div>}
    </div>
  );
}
