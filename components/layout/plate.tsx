/**
 * The plate.
 *
 * An atlas is laid out in plates: one dominant graphic with its marginalia
 * beside it, on a grid that holds across every sheet in the volume. That is
 * the structure here, and it is the whole reason this file exists. Before it,
 * every page was the same centred column with a heading, a paragraph and a
 * stack of rules, which is a shape that says nothing about what the page is
 * for.
 *
 * On a narrow screen the plate is one column and the marginalia fall under the
 * graphic they annotate, in the order a reader would want them: the figure,
 * then what was selected, then the table, then the notes.
 *
 * Nothing here is a card. There are no shadows, no corner radii and no filled
 * panels: separation is carried by hairlines and whitespace, which is how a
 * printed page does it and why a printed page does not look like software.
 */

/** How wide the page runs. A plate is wider than a text column, on purpose. */
type Width = 'plate' | 'column';

const widths: Record<Width, string> = {
  plate: 'max-w-plate',
  column: 'max-w-column',
};

export function PageBody({
  width = 'plate',
  children,
}: {
  width?: Width;
  children: React.ReactNode;
}) {
  return (
    <main
      id="main"
      className={`${widths[width]} mx-auto px-5 pt-8 pb-16 sm:px-8 sm:pt-12 sm:pb-24`}
    >
      {children}
    </main>
  );
}

/**
 * The line above the headline: what this page is, in the publisher's terms.
 *
 * It replaces the one-word kicker the pages used to carry. "WHERE" told a
 * reader nothing the navigation had not already said; the dataset and its
 * reference period tell them what they are looking at.
 */
export function Dateline({ children }: { children: React.ReactNode }) {
  return <p className="text-ink-faint text-label font-mono uppercase">{children}</p>;
}

export function PageTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-ink text-title mt-3 font-serif font-semibold text-balance">
      {children}
    </h1>
  );
}

/**
 * The standfirst: one sentence, set larger than body copy.
 *
 * Deliberately short. The pages used to open with three paragraphs of
 * qualification before a reader reached a single figure, which buried the data
 * under its own caveats. The qualification is still on the page, in `Notes`,
 * under the graphic it qualifies, where a reader looks for it.
 */
export function Lede({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-ink-muted max-w-measure mt-4 text-lg leading-relaxed text-pretty">
      {children}
    </p>
  );
}

/**
 * The plate itself: a graphic, its margin, and whatever runs under the
 * graphic at full width.
 *
 * The three regions are placed explicitly rather than left to document order,
 * because the two orders wanted are different. On a wide screen the margin
 * stands beside both the graphic and the table it annotates. On a phone there
 * is one column, and the reader wants the figures for the region they just
 * selected immediately under the map rather than below fifty table rows.
 * Naming the cells is what lets one document serve both.
 */
export function Plate({
  margin,
  below,
  children,
}: {
  /** Marginalia: the selection, the key, how to read the graphic. */
  margin?: React.ReactNode;
  /** Full-width content under the graphic, typically the table. */
  below?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-10 grid grid-cols-1 gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="min-w-0 lg:col-start-1 lg:row-start-1">{children}</div>

      {margin === undefined ? null : (
        /*
          Sticky once there is a column beside it to be sticky against, so a
          reader scrolling a fifty-row table keeps the figures for the region
          they selected in view.
        */
        <aside className="border-rule min-w-0 lg:sticky lg:top-6 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start lg:border-l lg:pl-8">
          {margin}
        </aside>
      )}

      {below === undefined ? null : (
        <div className="min-w-0 lg:col-start-1 lg:row-start-2">{below}</div>
      )}
    </div>
  );
}

/**
 * The notes under a figure.
 *
 * Numbered, because they are referred to, and always rendered rather than
 * hidden behind a disclosure. What the Internet Vacancy Index does and does
 * not count is not an optional detail, and the constitution requires it be
 * stated wherever the figures appear. Putting it here rather than above the
 * graphic changes where a reader meets it, not whether they do.
 */
export function Notes({
  title = 'Notes',
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="border-rule-strong mt-12 border-t pt-5">
      <h2 className="text-ink-faint text-label font-mono uppercase">{title}</h2>
      <ol className="text-ink-muted mt-4 grid grid-cols-1 gap-x-10 gap-y-3 text-xs leading-relaxed md:grid-cols-2">
        {children}
      </ol>
    </section>
  );
}

export function Note({ children }: { children: React.ReactNode }) {
  return (
    <li className="marker:text-ink-faint ml-4 list-decimal pl-1 marker:font-mono marker:text-[0.625rem]">
      {children}
    </li>
  );
}

/**
 * A short statement about the state of the page itself.
 *
 * Used where the reader asked for something that could not be given: a state
 * code that is not one, an occupation this release does not report. The rule
 * down its left is the only place the accent is used as a marker rather than
 * as a link colour, and the sentence still says what happened, so nothing here
 * depends on seeing the rule.
 */
export function Advisory({ children }: { children: React.ReactNode }) {
  return (
    <p className="border-accent text-ink-muted max-w-measure mt-6 border-l-2 py-1 pl-4 text-sm leading-relaxed">
      {children}
    </p>
  );
}
