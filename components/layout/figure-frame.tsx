/**
 * The frame every graphic is published in.
 *
 * Title, subtitle, graphic, key, source: the shape a chart takes in a
 * newspaper's data section or a statistical release, and the reason those
 * graphics survive being screenshotted and pasted elsewhere. Each one carries
 * everything needed to read it.
 *
 * It is framed by rules rather than by a border box, because a box makes it a
 * card and this product is not a dashboard of cards. A heavy rule above and a
 * hairline below is how a printed figure is set off from its page.
 *
 * The subtitle is not decoration. It is where the reference period and the
 * unit go, and the unit here is "advertisements", which is the one thing a
 * reader must not mistake for "vacancies" (constitution: data integrity).
 */

export function FigureFrame({
  title,
  subtitle,
  source,
  legend,
  aside,
  children,
}: {
  title: string;
  /** Reference period and unit. What the numbers are, in one line. */
  subtitle?: string | undefined;
  /** The attribution the licence requires, verbatim. */
  source?: string | undefined;
  /** The key, drawn under the graphic where it is read. */
  legend?: React.ReactNode;
  /** A control or escape hatch, set against the title. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <figure className="border-rule-heavy m-0 border-t-2">
      <figcaption className="border-rule flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b py-3">
        <div className="min-w-0">
          <h2 className="text-ink text-base leading-snug font-semibold">{title}</h2>
          {subtitle === undefined ? null : (
            <p className="text-ink-muted mt-1 text-sm leading-snug text-pretty">
              {subtitle}
            </p>
          )}
        </div>
        {aside === undefined ? null : <div className="shrink-0">{aside}</div>}
      </figcaption>

      <div className="py-5">{children}</div>

      {legend === undefined ? null : <div className="pb-5">{legend}</div>}

      {source === undefined ? null : (
        <div className="border-rule border-t py-3">
          <p className="text-ink-faint text-xs leading-relaxed">
            <span className="text-label font-mono uppercase">Source</span>{' '}
            <span className="ml-1">{source}</span>
          </p>
        </div>
      )}
    </figure>
  );
}
