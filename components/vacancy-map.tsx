import type { Bin, ChoroplethGeometry } from '@/geography/choropleth';
import { binFor } from '@/geography/choropleth';
import { regionHref, type RegionFigure } from './region-figure';
import { Label } from '@/components/ui/label';

/**
 * Regional vacancy choropleth.
 *
 * Rendered on the server as static SVG. No map library reaches the browser:
 * the national view does not pan or zoom, so shipping a tile engine to draw it
 * would be cost without benefit.
 *
 * Interaction is links, not scripts. Each region is an anchor to
 * `/map?region=<code>`, so selecting one is a navigation: it works without
 * JavaScript, survives a reload, is shareable, and is keyboard operable
 * because links already are. That is the whole mechanism.
 *
 * Accessibility (constitution): the map is never the only representation. The
 * page pairs it with a table of the same figures, and each region link carries
 * its name and figure as its accessible name, so the map is navigable rather
 * than an opaque picture. On a phone the table is also the practical control:
 * an SA4 boundary drawn 350 pixels wide is too small to hit reliably, and the
 * table's rows are the same links at a size a thumb can use.
 */

const SCALE_FILLS = [
  'var(--color-scale-1)',
  'var(--color-scale-2)',
  'var(--color-scale-3)',
  'var(--color-scale-4)',
  'var(--color-scale-5)',
];

export function fillForStep(step: number): string {
  return SCALE_FILLS[Math.min(step, SCALE_FILLS.length - 1)] ?? SCALE_FILLS[0]!;
}

const numberFormat = new Intl.NumberFormat('en-AU');

/**
 * One region's hover and screen-reader label.
 *
 * A single string on purpose. React renders an SVG <title> with more than one
 * child as empty, so writing this inline as text plus an expression silently
 * produced fifty blank titles, which is worse than no title at all: the
 * element is there, announces nothing, and looks correct in the source.
 */
export function regionTitle(name: string, value: number | null): string {
  const figure =
    value === null
      ? 'no figure published'
      : `${numberFormat.format(value)} advertisements`;
  return `${name}: ${figure}`;
}

