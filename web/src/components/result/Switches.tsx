import { Switch } from "../ui/Primitives";

/** R-11: the false-alarm filter. Off shows every raw candidate in neutral grey. */
export function FilterToggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={`rounded-sm border-2 px-s12 transition-colors ${value ? "border-accent bg-accent-soft" : "border-line-strong bg-surface-alt"}`}>
      <Switch checked={value} onChange={onChange} label="False-alarm filter" testid="filter-toggle" />
    </div>
  );
}

/** R-13: expert-label overlay (radar scenes only). */
export function LabelsSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return <Switch checked={value} onChange={onChange} label="Show expert labels" testid="labels-toggle" />;
}

/** R-14 */
export function PolygonsSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return <Switch checked={value} onChange={onChange} label="Polygons" testid="polygons-toggle" />;
}
