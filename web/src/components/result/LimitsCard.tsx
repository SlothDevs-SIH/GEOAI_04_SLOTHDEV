import { CardSection } from "../ui/Primitives";

/** R-31: honest limits of this result and where the data came from. */
export default function LimitsCard({ limits, sources }: { limits: string[]; sources: string[] }) {
  return (
    <CardSection title="Limits and sources" testid="limits" collapsible defaultOpen>
      <ul className="list-disc space-y-s4 pl-4 text-tiny text-secondary">{limits.map((l) => <li key={l}>{l}</li>)}</ul>
      {sources.length > 0 && <p className="mt-s8 text-tiny text-muted">Sources: {sources.join(" · ")}</p>}
    </CardSection>
  );
}
