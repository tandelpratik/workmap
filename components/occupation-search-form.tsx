import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { hairlineGrid, HairlineCell } from '@/components/ui/hairline-grid';
import { FieldLabel } from '@/components/ui/label';

/**
 * Finding one group among fifty-seven.
 *
 * A plain GET form, like every other control here: no client JavaScript, the
 * query lives in the URL, and the result is shareable and survives the back
 * button.
 *
 * It filters rather than searches, and the distinction is worth keeping in the
 * wording. Every group is on the page already; this narrows what is shown. A
 * reader who types something that matches nothing has not found an empty
 * market, they have mistyped, and the page says so in those terms.
 */

const control = 'text-ink bg-paper mt-1 block h-11 w-full text-base outline-none';

export function OccupationSearchForm({ query }: { query: string | undefined }) {
  return (
    <form
      method="get"
      action="/occupations"
      role="search"
      className={cn(hairlineGrid, 'print-hide mt-8 grid-cols-1 sm:grid-cols-[1fr_auto]')}
    >
      <HairlineCell className="py-2.5">
        <FieldLabel htmlFor="q">Find an occupation group</FieldLabel>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={query ?? ''}
          placeholder="Nursing, engineering, 26"
          className={cn(control, 'placeholder:text-ink-faint')}
        />
      </HairlineCell>

      <div className="bg-paper flex">
        <Button type="submit" block className="m-2">
          Filter
        </Button>
      </div>
    </form>
  );
}
