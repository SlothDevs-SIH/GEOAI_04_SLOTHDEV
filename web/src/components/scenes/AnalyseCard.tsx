import type { CSSProperties } from "react";
import { Link } from "react-router-dom";

/** S-03: dashed call-to-action card linking to /analyse. */
export default function AnalyseCard({ index = 0 }: { index?: number }) {
  return (
    <Link to="/analyse" data-testid="analyse-card"
      className={`press lift flex h-full min-h-[220px] flex-col items-center justify-center gap-s8 rounded-md border-2 border-dashed border-line-strong bg-surface p-s18 text-center text-fg no-underline hover:border-accent ${index < 12 ? "anim-in" : ""}`}
      style={{ "--i": index } as CSSProperties}>
      <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-accent">
        <rect x="3" y="3" width="18" height="18" rx="3" /><path d="M12 8v8M8 12h8" />
      </svg>
      <span className="text-h3">Try your own</span>
      <span className="max-w-[16rem] text-small font-normal text-secondary">Draw an area anywhere in India, or upload two GeoTIFFs.</span>
    </Link>
  );
}
