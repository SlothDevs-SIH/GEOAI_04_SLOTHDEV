import { useId, useState } from "react";
import { type Box, parseBox } from "../../lib/aoi";
import { Button } from "../ui/Primitives";
import { FIELD, HINT } from "./styles";

const KEYS = ["west", "south", "east", "north"] as const;
const LABELS = { west: "West (longitude)", south: "South (latitude)", east: "East (longitude)", north: "North (latitude)" };

/**
 * The same box as the map, typed as numbers. For keyboard and screen-reader users (a map click cannot be done
 * without a pointer) and for browsers where the map cannot start.
 */
export default function BoxInputs({ box, onChange }: { box?: Box; onChange: (b: Box) => void }) {
  const id = useId();
  const [typed, setTyped] = useState<{ box?: Box; text: Record<(typeof KEYS)[number], string> }>({ text: { west: "", south: "", east: "", north: "" } });
  const [problem, setProblem] = useState<string>();
  // when the map draws a new box, show its numbers (derived during render: no effect needed)
  let text = typed.text;
  if (box && box !== typed.box) {
    text = { west: box[0].toFixed(4), south: box[1].toFixed(4), east: box[2].toFixed(4), north: box[3].toFixed(4) };
    setTyped({ box, text });
  }
  return (
    <details data-testid="coords" className="rounded-sm border border-line">
      <summary className="press flex min-h-[48px] cursor-pointer items-center px-s12 text-small text-fg">Or type the corner coordinates</summary>
      <div className="flex flex-col gap-s12 px-s12 pb-s12">
        <p className={HINT}>Degrees, for example west 77.10, south 28.50, east 77.17, north 28.56.</p>
        <div className="grid grid-cols-2 gap-s12">
          {KEYS.map((k) => (
            <label key={k} className="text-small text-fg">
              {LABELS[k]}
              <input inputMode="decimal" data-testid={`coord-${k}`} value={text[k]} className={`${FIELD} mt-s4`}
                onChange={(e) => setTyped({ box: typed.box, text: { ...text, [k]: e.target.value } })} aria-describedby={problem ? `${id}-err` : undefined} />
            </label>
          ))}
        </div>
        {problem && <p id={`${id}-err`} role="alert" data-testid="coords-problem" className="flex gap-s8 text-small text-danger"><b aria-hidden="true">✕</b><span>{problem}</span></p>}
        <div>
          <Button variant="secondary" data-testid="coords-apply" onClick={() => {
            const r = parseBox(text.west, text.south, text.east, text.north);
            if (typeof r === "string") return setProblem(r);
            setProblem(undefined);
            setTyped({ box: r, text });
            onChange(r);
          }}>Use these coordinates</Button>
        </div>
      </div>
    </details>
  );
}
