import { changeBetween } from '@/domain/labour-market';
import { absenceLabel, levelLabel, regionHref, type RegionFigure } from './region-figure';

/**
 * The selected region's figures.
 *
 * Server rendered from the URL, like the map that links to it. It states the
 * exact figure rather than a shade, which is the point of selecting: the
 * choropleth encodes rank, and a reader who wants the number should get the
 * number.
 *
 * Every absence is named. "No figure" and "withheld by the publisher" are
 * different facts, and a panel that printed a dash for both would flatten them
 * (ADR-0002).
 */

const numberFormat = new Intl.NumberFormat('en-AU');
const signedFormat = new Intl.NumberFormat('en-AU', { signDisplay: 'always' });
const percentFormat = new Intl.NumberFormat('en-AU', {
  signDisplay: 'always',
  maximumFractionDigits: 1,
});

const monthFormat = new Intl.DateTimeFormat('en-AU', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-rule flex items-baseline justify-between gap-6 border-b py-2 last:border-b-0">
      <dt className="text-ink-muted text-sm">{label}</dt>
      <dd className="text-ink text-right text-sm">{children}</dd>
    </div>
  );
}

export function RegionDetail({
  region,
  rank,
  of,
  previousPeriod,
  stateCode,
  drilldown,
}: {
  region: RegionFigure;
  /** Position among regions that carry a figure, 1 being the most. */
  rank: number | null;
  of: number;
  /** The period the comparison is against, where one is held. */
  previousPeriod: Date | null;
  /** The state being viewed, or null on the national map. */
  stateCode: string | null;
  /** Where the drilldown leads, absent when already there or unknown. */
  drilldown: { code: string; name: string } | null;
}) {
  const change = changeBetween(region.observation, region.previous);
  const value = region.observation.value;

  return (
    <section
      aria-labelledby="region-detail-heading"
      className="border-rule-strong bg-paper-raised mt-8 border-t p-5"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2
          id="region-detail-heading"
          className="text-ink font-serif text-2xl font-semibold"
        >
          {region.name}
        </h2>
        {/*
          Clearing the selection is a link to the unselected URL, so it works
          the same way selecting did, back button included.
        */}
        <a
          href={regionHref(null, stateCode)}
          className="text-ink-muted hover:text-ink text-sm underline underline-offset-4"
        >
          Clear
        </a>
      </div>

      <dl className="mt-4">
        <Row label="Advertisements">
          {value === null ? (
            <span className="text-ink-muted">
              {absenceLabel(region.observation.valueState)}
            </span>
          ) : (
            <span className="font-mono tabular-nums">{numberFormat.format(value)}</span>
          )}
        </Row>

        <Row label="Change on the month before">
          {change === null ? (
            <span className="text-ink-muted">
              {/*
                Two reasons produce no change, and they are not the same. Say
                which one rather than printing a dash.
              */}
              {previousPeriod === null
                ? 'No earlier month held'
                : `Not published for ${monthFormat.format(previousPeriod)}`}
            </span>
          ) : (
            <span className="font-mono tabular-nums">
              {signedFormat.format(change.absolute)}
              {change.percent === null
                ? ''
                : ` (${percentFormat.format(change.percent)}%)`}
              {/*
                The words carry the direction. An arrow or a colour alone would
                fail a reader who cannot resolve either.
              */}
              <span className="text-ink-muted ml-2 font-sans">
                {change.direction === 'UP'
                  ? 'more than the month before'
                  : change.direction === 'DOWN'
                    ? 'fewer than the month before'
                    : 'unchanged'}
              </span>
            </span>
          )}
        </Row>

        <Row label="Rank">
          {rank === null ? (
            <span className="text-ink-muted">Not ranked, no figure</span>
          ) : (
            <span className="tabular-nums">
              {rank} of {of} by number of advertisements
            </span>
          )}
        </Row>

        <Row label="Area type">{levelLabel(region.level)}</Row>

        {/* Provenance: the publisher's own code, so a figure can be traced. */}
        <Row label="ASGS code">
          <span className="font-mono text-xs">{region.code}</span>
        </Row>
      </dl>

      {drilldown === null ? null : (
        <p className="mt-4 text-sm">
          {/*
            The way in. Selecting tells the reader about one region; this is
            the question that usually follows, which is what the rest of its
            state looks like.
          */}
          <a
            href={regionHref(region.code, drilldown.code)}
            className="text-ink hover:text-accent underline underline-offset-4"
          >
            See all of {drilldown.name}
          </a>
        </p>
      )}
    </section>
  );
}

/**
 * What the panel shows when the URL names a region the dataset does not have.
 *
 * A query string is external input, so it is validated and answered rather
 * than trusted. Saying nothing would leave a reader who followed a stale link
 * with a map that silently ignored them.
 */
export function RegionNotFound({ code }: { code: string }) {
  return (
    <section className="border-rule-strong mt-8 border-t pt-5">
      <h2 className="text-ink font-serif text-2xl font-semibold">Region not found</h2>
      <p className="text-ink-muted max-w-measure mt-3 text-sm leading-relaxed">
        Nothing in this release is published under the code{' '}
        <span className="font-mono text-xs">{code}</span>. It may belong to a different
        ASGS edition, or to a level this index does not report on.{' '}
        <a href={regionHref(null)} className="text-ink underline underline-offset-4">
          Show the whole map
        </a>
        .
      </p>
    </section>
  );
}

/**
 * When the selected region is not in the state being shown.
 *
 * Drilling into Victoria with Greater Sydney selected is not an error and not
 * nothing: the region exists, it is simply elsewhere. Saying so and offering
 * the way to it beats dropping the selection without comment.
 */
export function RegionElsewhere({
  name,
  where,
  href,
}: {
  name: string;
  where: string;
  href: string;
}) {
  return (
    <p className="border-rule text-ink-muted mt-8 border-t pt-5 text-sm leading-relaxed">
      {name} is in {where}, so it is not shown on this map.{' '}
      <a href={href} className="text-ink underline underline-offset-4">
        Show {name}
      </a>
      .
    </p>
  );
}

/**
 * The trail back out of a drilldown.
 *
 * An ordered list because that is what it is, and a nav landmark because a
 * reader navigating by landmark should find it. The current place is text
 * rather than a link to itself.
 */
export function Breadcrumb({
  state,
  regionCode,
}: {
  state: { code: string; name: string } | null;
  /** Kept when stepping out, so widening the view does not lose the selection. */
  regionCode: string | null;
}) {
  if (state === null) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="text-ink-muted flex flex-wrap items-center gap-2 text-sm">
        <li>
          <a
            href={regionHref(regionCode, null)}
            className="text-ink hover:text-accent underline underline-offset-4"
          >
            Australia
          </a>
        </li>
        <li aria-hidden="true" className="text-ink-faint">
          /
        </li>
        <li aria-current="page" className="text-ink font-medium">
          {state.name}
        </li>
      </ol>
    </nav>
  );
}
