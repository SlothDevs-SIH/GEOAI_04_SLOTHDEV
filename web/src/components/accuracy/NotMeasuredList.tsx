import { CardSection } from "../ui/Primitives";

/** Q-03: what we have not measured, stated plainly, straight from `not_measured` in the results file. */
export default function NotMeasuredList({ bullets }: { bullets: string[] }) {
  return (
    <CardSection title="Not measured yet (said plainly)" testid="acc-not-measured">
      {bullets.length ? (
        <ul data-testid="not-measured" className="m-0 flex list-disc flex-col gap-s8 pl-s18 text-body text-secondary">
          {bullets.map((x) => <li key={x}>{x}</li>)}
        </ul>
      ) : (
        <p className="text-body text-secondary">Nothing outstanding in the results file.</p>
      )}
    </CardSection>
  );
}
