import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { hairlineGrid, HairlineCell } from '@/components/ui/hairline-grid';
import { FieldLabel } from '@/components/ui/label';

/**
 * The occupation control.
 *
 * A plain GET form, like the job search. The choice ends up in the URL, so it
 * is shareable, survives a reload and leaves the back button working, and the
 * page stays server-rendered with no client JavaScript. A select rather than
 * fifty-seven links because that is what a select is for, and it needs a
 * submit button precisely because there is no script to submit it on change.
 *
 * Set as one slim instrument bar above the figure rather than as a bordered
 * block of its own. A control that occupies a screen's worth of height before
 * the graphic it controls has the priority backwards. It shares the hairline
 * grid with the job search bar, so the two controls are visibly the same
 * instrument in two places rather than two things that resemble each other.
 *
 * The state and the selected region ride along as hidden fields. Choosing an
 * occupation should change the figures and nothing else: a reader looking at
 * Greater Sydney inside New South Wales must not be thrown back to the
 * national map for asking about nurses.
 */

/**
 * One occupation, as the view layer needs it.
 *
 * Declared here rather than imported from the repository, because components
 * must not depend on persistence (ADR-0001, and lint enforces it). The page is
 * what turns a stored row into this.
 *
 * `name` is nullable because the source does not always give a code one name.
 * JSA labels its all-occupations row per region, so code "0" arrives with
 * fifty names and therefore none.
 */
export interface OccupationChoice {
  readonly code: string;
  readonly name: string | null;
}

/**
 * How an occupation is offered to a reader.
 *
 * JSA names its all-occupations row after the region it belongs to, so code
 * "0" has fifty names and no name. Ours is used there, and it is our own
 * labelling rather than the publisher's, which is why it is written here in
 * the view and not stored in the database beside their words (ADR-0002).
 */
export function occupationLabel(option: OccupationChoice): string {
  if (option.name !== null) return `${option.name} (${option.code})`;
  return option.code === '0' ? 'All occupations' : `Code ${option.code}`;
}

export function OccupationFilter({
  occupations,
  selected,
  stateCode,
  regionCode,
}: {
  occupations: readonly OccupationChoice[];
  selected: string;
  stateCode: string | null;
  regionCode: string | null;
}) {
  if (occupations.length < 2) return null;

  return (
    <form
      method="get"
      action="/map"
      className={cn(
        hairlineGrid,
        'print-hide mt-8 grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto]',
      )}
    >
      {stateCode === null ? null : <input type="hidden" name="state" value={stateCode} />}
      {regionCode === null ? null : (
        <input type="hidden" name="region" value={regionCode} />
      )}

      <HairlineCell className="py-2.5">
        <FieldLabel htmlFor="occupation">Occupation</FieldLabel>
        <select
          id="occupation"
          name="occupation"
          defaultValue={selected}
          /* Not transparent: see the select note in globals.css. */
          className="text-ink bg-paper mt-1 block h-8 w-full text-base outline-none"
        >
          {occupations.map((option) => (
            <option key={option.code} value={option.code}>
              {occupationLabel(option)}
            </option>
          ))}
        </select>
      </HairlineCell>

      <div className="bg-paper flex">
        <Button type="submit" block className="m-2 sm:w-auto">
          Show
        </Button>
      </div>
    </form>
  );
}
