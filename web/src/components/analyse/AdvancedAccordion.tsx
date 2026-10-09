import { useId, useState } from "react";
import { FIELD, HINT, LABEL } from "./styles";

interface Props {
  composite: number;
  onComposite: (n: number) => void;
  persistence: boolean;
  onPersistence: (on: boolean) => void;
  /** Floods: water recedes, so asking a change to persist would remove real change. */
  disabledPersistence?: boolean;
}

/** A-08c: optional false-alarm filters, collapsed by default (A-11 accordion: height + chevron, 220 ms). */
export default function AdvancedAccordion({ composite, onComposite, persistence, onPersistence, disabledPersistence = false }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div data-testid="advanced" className="rounded-sm border border-line">
      <button type="button" aria-expanded={open} aria-controls={`${id}-panel`} onClick={() => setOpen(!open)}
        className="press flex min-h-[48px] w-full items-center justify-between gap-s8 px-s12 text-left text-small text-fg">
        <span>Extra filters <span className="font-normal text-muted">(optional, off by default)</span></span>
        <svg className="chevron shrink-0" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 6l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
      </button>
      <div id={`${id}-panel`} className="accordion" data-open={open}>
        <div inert={!open}>
          <div className="flex flex-col gap-s12 px-s12 pb-s12">
            <div>
              <label htmlFor={`${id}-comp`} className={LABEL}>Images per date</label>
              <select id={`${id}-comp`} data-testid="composite" value={composite} className={`${FIELD} mt-s4`} onChange={(e) => onComposite(Number(e.target.value))}>
                <option value={1}>The single clearest image</option>
                <option value={3}>Median of 3 images</option>
              </select>
              {composite === 3 && <p className={`${HINT} mt-s4`}>Smooths one-off clouds, but is slower, and it did not reduce false alarms in our test.</p>}
            </div>
            <label className="flex min-h-[48px] cursor-pointer items-start gap-s12 text-small font-normal text-secondary">
              <input type="checkbox" data-testid="persistence" checked={persistence && !disabledPersistence} disabled={disabledPersistence}
                onChange={(e) => onPersistence(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-accent" />
              <span>
                Keep a change only if it is also seen in a second, later image (for construction, not floods). In our test: 27% fewer detections on a no-construction area, and 15% less changed area on a real-construction area, so it trades some real change for fewer false alarms.
                {disabledPersistence && <b className="mt-s4 block text-fg">Not used for floods: flood water recedes, so requiring it to persist would remove real change.</b>}
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
