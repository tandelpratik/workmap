import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { hairlineGrid, HairlineCell } from '@/components/ui/hairline-grid';
import { FieldLabel } from '@/components/ui/label';
import type { Choice } from '@/components/compare-form';

/**
 * The question this product exists to answer, asked directly.
 *
 * One required field and two optional ones. The occupation decides the ranking;
 * the other two decide which advertisements the reader is sent to afterwards,
 * and are labelled to say so, because they look like they narrow the ranking
 * and they cannot. The index publishes advertising by occupation and region and
 * knows nothing about employment type or what an advertisement says about
 * sponsorship, so a control that appeared to filter the ranking by either would
 * be describing a dataset that does not exist.
 */

const control = 'text-ink bg-paper mt-1 block h-11 w-full text-base outline-none';

export function ExploreForm({
  occupations,
  occupation,
  sponsorship,
  employmentType,
}: {
  occupations: readonly Choice[];
  occupation: string | undefined;
  sponsorship: string | undefined;
  employmentType: string | undefined;
}) {
  return (
    <form
      method="get"
      action="/explore"
      className={cn(
        hairlineGrid,
        'print-hide mt-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
      )}
    >
      <HairlineCell className="py-2.5">
        <FieldLabel htmlFor="occupation">Kind of work</FieldLabel>
        <select
          id="occupation"
          name="occupation"
          defaultValue={occupation ?? ''}
          className={control}
        >
          <option value="">Choose an occupation group</option>
          {occupations.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </HairlineCell>

      <HairlineCell className="py-2.5">
        <FieldLabel htmlFor="type">Employment type</FieldLabel>
        <select
          id="type"
          name="type"
          defaultValue={employmentType ?? ''}
          className={control}
        >
          <option value="">Any</option>
          <option value="FULL_TIME">Full time</option>
          <option value="PART_TIME">Part time</option>
          <option value="CASUAL">Casual</option>
          <option value="CONTRACT">Contract</option>
        </select>
        <p className="text-ink-faint mt-1 text-xs">Applies to the advertisements only</p>
      </HairlineCell>

      <HairlineCell className="py-2.5">
        <FieldLabel htmlFor="sponsorship">Sponsorship</FieldLabel>
        <select
          id="sponsorship"
          name="sponsorship"
          defaultValue={sponsorship ?? ''}
          className={control}
        >
          <option value="">Any</option>
          <option value="MENTIONED">Mentioned in the ad</option>
          <option value="NOT_MENTIONED">Not mentioned</option>
        </select>
        <p className="text-ink-faint mt-1 text-xs">Applies to the advertisements only</p>
      </HairlineCell>

      <div className="bg-paper flex sm:col-span-2 lg:col-span-3">
        <Button type="submit" block className="m-2">
          Show me where
        </Button>
      </div>
    </form>
  );
}
