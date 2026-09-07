import { cn } from './cn';

/**
 * The instrument band: a bordered grid whose dividers are its own gap.
 *
 * The cells sit on the page ground and the grid sits on the rule colour, so
 * every divider is the ground showing through a one pixel gap. That is worth
 * the trick. Built the obvious way, out of `border-t` on some cells and
 * `border-l` on others, the rules double at every breakpoint where the column
 * count changes and there is no arrangement of the two that is correct at both
 * one column and four. This is correct at any number, and it is one pixel at
 * any zoom level, which stacked borders are not.
 *
 * Used by the search bar, the occupation filter and the release strip: three
 * different elements, one visual grammar.
 */

export const hairlineGrid = 'border-rule bg-rule grid gap-px border';

export function HairlineCell({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn('bg-paper px-4 py-3', className)}>{children}</div>;
}
