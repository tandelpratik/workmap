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
 * prints the figures.
 *
 * Every row selects, exactly as the map does, so a reader who cannot use the
 * map has the same interaction rather than a read-only copy of it.
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

  return (
    <table id={id} className="mt-8 w-full border-collapse text-sm">
      <caption className="text-ink-muted max-w-measure mb-4 text-left text-sm leading-relaxed">
        {caption}
      </caption>
      <thead>
        <tr className="border-rule-strong border-b">
          <th scope="col" className="text-ink py-2 pr-4 text-left font-medium">
            Region
          </th>
          <th scope="col" className="text-ink py-2 pr-4 text-left font-medium">
            Type
          </th>
          <th scope="col" className="text-ink py-2 text-right font-medium">
            Advertisements
          </th>
        </tr>
      </thead>
      <tbody>
        {ranked.map((region) => {
          const isSelected = region.code === selectedCode;
          return (
            <tr
              key={region.code}
              className={
                isSelected
                  ? 'border-rule bg-paper-sunken border-b'
                  : 'border-rule border-b'
              }
            >
              <th scope="row" className="py-2 pr-4 text-left font-normal">
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
              <td className="text-ink-faint py-2 pr-4">{levelLabel(region.level)}</td>
              <td className="text-ink py-2 text-right font-mono tabular-nums">
                {region.observation.value === null ? (
                  <span className="text-ink-faint font-sans">
                    {absenceLabel(region.observation.valueState)}
                  </span>
                ) : (
                  numberFormat.format(region.observation.value)
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
