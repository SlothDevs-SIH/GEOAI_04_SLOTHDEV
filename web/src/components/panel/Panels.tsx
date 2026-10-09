import type { ReactNode } from "react";
import { CardSection } from "../ui/Primitives";

// The Result screen's panels now live in components/result/*. This module keeps the small shared pieces that other pages import.
export { TierChip } from "../ui/Shapes";
export { default as ChangeCard } from "../result/ChangeCard";
export { default as ChangeRow } from "../result/ChangeRow";
export { default as ExportMenu } from "../result/ExportMenu";
export { default as FilterBar } from "../result/FilterBar";
export { default as ImpactPanel } from "../result/ImpactPanel";
export { default as Legend } from "../result/Legend";
export { DropCounts } from "../result/ResultInfo";

/** Titled card (compatibility wrapper around CardSection, kept for pages that still import `Card`). */
export function Card({ title, children, testid }: { title: string; children: ReactNode; testid?: string }) {
  return <CardSection title={title} testid={testid}>{children}</CardSection>;
}
