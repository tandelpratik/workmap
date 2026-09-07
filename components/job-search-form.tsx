/**
 * The search control.
 *
 * A plain GET form. No client JavaScript, so it works before hydration and
 * without it, the query lives in the URL and is therefore shareable and
 * bookmarkable, and the back button behaves.
 *
 * One instrument bar rather than four stacked bordered strips. The hairlines
 * are the grid's gap showing the ground through, which is what keeps a seam at
 * exactly one pixel whether the bar is folded into a single column on a phone
 * or opened out into two. Every control is at least a 44px target, because on
 * a phone this is the first thing a thumb meets.
 *
 * Two columns at most, never four. Tailwind's breakpoints measure the viewport
 * and this form sits in a column a little over forty rems wide, so a four
 * column layout at a desktop breakpoint would divide seven hundred pixels
 * between four controls rather than the full width it appeared to ask for.
 */

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
      className="border-rule bg-rule print-hide mt-8 grid grid-cols-1 gap-px border sm:grid-cols-2"
    >
      <div className="bg-paper px-4 py-2.5">
        <label
          htmlFor="q"
          className="text-ink-faint text-label block font-mono uppercase"
        >
          Role or keyword
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={text ?? ''}
          placeholder="Registered nurse"
          className="text-ink placeholder:text-ink-faint mt-1 block h-8 w-full bg-transparent text-base outline-none"
        />
      </div>

      <div className="bg-paper px-4 py-2.5">
        <label
          htmlFor="where"
          className="text-ink-faint text-label block font-mono uppercase"
        >
          Location
        </label>
        <input
          id="where"
          name="where"
          type="search"
          defaultValue={location ?? ''}
          placeholder="Melbourne, or VIC"
          className="text-ink placeholder:text-ink-faint mt-1 block h-8 w-full bg-transparent text-base outline-none"
        />
      </div>

      <div className="bg-paper px-4 py-2.5">
        <label
          htmlFor="sponsorship"
          className="text-ink-faint text-label block font-mono uppercase"
        >
          Sponsorship
        </label>
        {/*
          A filter over what advertisements say, not over who may apply.
          "Mentioned" narrows the list to advertisements that mention
          sponsorship; it makes no claim about anyone's eligibility.
        */}
        <select
          id="sponsorship"
          name="sponsorship"
          defaultValue={sponsorship ?? ''}
          className="text-ink mt-1 block h-8 w-full bg-transparent text-base outline-none"
        >
          <option value="">Any</option>
          <option value="MENTIONED">Mentioned in the ad</option>
          <option value="EXCLUDED">Ad says not available</option>
          <option value="NOT_MENTIONED">Not mentioned</option>
        </select>
      </div>

      <div className="bg-paper flex">
        <button
          type="submit"
          className="text-paper-raised bg-ink hover:bg-accent m-2 min-h-11 w-full px-6 text-sm font-medium transition-colors"
        >
          Search
        </button>
      </div>
    </form>
  );
}
