import { Bar } from '@/components/data/bar';
import { absenceLabel, levelLabel, regionHref, type RegionFigure } from './region-figure';

/**
 * The map's figures as a table.
 *
 * Required, not an extra: the constitution says every important visualisation
 * has an accessible alternative, and that meaning is never carried by colour
 * alone. This table is that alternative and it is always rendered, never
 * hidden behind a toggle, because a reader who needs it should not have to
 * find it.
 *
 * It is also the honest representation. The choropleth shades by rank; this
 * prints the figures, and sets a bar behind each so fifty rows can be compared
 * by eye rather than read one numeral at a time.
 *
 * Every row selects, exactly as the map does, so a reader who cannot use the
 * map has the same interaction rather than a read-only copy of it. On a phone
 * this is the primary control, which is why the row is generously spaced and
 * the link fills it.
 */

const numberFormat = new Intl.NumberFormat('en-AU');

export function VacancyTable({
  id,
  regions,
  caption,
  selectedCode,
  stateCode,
}: {
  id: string;
  regions: readonly RegionFigure[];
  caption: string;
  selectedCode: string | null;
  stateCode: string | null;
}) {
  const ranked = [...regions].sort((a, b) => {
    const left = a.observation.value;
    const right = b.observation.value;
    // Regions with no figure sort last rather than as zero.
    if (left === null && right === null) return a.name.localeCompare(b.name);
    if (left === null) return 1;
    if (right === null) return -1;
    return right - left;
  });

  // The bars are scaled to the largest figure shown, so the longest bar always
  // fills its track and the comparison is between what is on screen. Scaling
  // to a national maximum inside a state view would draw every bar as a stub.
  const max = ranked.reduce(
    (highest, region) => Math.max(highest, region.observation.value ?? 0),
    0,
  );

  return (
    <div className="scroll-x">
      <table id={id} className="w-full min-w-[18rem] border-collapse text-sm">
        <caption className="text-ink-muted max-w-measure mb-4 text-left text-sm leading-relaxed">
          {caption}
        </caption>
        <thead>
          <tr className="border-rule-heavy border-b">
            <th
              scope="col"
              className="text-ink-faint text-label w-8 py-2 pr-3 text-right font-mono font-normal uppercase"
            >
              {/* The ordinal, headed as one for a screen reader. */}
              <span className="sr-only">Rank</span>
              <span aria-hidden="true">#</span>
            </th>
            <th
              scope="col"
              className="text-ink-faint text-label py-2 pr-4 text-left font-mono font-normal uppercase"
            >
              Region
            </th>
            <th
              scope="col"
              className="text-ink-faint text-label hidden py-2 pr-4 text-left font-mono font-normal uppercase sm:table-cell"
            >
              Type
            </th>
            <th
              scope="col"
              className="text-ink-faint text-label py-2 text-right font-mono font-normal uppercase"
            >
              Advertisements
            </th>
            <th scope="col" className="hidden w-32 py-2 pl-4 sm:table-cell">
              <span className="sr-only">Relative size</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((region, index) => {
            const isSelected = region.code === selectedCode;
            return (
              <tr
                key={region.code}
                className={`border-rule hover:bg-paper-sunken border-b ${
                  isSelected ? 'bg-paper-sunken' : ''
                }`}
              >
                <td className="tabular text-ink-faint py-2.5 pr-3 text-right font-mono text-xs">
                  {region.observation.value === null ? '' : index + 1}
                </td>
                <th scope="row" className="py-2.5 pr-4 text-left font-normal">
                  {/*
                    Selecting a selected row clears it, so the control is the
                    same shape as the map's: one link, two directions.
                  */}
                  <a
                    href={regionHref(isSelected ? null : region.code, stateCode)}
                    aria-current={isSelected ? 'true' : undefined}
                    className={
                      isSelected
                        ? 'text-ink font-medium underline underline-offset-4'
                        : 'text-ink hover:text-accent underline-offset-4 hover:underline'
                    }
                  >
                    {region.name}
                  </a>
                </th>
                <td className="text-ink-faint hidden py-2.5 pr-4 text-xs sm:table-cell">
                  {levelLabel(region.level)}
                </td>
                <td className="text-ink tabular py-2.5 text-right font-mono">
                  {region.observation.value === null ? (
                    <span className="text-ink-faint font-sans text-xs">
                      {absenceLabel(region.observation.valueState)}
                    </span>
                  ) : (
                    numberFormat.format(region.observation.value)
                  )}
                </td>
                <td className="hidden py-2.5 pl-4 align-middle sm:table-cell">
                  <Bar value={region.observation.value} max={max} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
