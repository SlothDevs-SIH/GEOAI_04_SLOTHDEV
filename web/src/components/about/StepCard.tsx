import type { CSSProperties } from "react";

/** B-01: one numbered step of "How it works". */
export default function StepCard({ stepNumber, title, body }: { stepNumber: number; title: string; body: string }) {
  return (
    <li data-testid="step-card" style={{ "--i": stepNumber - 1 } as CSSProperties}
      className="anim-in flex gap-s12 rounded-md border border-line bg-surface p-s18 shadow-card">
      <span aria-hidden="true" className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-accent bg-accent-soft text-small text-accent">{stepNumber}</span>
      <div className="min-w-0">
        <h3 className="text-h3 text-fg"><span className="sr-only">Step {stepNumber}: </span>{title}</h3>
        <p className="mt-s4 text-body text-secondary">{body}</p>
      </div>
    </li>
  );
}
