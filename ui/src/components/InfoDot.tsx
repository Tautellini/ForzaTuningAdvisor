/** A small ⓘ that reveals explanatory text on hover, keeping the UI text-free. */
export function InfoDot({ text }: { text: string }) {
  return (
    <span className="infodot" title={text} role="img" aria-label="info">
      ⓘ
    </span>
  );
}
