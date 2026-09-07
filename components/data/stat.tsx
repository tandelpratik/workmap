/**
 * A headline figure.
 *
 * The number is set in the display serif at a size that lets it be read before
 * the label, because in a data product the figure is the sentence and the
 * label is its grammar. Tabular numerals, so a column of these aligns.
 *
 * `value` is a string rather than a number: formatting is the caller's, and an
 * absent figure has to be able to say so in words. "No figure" and 0 are
 * different facts and this component must not be able to confuse them.
 */

export function Stat({
  label,
  value,
  note,
  muted = false,
}: {
  label: string;
  value: string;
  /** What qualifies the figure: coverage, comparison, basis. */
  note?: React.ReactNode;
  /** True when `value` is an absence rather than a number. */
  muted?: boolean;
}) {
  return (
    <div>
      <p className="text-ink-faint text-label font-mono uppercase">{label}</p>
      <p
        className={`tabular mt-2 font-serif text-figure font-semibold ${
          muted ? 'text-ink-muted' : 'text-ink'
        }`}
      >
        {value}
      </p>
      {note === undefined ? null : (
        <p className="text-ink-muted mt-2 text-sm leading-snug text-pretty">{note}</p>
      )}
    </div>
  );
}
