import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { hairlineGrid, HairlineCell } from '@/components/ui/hairline-grid';
import { FieldLabel } from '@/components/ui/label';

/**
 * The search control.
 *
 * A plain GET form. No client JavaScript, so it works before hydration and
 * without it, the query lives in the URL and is therefore shareable and
 * bookmarkable, and the back button behaves.
 *
 * One instrument bar rather than four stacked bordered strips, built on the
 * shared hairline grid so its seams match the occupation filter and the
 * release strip exactly. Every control is at least a 44px target, because on a
 * phone this is the first thing a thumb meets.
 *
 * Two columns at most, never four. Tailwind's breakpoints measure the viewport
 * and this form sits in a column a little over forty rems wide, so a four
 * column layout at a desktop breakpoint would divide seven hundred pixels
 * between four controls rather than the full width it appeared to ask for.
 */

/**
 * Shared by both text inputs and the select, so they sit on one baseline.
 *
 * The ground is stated rather than left transparent. It is the same colour as
 * the cell behind it, so nothing changes to look at, but a transparent form
 * control is what makes a browser paint the select's option list itself, and
 * it gets the night edition wrong. See the note in globals.css.
 */
const control = 'text-ink bg-paper mt-1 block h-8 w-full text-base outline-none';

export function JobSearchForm({
  text,
  location,
  sponsorship,
}: {
  text: string | undefined;
  location: string | undefined;
  sponsorship: string | undefined;
}) {
  return (
    <form
      method="get"
      action="/jobs"
      role="search"
      className={cn(hairlineGrid, 'print-hide mt-8 grid-cols-1 sm:grid-cols-2')}
    >
      <HairlineCell className="py-2.5">
        <FieldLabel htmlFor="q">Role or keyword</FieldLabel>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={text ?? ''}
          placeholder="Registered nurse"
          className={cn(control, 'placeholder:text-ink-faint')}
        />
      </HairlineCell>

      <HairlineCell className="py-2.5">
        <FieldLabel htmlFor="where">Location</FieldLabel>
        <input
          id="where"
          name="where"
          type="search"
          defaultValue={location ?? ''}
          placeholder="Melbourne, or VIC"
          className={cn(control, 'placeholder:text-ink-faint')}
        />
      </HairlineCell>

      <HairlineCell className="py-2.5">
        <FieldLabel htmlFor="sponsorship">Sponsorship</FieldLabel>
        {/*
          A filter over what advertisements say, not over who may apply.
          "Mentioned" narrows the list to advertisements that mention
          sponsorship; it makes no claim about anyone's eligibility.
        */}
        <select
          id="sponsorship"
          name="sponsorship"
          defaultValue={sponsorship ?? ''}
          className={control}
        >
          <option value="">Any</option>
          <option value="MENTIONED">Mentioned in the ad</option>
          <option value="EXCLUDED">Ad says not available</option>
          <option value="NOT_MENTIONED">Not mentioned</option>
        </select>
      </HairlineCell>

      <div className="bg-paper flex">
        <Button type="submit" block className="m-2">
          Search
        </Button>
      </div>
    </form>
  );
}
