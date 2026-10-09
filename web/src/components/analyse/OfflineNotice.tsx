import { Link } from "react-router-dom";
import { Button, InlineAlert } from "../ui/Primitives";
import { LINK_PRIMARY } from "./styles";

const STEPS: [string, string, string][] = [
  ["1", "Draw a box anywhere in India", "Click two opposite corners on the map. Boxes from 0.5 to 15 km a side work."],
  ["2", "Pick two dates", "Use the same time of year for both, so growing crops are not mistaken for change."],
  ["3", "The server finds the clearest images", "It picks the least cloudy Sentinel-2 image near each date, then finds what really changed."],
];

/**
 * The "no analysis server" state. Not a dead end: it explains, offers the demo scenes, and the form below it
 * stays visible as a read-only preview (the map still works for drawing a box).
 */
export default function OfflineNotice({ configured, retrying, onRetry }: { configured: boolean; retrying: boolean; onRetry: () => void }) {
  return (
    <section data-testid="analyse-offline" aria-labelledby="offline-title" className="flex flex-col gap-s18 rounded-md border border-line bg-surface p-s18 shadow-card">
      <div className="flex flex-col gap-s8">
        <h2 id="offline-title" className="text-h2 text-fg">Live analysis is offline</h2>
        <InlineAlert variant="info" message="Live analysis needs the analysis server, which is not reachable right now (the demo scenes work without it)." />
        <p className="text-body text-secondary">
          {configured
            ? "The server may be waking up (free hosting sleeps when idle and can take up to a minute to start). Try again in a moment."
            : "No analysis server is set up for this copy of the site."}
          {" "}The form below is a preview: you can draw a box and check it, but the buttons stay off until the server answers.
        </p>
      </div>
      <div className="flex flex-wrap gap-s12">
        <Link to="/" data-testid="open-demo-scenes" className={`${LINK_PRIMARY} inline-flex`}>Open the demo scenes</Link>
        {configured && <Button variant="secondary" loading={retrying} onClick={onRetry} data-testid="retry-health">Try again</Button>}
      </div>
      <ol aria-label="What live analysis does" className="m-0 grid list-none gap-s12 p-0 sm:grid-cols-3">
        {STEPS.map(([n, title, body]) => (
          <li key={n} className="rounded-sm border border-line bg-surface-alt p-s12">
            <span aria-hidden="true" className="mb-s8 flex h-6 w-6 items-center justify-center rounded-full border-2 border-accent text-micro text-accent">{n}</span>
            <h3 className="text-small text-fg">{title}</h3>
            <p className="mt-s4 text-tiny text-secondary">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
