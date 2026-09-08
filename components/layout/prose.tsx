import { Label } from '@/components/ui/label';

/**
 * Long-form pages.
 *
 * The atlas plate is for a graphic with its marginalia. Methodology and
 * licensing are neither: they are documents, read top to bottom, and they need
 * a different set of parts. What they must not become is the wall of small grey
 * text that a legal page usually is, because a reader who cannot get through
 * the page cannot check the thing it explains, and being checkable is the whole
 * point of publishing it.
 *
 * So the same rules as everywhere else apply. Hairlines rather than boxes, the
 * measure held at a readable width, headings that a screen reader can navigate,
 * and nothing that needs a script.
 */

/**
 * A numbered section with a rule over it.
 *
 * The id is not decoration. These pages are cited: a figure elsewhere on the
 * site links to the paragraph that explains it, and a paragraph that cannot be
 * linked to is one a reader has to go hunting for.
 */
export function Section({
  id,
  title,
  kicker,
  children,
}: {
  id: string;
  title: string;
  /** What this section is about, above the heading. */
  kicker?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="border-rule-strong mt-14 scroll-mt-8 border-t pt-6">
      {kicker === undefined ? null : <Label>{kicker}</Label>}
      <h2 className="text-ink mt-2 font-serif text-2xl font-semibold text-balance">
        <a href={`#${id}`} className="hover:text-accent no-underline">
          {title}
        </a>
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A stack of paragraphs at a readable measure. */
export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-ink-muted max-w-measure space-y-4 text-sm leading-relaxed">
      {children}
    </div>
  );
}

/**
 * A term and what it means.
 *
 * Used for the vocabularies these pages have to define: value states,
 * sponsorship signals, rights positions. A table would imply the terms are
 * comparable along some axis, and they are not; they are definitions.
 */
export function Definitions({ children }: { children: React.ReactNode }) {
  return <dl className="border-rule-heavy mt-5 border-t-2">{children}</dl>;
}

export function Definition({
  term,
  children,
}: {
  term: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border-rule grid grid-cols-1 gap-x-6 gap-y-1 border-b py-3 sm:grid-cols-[13rem_minmax(0,1fr)]">
      <dt className="text-ink text-sm font-medium">{term}</dt>
      <dd className="text-ink-muted max-w-measure text-sm leading-relaxed">{children}</dd>
    </div>
  );
}

/**
 * The table of contents.
 *
 * Plain anchors, so it works with no JavaScript and survives being printed.
 * A document long enough to need explaining is long enough to need a way in.
 */
export function Contents({
  items,
}: {
  items: readonly { readonly id: string; readonly title: string }[];
}) {
  return (
    <nav aria-label="On this page" className="border-rule-heavy mt-10 border-t-2 pt-5">
      <Label as="h2">On this page</Label>
      <ol className="text-ink-muted mt-4 grid grid-cols-1 gap-x-10 gap-y-2 text-sm sm:grid-cols-2">
        {items.map((item, index) => (
          <li key={item.id} className="flex gap-3">
            <span className="text-ink-faint text-label pt-1 font-mono">
              {String(index + 1).padStart(2, '0')}
            </span>
            <a href={`#${item.id}`} className="hover:text-ink underline-offset-4">
              {item.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
