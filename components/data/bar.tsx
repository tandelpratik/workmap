/**
 * The bar behind a figure in a ranked table.
 *
 * A ranking of fifty-seven rows is unreadable as a column of numerals: the eye
 * cannot compare 12,481 with 9,004 down a page. A bar restores the comparison
 * the numerals lose, which is the oldest device in statistical publishing and
 * still the right one.
 *
 * It is decoration in the accessibility sense and marked so: the figure it
 * illustrates is always printed beside it, so nothing is encoded by length or
 * colour alone (constitution: accessibility). A row with no figure gets no
 * bar, because a zero-width bar would read as a measured zero.
 */

export function Bar({ value, max }: { value: number | null; max: number }) {
  if (value === null || max <= 0) return null;

  // Clamped rather than trusted. A value above the maximum would otherwise
  // draw outside its track, and a negative one would draw backwards.
  const fraction = Math.max(0, Math.min(1, value / max));

  return (
    <span aria-hidden="true" className="bg-paper-sunken block h-1.5 w-full">
      <span
        className="bg-scale-4 block h-full"
        style={{ width: `${String(fraction * 100)}%` }}
      />
    </span>
  );
}
