import type { ReactNode } from "react";
import { CardSection, Scroller } from "../ui/Primitives";
import CIBar from "./CIBar";
import { fmtCI, type CI } from "./results";

const CELL = "border-t border-line px-s8 py-s8 align-top tabular-nums";

export const Td = ({ children, className = "" }: { children?: ReactNode; className?: string }) => <td className={`${CELL} text-secondary ${className}`}>{children}</td>;
/** First column: a row header that stays visible while the table scrolls sideways. */
export const RowHead = ({ children, className = "" }: { children?: ReactNode; className?: string }) => (
  <th scope="row" className={`${CELL} sticky left-0 bg-surface text-left font-normal text-fg ${className}`}>{children}</th>
);

/** A table cell with the interval written out ("0.54 [0.34, 0.66]") and drawn (CIBar). */
export function CICell({ ci, label, strong }: { ci?: CI; label: string; strong?: boolean }) {
  if (!ci) return <Td>–</Td>;
  return (
    <Td className={strong ? "font-semibold text-fg" : ""}>
      <div>{fmtCI(ci)}</div>
      <div className="mt-s4"><CIBar value={ci.value} ci95={ci.ci95} label={label} /></div>
    </Td>
  );
}

/**
 * Q-01: one measured block. A CardSection with a short eyebrow title, a plain-language heading, a table inside a
 * Scroller (fading right edge, thin scrollbar) and a caption. `id` is the anchor the headline tiles jump to.
 */
export function MetricTable({ id, testid, title, heading, head, children, note, className = "" }: {
  id?: string; testid: string; title: string; heading?: ReactNode; head: ReactNode[]; children: ReactNode; note?: ReactNode; className?: string;
}) {
  return (
    <div id={id} tabIndex={-1} className={`scroll-mt-20 outline-none ${className}`}>
      <CardSection title={title} testid={testid}>
        {heading && <h3 className="mb-s12 text-h3 text-fg">{heading}</h3>}
        <Scroller testid={`${testid}-scroller`}>
          <table data-testid="metric-table" className="w-full min-w-[560px] border-separate border-spacing-0 text-small">
            <thead>
              <tr>
                {head.map((h, i) => (
                  <th key={i} scope="col" className={`whitespace-nowrap px-s8 pb-s8 text-left text-tiny font-medium text-muted ${i === 0 ? "sticky left-0 bg-surface" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        </Scroller>
        {note && <div className="mt-s12 text-tiny text-secondary">{note}</div>}
      </CardSection>
    </div>
  );
}
