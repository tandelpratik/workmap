/**
 * The occupation control.
 *
 * A plain GET form, like the job search. The choice ends up in the URL, so it
 * is shareable, survives a reload and leaves the back button working, and the
 * page stays server-rendered with no client JavaScript. A select rather than
 * fifty-seven links because that is what a select is for, and it needs a
 * submit button precisely because there is no script to submit it on change.
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
    <form method="get" action="/map" className="border-rule-strong mt-8 border-y py-3">
      {stateCode === null ? null : <input type="hidden" name="state" value={stateCode} />}
      {regionCode === null ? null : (
        <input type="hidden" name="region" value={regionCode} />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-6">
        <div className="flex-1">
          <label
            htmlFor="occupation"
            className="text-ink-faint block font-mono text-xs tracking-widest uppercase"
          >
            Occupation
          </label>
          <select
            id="occupation"
            name="occupation"
            defaultValue={selected}
            className="text-ink border-rule mt-1 w-full max-w-lg border-b bg-transparent py-1 text-base outline-none"
          >
            {occupations.map((option) => (
              <option key={option.code} value={option.code}>
                {occupationLabel(option)}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="text-paper-raised bg-ink hover:bg-accent self-start px-5 py-2 text-sm font-medium transition-colors sm:self-auto"
        >
          Show
        </button>
      </div>
    </form>
  );
}
