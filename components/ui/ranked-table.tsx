import { Bar } from '@/components/data/bar';
import { cn } from './cn';
import { label } from './label';
import { link } from './link';

/**
 * A ranking of named things by one figure.
 *
 * Four tables were written out by hand: regions by advertisements, occupation
 * groups by advertisements, and the two rankings on the front page. They were
 * the same table with different columns, and they had already drifted, in row
 * padding, in where the ordinal was allowed to disappear, and in how wide the
 * bar was.
 *
 * The reason to collapse them is not the line count. It is that this table
 * carries obligations from the constitution, and each hand-written copy was a
 * chance to drop one. The name cell is a row header so a screen reader can
 * announce which row a figure belongs to. The ordinal has a real heading, so
 * "#" is not read out as a symbol. An absent figure prints why it is absent
 * rather than a dash or a zero. The bar is `aria-hidden` and never appears
 * without its number beside it, because nothing here may be encoded by length
 * or colour alone. Fixed once, they hold everywhere.
 *
 * Rows arrive already ordered. The caller sorts, because only the caller knows
 * where an absent figure belongs in its ranking, and the ordinal printed here
 * is the position in the order it was given.
 */

const numberFormat = new Intl.NumberFormat('en-AU');

export interface RankedColumn<T> {
  readonly heading: string;
  readonly align?: 'left' | 'right';
  /** Dropped below the `sm` breakpoint, where the width is not there. */
  readonly compact?: boolean;
  readonly render: (row: T) => React.ReactNode;
}

/** The row's name, and where it leads. */
export interface RankedName {
  readonly label: React.ReactNode;
  readonly href?: string;
  /** The row the reader has selected, marked in weight, rule and the tree. */
  readonly selected?: boolean;
}

/** The row's figure, or the reason there is not one. */
export interface RankedFigure {
  readonly value: number | null;
  /**
   * Printed in place of the figure. "No figure" and "Withheld by the
   * publisher" are different facts and this is where the difference survives.
   */
  readonly absence?: string;
}

const headCell = (align: 'left' | 'right', compact = false): string =>
  cn(
    label({ tone: 'faint' }),
    'py-2 font-normal',
    align === 'right' ? 'text-right' : 'text-left',
    compact && 'hidden sm:table-cell',
  );

const bodyCell = (align: 'left' | 'right', compact = false): string =>
  cn(
    'py-2.5',
    align === 'right' ? 'text-right' : 'text-left',
    compact && 'hidden sm:table-cell',
  );

export function RankedTable<T>({
  id,
  caption,
  captionHidden = false,
  minWidth = 'min-w-[18rem]',
  rows,
  rowKey,
  heading,
  name,
  figure,
  figureHeading = 'Advertisements',
  rank = 'none',
  bar = true,
  before,
  after,
}: {
  id?: string;
  caption: React.ReactNode;
  /** True where the surrounding figure frame already states the same thing. */
  captionHidden?: boolean;
  minWidth?: string;
  rows: readonly T[];
  rowKey: (row: T) => string;
  heading: string;
  name: (row: T) => RankedName;
  figure: (row: T) => RankedFigure;
  figureHeading?: string;
  /** `compact` hides the ordinal below `sm`, where the columns need the room. */
  rank?: 'none' | 'always' | 'compact';
  bar?: boolean;
  before?: readonly RankedColumn<T>[];
  after?: readonly RankedColumn<T>[];
}) {
  // Scaled to the largest figure shown, so the longest bar fills its track and
  // the comparison is between what is on screen. Scaling to some wider maximum
  // would draw every bar in a filtered view as a stub.
  const max = rows.reduce((highest, row) => Math.max(highest, figure(row).value ?? 0), 0);

  const extras = (columns: readonly RankedColumn<T>[] | undefined, row: T) =>
    (columns ?? []).map((column) => (
      <td
        key={column.heading}
        className={cn(
          bodyCell(column.align ?? 'left', column.compact),
          column.align === 'right' ? 'tabular font-mono' : 'text-ink-faint text-xs',
        )}
      >
        {column.render(row)}
      </td>
    ));

  const extraHeadings = (columns: readonly RankedColumn<T>[] | undefined) =>
    (columns ?? []).map((column) => (
      <th
        key={column.heading}
        scope="col"
        className={cn(headCell(column.align ?? 'left', column.compact), 'pl-4')}
      >
        {column.heading}
      </th>
    ));

  return (
    <div className="scroll-x">
      <table id={id} className={cn('w-full border-collapse text-sm', minWidth)}>
        <caption
          className={
            captionHidden
              ? 'sr-only'
              : 'text-ink-muted max-w-measure mb-4 text-left text-sm leading-relaxed'
          }
        >
          {caption}
        </caption>
        <thead>
          <tr className="border-rule-heavy border-b">
            {rank === 'none' ? null : (
              <th
                scope="col"
                className={cn(
                  headCell('right', rank === 'compact'),
                  'w-8 pr-3 font-mono',
                )}
              >
                {/* Headed as a rank, so it is not announced as a symbol. */}
                <span className="sr-only">Rank</span>
                <span aria-hidden="true">#</span>
              </th>
            )}

            <th scope="col" className={cn(headCell('left'), 'pr-4')}>
              {heading}
            </th>

            {extraHeadings(before)}

            <th scope="col" className={cn(headCell('right'), 'font-mono')}>
              {figureHeading}
            </th>

            {bar ? (
              <th scope="col" className="hidden w-28 py-2 pl-4 sm:table-cell">
                <span className="sr-only">Relative size</span>
              </th>
            ) : null}

            {extraHeadings(after)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const { label: text, href, selected = false } = name(row);
            const { value, absence } = figure(row);

            return (
              <tr
                key={rowKey(row)}
                className={cn(
                  'border-rule hover:bg-paper-sunken border-b',
                  selected && 'bg-paper-sunken',
                )}
              >
                {rank === 'none' ? null : (
                  <td
                    className={cn(
                      bodyCell('right', rank === 'compact'),
                      'tabular text-ink-faint pr-3 font-mono text-xs',
                    )}
                  >
                    {/* An unranked row is blank rather than numbered. */}
                    {value === null ? '' : index + 1}
                  </td>
                )}

                <th scope="row" className={cn(bodyCell('left'), 'pr-4 font-normal')}>
                  {href === undefined ? (
                    <span className="text-ink">{text}</span>
                  ) : (
                    <a
                      href={href}
                      aria-current={selected ? 'true' : undefined}
                      className={link(
                        selected
                          ? { tone: 'current', underline: 'always' }
                          : { tone: 'ink', underline: 'hover' },
                      )}
                    >
                      {text}
                    </a>
                  )}
                </th>

                {extras(before, row)}

                <td className={cn(bodyCell('right'), 'text-ink tabular font-mono')}>
                  {value === null ? (
                    <span className="text-ink-faint font-sans text-xs">
                      {absence ?? 'No figure'}
                    </span>
                  ) : (
                    numberFormat.format(value)
                  )}
                </td>

                {bar ? (
                  <td className="hidden py-2.5 pl-4 align-middle sm:table-cell">
                    <Bar value={value} max={max} />
                  </td>
                ) : null}

                {extras(after, row)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
