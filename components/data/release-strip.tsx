/**
 * What is on this page, stated as fields rather than as prose.
 *
 * Statistical publishers open a release this way: dataset, reference period,
 * coverage, basis. It is the difference between a page that shows numbers and
 * a page a reader can cite. Four short fields do work that three paragraphs of
 * hedging were doing badly.
 *
 * Every value here is read from the data. A field with nothing behind it is
 * omitted rather than filled with a placeholder, because an invented coverage
 * figure is exactly the fabrication the constitution forbids.
 */

import { cn } from '@/components/ui/cn';
import { hairlineGrid, HairlineCell } from '@/components/ui/hairline-grid';
import { Label } from '@/components/ui/label';

export interface ReleaseField {
  readonly label: string;
  readonly value: string;
}

export function ReleaseStrip({ fields }: { fields: readonly ReleaseField[] }) {
  if (fields.length === 0) return null;

  return (
    /*
      Bounded on all four sides rather than ruled top and bottom. The cells
      need interior padding, and against an open-ended band that padding reads
      as the first label failing to line up with the margin the rest of the
      page is set to.
    */
    <dl className={cn(hairlineGrid, 'mt-8 grid-cols-2 sm:grid-cols-4')}>
      {fields.map((field) => (
        <HairlineCell key={field.label}>
          <Label as="dt">{field.label}</Label>
          <dd className="text-ink mt-1.5 text-sm leading-snug font-medium">
            {field.value}
          </dd>
        </HairlineCell>
      ))}
    </dl>
  );
}
