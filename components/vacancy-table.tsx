import type { GeographyLevel } from '@/domain/geography';
import type { RegionFigure } from './region-figure';

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
 */

const numberFormat = new Intl.NumberFormat('en-AU');

/** How the publisher describes an absent figure, in the reader's terms. */
function absenceLabel(state: string): string {
  switch (state) {
    case 'SUPPRESSED':
      return 'Withheld by the publisher';
    case 'NOT_COVERED':
      return 'Outside this dataset';
    case 'UNAVAILABLE':
      return 'Not published';
    default:
      return 'No figure';
  }
}

/** The publisher's own name for the level, for a reader who is not an ASGS user. */
function levelLabel(level: GeographyLevel): string {
  switch (level) {
    case 'GCCSA':
      return 'Capital city';
    case 'SA4':
      return 'Region';
    case 'STATE':
      return 'State or territory';
    case 'COUNTRY':
      return 'Country';
  }
}

export function VacancyTable({
  id,
  regions,
  caption,
}: {
  id: string;
  regions: readonly RegionFigure[];
  caption: string;
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
        {ranked.map((region) => (
          <tr key={region.code} className="border-rule border-b">
            <th scope="row" className="text-ink py-2 pr-4 text-left font-normal">
              {region.name}
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
        ))}
      </tbody>
    </table>
  );
}
