/**
 * A-05c: says in words whether the drawn area can be used. Never colour alone: each state has its own glyph and wording.
 * `drawn` is false before any box exists, when the "problem" is only an instruction.
 */
export default function ValidationLine({ problem, drawn }: { problem?: string; drawn: boolean }) {
  const bad = drawn && !!problem;
  const glyph = bad ? "✕" : drawn ? "✓" : "i";
  return (
    <p data-testid="box-problem" data-state={bad ? "problem" : drawn ? "valid" : "empty"} aria-live="polite"
      className={`flex items-start gap-s8 text-small ${bad ? "text-danger" : drawn ? "text-success" : "text-secondary"}`}>
      <b aria-hidden="true" className="w-4 shrink-0 text-center">{glyph}</b>
      <span>{problem ?? "Area looks good."}</span>
    </p>
  );
}
