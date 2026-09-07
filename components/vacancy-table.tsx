import { RankedTable } from '@/components/ui/ranked-table';
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
 * prints the figures, with a bar behind each so fifty rows can be compared by
 * eye rather than read one numeral at a time.
 *
 * Every row selects, exactly as the map does, so a reader who cannot use the
 * map has the same interaction rather than a read-only copy of it. On a phone
 * this is the primary control: an SA4 boundary drawn 350 pixels wide is too
 * small to hit reliably, and these rows are the same links at a size a thumb
 * can use.
 *
 * What is left here after the move to `RankedTable` is the part that is about
 * regions rather than about tables: how an absent figure is described, and
 * where a region carrying none of them sorts.
 */

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
    <RankedTable
      id={id}
      caption={caption}
      rows={ranked}
      rowKey={(region) => region.code}
      heading="Region"
      rank="always"
      name={(region) => ({
        label: region.name,
        // Selecting a selected row clears it, so the control is the same shape
        // as the map's: one link, two directions.
        href: regionHref(region.code === selectedCode ? null : region.code, stateCode),
        selected: region.code === selectedCode,
      })}
      figure={(region) => ({
        value: region.observation.value,
        absence: absenceLabel(region.observation.valueState),
      })}
      before={[
        {
          heading: 'Type',
          compact: true,
          render: (region) => levelLabel(region.level),
        },
      ]}
    />
  );
}
