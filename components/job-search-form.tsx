import { findSourceDescriptor } from '@/config/sources';
import { sponsorshipLabel, sponsorshipSignals } from '@/domain/sponsorship';
import { areaFilterLabel, areaFilters, type AreaFilter } from '@/domain/regional';
import { skillKindLabel, type SkillKind } from '@/domain/skill';
import type { SkillDefinition } from '@/skills/vocabulary';
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

/**
 * How many blank cells the grid needs so no gap shows the rule colour.
 *
 * The band's dividers are its own background showing through a one pixel gap,
 * which is what makes them one pixel at any zoom. The cost of that trick is
 * that an unoccupied grid area is not empty space, it is a panel of
 * `--color-rule`: a visible grey block beside the controls, in both editions.
 *
 * The column count changes twice, so the padding has to be worked out at each
 * breakpoint and shown only there. One column never needs any. This replaces a
 * single hand-placed filler that covered one arrangement of controls and
 * stopped being right the moment a seventh was added.
 */
function fillerCount(cells: number, columns: number): number {
  return (columns - (cells % columns)) % columns;
}

/** Skills grouped for the control, in the order the vocabulary lists them. */
function groupByKind(
  skills: readonly SkillDefinition[],
): { kind: SkillKind; entries: SkillDefinition[] }[] {
  const groups: { kind: SkillKind; entries: SkillDefinition[] }[] = [];
  for (const skill of skills) {
    const existing = groups.find((group) => group.kind === skill.kind);
    if (existing) existing.entries.push(skill);
    else groups.push({ kind: skill.kind, entries: [skill] });
  }
  return groups;
}

export function JobSearchForm({
  text,
  location,
  area,
  sponsorship,
  employmentType,
  source,
  postedWithin,
  sources,
  skill,
  skills,
}: {
  text: string | undefined;
  location: string | undefined;
  /** One of AREA_CHOICES. The page resolves the default before rendering. */
  area: string;
  sponsorship: string | undefined;
  employmentType: string | undefined;
  source: string | undefined;
  postedWithin: string | undefined;
  /** Registry keys of the sources actually holding listings. */
  sources: readonly string[];
  /** The vocabulary key of the skill filtered on, if any. */
  skill: string | undefined;
  /**
   * The vocabulary entries some live advertisement actually names.
   *
   * Passed in rather than read from the vocabulary directly, for the reason
   * the source list is passed in: a control offering a setting that returns
   * nothing is worse than a missing control, because it reports "none" where
   * the truth is "nothing here says so".
   */
  skills: readonly SkillDefinition[];
}) {
  /*
   * The controls actually rendered below. Six are unconditional; the other two
   * appear only when they have something to offer, so the count is worked out
   * here rather than written down and left to go stale.
   */
  const cells = 6 + (skills.length === 0 ? 0 : 1) + (sources.length < 2 ? 0 : 1);

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

      {/*
        Beside the location field rather than among the secondary filters. It
        qualifies the place, it is the question the product exists to answer,
        and burying it next to "posted within" would make the defining filter
        look like a refinement.
      */}
      <HairlineCell className="py-2.5">
        <FieldLabel htmlFor="area">Area</FieldLabel>
        {/*
          Built from the domain's vocabulary, which the search page and the
          public API also read. "Everywhere" is offered rather than withheld: a
          reader who wants to see what the default leaves out is entitled to,
          and hiding the rest would make the size of the regional set impossible
          to judge.
        */}
        <select id="area" name="area" defaultValue={area} className={control}>
          {Object.keys(areaFilters).map((value) => (
            <option key={value} value={value}>
              {areaFilterLabel(value as AreaFilter)}
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
          {/*
            Built from the domain's own list, weakest reading last among the
            affirmatives, so the order a reader scans matches the order of
            strength. A hand-written copy of the vocabulary is how a control
            comes to offer a setting the search does not understand.
          */}
          {sponsorshipSignals.map((signal) => (
            <option key={signal} value={signal}>
              {sponsorshipLabel(signal)}
            </option>
          ))}
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
        What the advertisement's own text names.

        Offered only over skills some live advertisement actually carries, and
        worded as a mention rather than a requirement, which is the only claim
        the extraction supports. Grouped by kind because "SAP" and "Yellow
        Card" are not the same sort of answer to "what does this job ask for",
        and ordered by the vocabulary so this control, the listing lines and
        the public API read in one order.
      */}
      {skills.length === 0 ? null : (
        <HairlineCell className="py-2.5">
          <FieldLabel htmlFor="skill">Mentions</FieldLabel>
          <select id="skill" name="skill" defaultValue={skill ?? ''} className={control}>
            <option value="">Anything</option>
            {groupByKind(skills).map((group) => (
              <optgroup key={group.kind} label={skillKindLabel(group.kind)}>
                {group.entries.map((entry) => (
                  <option key={entry.normalizedName} value={entry.normalizedName}>
                    {entry.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </HairlineCell>
      )}

      {/*
        Offered only when there is a choice to make. One source holding every
        listing makes this a control with a single meaningful setting, which is
        furniture rather than a filter.
      */}
      {sources.length < 2 ? null : (
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

      {/*
        The blanks that keep the last row from showing as a panel of rule
        colour. Two counts rather than one, because the grid is two columns at
        sm and three at lg and a single filler cannot be right at both.
      */}
      {Array.from({ length: fillerCount(cells, 2) }, (_, index) => (
        <div key={`sm-${index}`} className="bg-paper hidden sm:block lg:hidden" />
      ))}
      {Array.from({ length: fillerCount(cells, 3) }, (_, index) => (
        <div key={`lg-${index}`} className="bg-paper hidden lg:block" />
      ))}

      <div className="bg-paper flex sm:col-span-2 lg:col-span-3">
        <Button type="submit" block className="m-2">
          Search
        </Button>
      </div>
    </form>
  );
}
