import { findSourceDescriptor } from '@/config/sources';
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
 * One instrument bar rather than six stacked bordered strips, built on the
 * shared hairline grid so its seams match the occupation filter and the
 * release strip exactly.
 *
 * Every control is 44 pixels tall, which is the claim this comment used to make
 * while the inputs were 32. Thirty-two clears WCAG 2.2 AA, whose minimum is 24,
 * so nothing was failing; it was simply not what the file said, and on a phone
 * this bar is the first thing a thumb meets.
 *
 * **Every filter here is one the stored data actually supports**, which is a
 * rule rather than an observation. Two were considered and rejected against the
 * corpus as it stands:
 *
 *   - **Remote or hybrid.** The column exists and both adapters write null to
 *     it, so the filter would be present, plausible, and return nothing on
 *     every setting. A control that cannot work is worse than a missing one: it
 *     tells a reader the answer is "none" when the answer is "unknown".
 *   - **Salary.** Nine listings of 2,713 state one. A salary filter would hide
 *     99.7% of the index and look broken doing it, and a range filter would
 *     additionally have to reconcile hourly and yearly figures that nothing
 *     normalises yet.
 *
 * Both are worth revisiting when a source starts supplying them, and neither is
 * worth shipping now.
 */

/**
 * Shared by both text inputs and the selects, so they sit on one baseline.
 *
 * The ground is stated rather than left transparent. It is the same colour as
 * the cell behind it, so nothing changes to look at, but a transparent form
 * control is what makes a browser paint the select's option list itself, and
 * it gets the night edition wrong. See the note in globals.css.
 */
const control = 'text-ink bg-paper mt-1 block h-11 w-full text-base outline-none';

/** How recently an advertisement was posted, by the employer's own date. */
const POSTED_CHOICES = [
  { value: '3', label: 'Last 3 days' },
  { value: '7', label: 'Last week' },
  { value: '14', label: 'Last fortnight' },
  { value: '30', label: 'Last month' },
] as const;

export function JobSearchForm({
  text,
  location,
  sponsorship,
  employmentType,
  source,
  postedWithin,
  sources,
}: {
  text: string | undefined;
  location: string | undefined;
  sponsorship: string | undefined;
  employmentType: string | undefined;
  source: string | undefined;
  postedWithin: string | undefined;
  /** Registry keys of the sources actually holding listings. */
  sources: readonly string[];
}) {
  return (
    <form
      method="get"
      action="/jobs"
      role="search"
      className={cn(
        hairlineGrid,
        'print-hide mt-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
      )}
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
          <option value="TEMPORARY">Temporary</option>
        </select>
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

      <HairlineCell className="py-2.5">
        <FieldLabel htmlFor="posted">Posted</FieldLabel>
        <select
          id="posted"
          name="posted"
          defaultValue={postedWithin ?? ''}
          className={control}
        >
          <option value="">Any time</option>
          {POSTED_CHOICES.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </select>
      </HairlineCell>

      {/*
        Offered only when there is a choice to make. One source holding every
        listing makes this a control with a single meaningful setting, which is
        furniture rather than a filter.
      */}
      {sources.length < 2 ? (
        <div className="bg-paper hidden lg:block" />
      ) : (
        <HairlineCell className="py-2.5">
          <FieldLabel htmlFor="source">Source</FieldLabel>
          <select
            id="source"
            name="source"
            defaultValue={source ?? ''}
            className={control}
          >
            <option value="">Any source</option>
            {sources.map((key) => (
              <option key={key} value={key}>
                {findSourceDescriptor(key)?.displayName ?? key}
              </option>
            ))}
          </select>
        </HairlineCell>
      )}

      <div className="bg-paper flex sm:col-span-2 lg:col-span-3">
        <Button type="submit" block className="m-2">
          Search
        </Button>
      </div>
    </form>
  );
}
