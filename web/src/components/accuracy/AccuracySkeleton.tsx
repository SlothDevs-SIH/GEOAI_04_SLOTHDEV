import { CardSection, Skeleton } from "../ui/Primitives";

/** Loading state: tile placeholders plus table skeleton rows (A7 "Accuracy"). */
export default function AccuracySkeleton() {
  return (
    <div data-testid="acc-loading" role="status" aria-busy="true" aria-label="Loading measured results" className="flex flex-col gap-s18">
      <div className="grid grid-cols-1 gap-s12 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} height={132} radius={13} />)}
      </div>
      {[0, 1, 2].map((c) => (
        <CardSection key={c}>
          <div className="flex flex-col gap-s12">
            <Skeleton width="55%" height={18} />
            {Array.from({ length: 4 }, (_, r) => <Skeleton key={r} height={16} />)}
          </div>
        </CardSection>
      ))}
    </div>
  );
}