export function VacancyMap({
  geometry,
  regions,
  bins,
  tableId,
  selectedCode,
  stateCode,
  idPrefix = 'map',
}: {
  geometry: ChoroplethGeometry;
  regions: readonly RegionFigure[];
  bins: readonly Bin[];
  /** The table carrying the same figures, for the accessible description. */
  tableId: string;
  /** The selected region's code, or null when nothing is selected. */
  selectedCode: string | null;
  /** The state being viewed, carried through every link so it survives. */
  stateCode: string | null;
  /**
   * Namespace for the ids this map defines. Only needed if two maps ever share
   * a document, since duplicate ids would make the second one reference the
   * first one's shapes.
   */
  idPrefix?: string;
}) {
  const drawn = regions
    .map((region) => {
      const area = geometry.areasByCode.get(region.code);
      if (area === undefined) return null;
      const value = region.observation.value;
      const bin = value === null ? null : binFor(bins, value);
      return { region, area, value, bin };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  const selected = drawn.find((entry) => entry.region.code === selectedCode) ?? null;

  /*
    One definition per distinct shape, referenced by every layer that paints
    it. Three layers wanted the same geometry: the base fill under the data,
    the base outline over it, and, where the data is reported at the level the
    base is drawn at, the data itself. Emitting the path strings once each
    instead of three times is most of the weight of this page.

    Keyed by code, which is safe because a code names one area: a state's "1"
    and an SA4's "101" are different keys, and where the base and the data do
    share a code they are the same feature from the same file.
  */
  const shapes = new Map<string, string>();
  for (const area of geometry.base) shapes.set(area.code, area.d);
  for (const { area } of drawn) shapes.set(area.code, area.d);

  const shapeId = (code: string): string => `${idPrefix}-shape-${code}`;

  return (
    <svg
      viewBox={`0 0 ${String(geometry.width)} ${String(geometry.height)}`}
      // Bounded rather than simply full width. Past about 42rem the map stops
      // gaining legibility and starts pushing the figures below it off the
      // screen, which is the opposite of what a wider display should do.
      className="mx-auto block h-auto w-full max-w-[42rem]"
      // Not role="img": that would prune the region links from the
      // accessibility tree while leaving them focusable, which is the worst
      // of both. It is a group of links, and it says so.
      role="group"
      aria-describedby={tableId}
      aria-label="Online job advertisements by region. Each region is a link to its figures, and the same figures are listed in the table below."
    >
      {/*
        A <use> inherits fill and stroke from where it is referenced rather
        than from where it was defined, so one definition can be painted three
        different ways by the three groups below.
      */}
      <defs>
        {[...shapes].map(([code, d]) => (
          <path key={`def-${code}`} id={shapeId(code)} d={d} />
        ))}
      </defs>

      {/*
        State outlines beneath the data. They are what makes a partial map
        honest: a region with no figure is visibly inside a country that has
        been drawn, rather than simply absent from a blank page.
      */}
      <g fill="var(--color-paper-sunken)" stroke="var(--color-rule)" strokeWidth={0.5}>
        {geometry.base.map((area) => (
          <use key={`base-${area.code}`} href={`#${shapeId(area.code)}`} />
        ))}
      </g>

      <g stroke="var(--color-paper)" strokeWidth={0.4}>
        {drawn.map(({ region, area, value, bin }) => (
          <a
            key={region.code}
            href={regionHref(
              region.code === selectedCode ? null : region.code,
              stateCode,
            )}
            className="map-region"
            aria-label={regionTitle(region.name, value)}
            aria-current={region.code === selectedCode ? 'true' : undefined}
          >
            <use
              href={`#${shapeId(area.code)}`}
              fill={bin === null ? 'var(--color-scale-none)' : fillForStep(bin.step)}
            >
              {/* Pointer users get the same label as a native tooltip. */}
              <title>{regionTitle(region.name, value)}</title>
            </use>
          </a>
        ))}
      </g>

      {/* Outlines last, so borders are not overpainted by neighbours. */}
      <g fill="none" stroke="var(--color-rule-strong)" strokeWidth={0.6}>
        {geometry.base.map((area) => (
          <use key={`edge-${area.code}`} href={`#${shapeId(area.code)}`} />
        ))}
      </g>

      {/*
        The selection, drawn above everything. Painting it in place would let
        a neighbour drawn later cover the outline on the shared border, which
        is exactly where the reader is looking. Shape, not colour: the border
        is heavier, and the panel and the table say which region it is.
      */}
      {selected === null ? null : (
        <use
          href={`#${shapeId(selected.area.code)}`}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth={1.6}
          strokeLinejoin="round"
          aria-hidden="true"
        />
      )}
    </svg>
  );
}

/**
 * The key.
 *
 * Drawn as one continuous strip with the band boundaries printed beneath it,
 * which is how a sequential scale is keyed in an atlas: the reader sees a
 * single ordered ramp and reads values off it like an axis. Five detached
 * swatches with five ranges beside them said the same thing while looking like
 * five categories, which is precisely what a sequential scale is not.
 *
 * The real numbers are printed because quantile shading encodes rank rather
 * than magnitude. Without them a reader could reasonably infer that the
 * darkest band is five times the lightest, which it is not.
 */
export function VacancyLegend({
  bins,
  hasMissing,
}: {
  bins: readonly Bin[];
  hasMissing: boolean;
}) {
  if (bins.length === 0) return null;

  const last = bins[bins.length - 1]!;

  return (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
      <div className="min-w-0 flex-1 basis-64">
        <Label as="h3">Advertisements per region</Label>

        <div className="border-rule-strong mt-2 flex border" aria-hidden="true">
          {bins.map((bin) => (
            <span
              key={bin.step}
              className="h-3 flex-1"
              style={{ backgroundColor: fillForStep(bin.step) }}
            />
          ))}
        </div>

        {/*
          Boundaries, not band labels: each figure sits at the left edge of the
          band it opens, and the last one closes the scale. That reads as an
          axis and fits a phone, which five hyphenated ranges did not.
        */}
        <div className="tabular text-ink-muted mt-1.5 flex font-mono text-[0.625rem]">
          {bins.map((bin) => (
            <span key={bin.step} className="flex-1">
              {numberFormat.format(bin.min)}
            </span>
          ))}
          <span>{numberFormat.format(last.max)}</span>
        </div>
      </div>

      {hasMissing ? (
        <p className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="border-rule-strong inline-block h-3 w-6 border"
            style={{ backgroundColor: 'var(--color-scale-none)' }}
          />
          <span className="text-ink-muted text-xs">No figure published</span>
        </p>
      ) : null}
    </div>
  );
}
