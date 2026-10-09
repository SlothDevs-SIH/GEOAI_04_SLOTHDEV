import { type Box, sizeKm } from "../../lib/aoi";

/** A-04c: the drawn box in kilometres. */
export default function BoxSizeLabel({ box }: { box?: Box }) {
  const [w, h] = box ? sizeKm(box) : [0, 0];
  return (
    <p data-testid="box-size" className="text-small text-fg">
      {box ? <>Size: {w.toFixed(1)} × {h.toFixed(1)} km</> : <span className="text-muted">Size: not drawn yet</span>}
    </p>
  );
}
