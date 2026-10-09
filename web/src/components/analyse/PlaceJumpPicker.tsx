import { useId } from "react";
import type { Place } from "../../lib/aoi";
import { FIELD, LABEL } from "./styles";

/** A-02c: shortcuts across regions and climates; the whole of India (and the world) can still be drawn on. */
export default function PlaceJumpPicker({ places, selected, onSelect }: { places: Place[]; selected?: Place; onSelect: (p: Place) => void }) {
  const id = useId();
  const idx = selected ? Math.max(0, places.findIndex((p) => p.name === selected.name)) : 0;
  return (
    <div>
      <label htmlFor={id} className={LABEL}>Jump to region</label>
      <select id={id} data-testid="place" value={idx} className={`${FIELD} mt-s4`} onChange={(e) => onSelect(places[Number(e.target.value)])}>
        {places.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
      </select>
    </div>
  );
}
