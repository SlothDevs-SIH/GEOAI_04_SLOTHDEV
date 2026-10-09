import { useId, useState } from "react";
import { HINT } from "./styles";

const isTiff = (f: File) => /\.tiff?$/i.test(f.name);
const size = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

interface Props {
  label: string;
  file?: File;
  onPick: (f: File) => void;
  onClear: () => void;
  testid: string;
  hint?: string;
}

/** A-11c: pick or drop one GeoTIFF. Empty and file-picked states; a wrong file type is refused with a sentence. */
export default function FilePickerField({ label, file, onPick, onClear, testid, hint }: Props) {
  const id = useId();
  const [over, setOver] = useState(false);
  const [problem, setProblem] = useState<string>();

  const take = (f: File | undefined) => {
    if (!f) return;
    if (!isTiff(f)) {
      setProblem(`"${f.name}" is not a GeoTIFF. Choose a .tif or .tiff file.`);
      return;
    }
    setProblem(undefined);
    onPick(f);
  };

  return (
    <div>
      <span id={`${id}-label`} className="block text-small text-fg">{label}</span>
      {file ? (
        <div data-testid={`${testid}-picked`} className="mt-s4 flex min-h-[48px] items-center justify-between gap-s8 rounded-sm border border-line-strong bg-surface-alt px-s12">
          <span className="min-w-0 truncate text-body text-fg" title={file.name}>
            <b aria-hidden="true" className="mr-1 text-success">✓</b>{file.name} <span className="text-muted">({size(file.size)})</span>
          </span>
          <button type="button" onClick={() => { setProblem(undefined); onClear(); }} aria-label={`Remove ${file.name}`}
            className="press tap shrink-0 rounded-sm px-s8 text-small text-accent underline">Remove</button>
        </div>
      ) : (
        <label onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]); }}
          className={`press relative mt-s4 flex min-h-[72px] cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border-2 border-dashed px-s12 py-s12 text-center focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus ${
            over ? "border-accent bg-accent-soft" : "border-line-strong bg-surface-alt hover:bg-surface-hover"
          }`}>
          <span className="text-small text-accent">Choose a GeoTIFF</span>
          <span className={HINT}>or drop it here (.tif, .tiff)</span>
          <input type="file" accept=".tif,.tiff" data-testid={testid} aria-labelledby={`${id}-label`} className="sr-only"
            onChange={(e) => take(e.target.files?.[0])} />
        </label>
      )}
      {hint && <p className={`${HINT} mt-s4`}>{hint}</p>}
      {problem && <p role="alert" data-testid={`${testid}-problem`} className="mt-s4 flex gap-s8 text-small text-danger"><b aria-hidden="true">✕</b><span>{problem}</span></p>}
    </div>
  );
}
