import { useReducedMotion } from "../../hooks/motion";
import type { JobState } from "../../lib/api";

export const STEPS: [string, string][] = [
  ["queued", "Queued"],
  ["fetching", "Fetching"],
  ["detecting", "Detecting"],
  ["vectorising", "Vectorising"],
  ["done", "Done"],
];

export type StepState = "done" | "active" | "pending" | "error";

/** Index of the step the job is on (0..4). Uploading counts as the first step. */
export function stepIndex(job: Pick<JobState, "status" | "stage">): number {
  if (job.status === "done") return STEPS.length - 1;
  const i = STEPS.findIndex(([k]) => k === job.stage);
  return i >= 0 ? i : 0;
}

export function stepStates(job: Pick<JobState, "status" | "stage">): StepState[] {
  const cur = stepIndex(job);
  return STEPS.map((_, i) => {
    if (job.status === "done") return "done";
    if (i < cur) return "done";
    if (i === cur) return job.status === "error" ? "error" : "active";
    return "pending";
  });
}

const DOT: Record<StepState, string> = {
  done: "border-accent bg-accent text-on-accent",
  active: "border-accent bg-surface text-accent",
  pending: "border-line-strong bg-surface text-muted",
  error: "border-danger bg-danger-soft text-danger",
};

/** A-10c: Queued, Fetching, Detecting, Vectorising, Done. The line fills over 400 ms and the active dot pulses while running (A-12). */
export default function ProgressStepper({ job }: { job: Pick<JobState, "status" | "stage" | "progress"> }) {
  const reduced = useReducedMotion();
  const states = stepStates(job);
  const cur = stepIndex(job);
  const running = job.status !== "done" && job.status !== "error";
  const fill = (cur / (STEPS.length - 1)) * 100;
  const name = job.status === "uploading" ? "Uploading" : STEPS[cur][1];
  const pct = job.progress && job.progress > 0 && job.progress < 1 ? ` · ${Math.round(job.progress * 100)}%` : "";
  const summary = job.status === "done" ? "Done" : job.status === "error" ? `Stopped while ${name.toLowerCase()}` : `${name}${pct}`;
  return (
    <div data-testid="progress-stepper" data-status={job.status}>
      <div className="relative">
      <span aria-hidden="true" className="absolute left-[10%] right-[10%] top-[11px] h-0.5 bg-line">
        <span data-testid="stepper-fill" className="block h-full bg-accent" style={{ width: `${fill}%`, transition: "width 400ms ease" }} />
      </span>
      <ol className="relative m-0 grid list-none grid-cols-5 p-0" aria-label="Analysis progress">
        {STEPS.map(([key, label], i) => {
          const s = states[i];
          return (
            <li key={key} data-state={s} data-testid={`step-${key}`} aria-current={s === "active" ? "step" : undefined}
              className="relative z-10 flex flex-col items-center gap-s4 text-center">
              <span aria-hidden="true"
                className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-micro ${DOT[s]} ${s === "active" && running && !reduced ? "pulse-dot" : ""}`}>
                {s === "done" ? "✓" : s === "error" ? "✕" : i + 1}
              </span>
              <span className={`text-micro ${s === "pending" ? "text-muted" : "text-fg"}`}>
                {label}
                <span className="sr-only">{s === "done" ? " (complete)" : s === "active" ? " (in progress)" : s === "error" ? " (failed)" : " (waiting)"}</span>
              </span>
            </li>
          );
        })}
      </ol>
      </div>
      <p role="status" aria-live="polite" data-testid="stepper-summary" className="mt-s12 text-small text-secondary">{summary}</p>
    </div>
  );
}
