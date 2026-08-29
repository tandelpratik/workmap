/**
 * The search control.
 *
 * A plain GET form. No client JavaScript, so it works before hydration and
 * without it, the query lives in the URL and is therefore shareable and
 * bookmarkable, and the back button behaves. Rules rather than boxes, per the
 * design system.
 */

export function JobSearchForm({
  text,
  location,
}: {
  text: string | undefined;
  location: string | undefined;
}) {
  return (
    <form method="get" action="/" className="mt-8" role="search">
      <div className="border-rule-strong flex flex-col gap-px border-y sm:flex-row sm:gap-0">
        <div className="flex-1 py-3 sm:pr-6">
          <label
            htmlFor="q"
            className="text-ink-faint block font-mono text-xs tracking-widest uppercase"
          >
            Role or keyword
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={text ?? ''}
            placeholder="Registered nurse"
            className="text-ink placeholder:text-ink-faint mt-1 w-full bg-transparent text-base outline-none"
          />
        </div>

        <div className="border-rule flex-1 border-t py-3 sm:border-t-0 sm:border-l sm:pr-6 sm:pl-6">
          <label
            htmlFor="where"
            className="text-ink-faint block font-mono text-xs tracking-widest uppercase"
          >
            Location
          </label>
          <input
            id="where"
            name="where"
            type="search"
            defaultValue={location ?? ''}
            placeholder="Melbourne, or VIC"
            className="text-ink placeholder:text-ink-faint mt-1 w-full bg-transparent text-base outline-none"
          />
        </div>

        <div className="border-rule flex items-center border-t py-3 sm:border-t-0 sm:border-l sm:pl-6">
          <button
            type="submit"
            className="text-paper-raised bg-ink hover:bg-accent px-5 py-2 text-sm font-medium transition-colors"
          >
            Search
          </button>
        </div>
      </div>
    </form>
  );
}
