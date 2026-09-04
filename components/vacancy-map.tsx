import type { Bin, ChoroplethGeometry } from '@/geography/choropleth';
import { binFor } from '@/geography/choropleth';
import { regionHref, type RegionFigure } from './region-figure';

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
 * than an opaque picture.
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
}: {
  geometry: ChoroplethGeometry;
  regions: readonly RegionFigure[];
  bins: readonly Bin[];
  /** The table carrying the same figures, for the accessible description. */
  tableId: string;
  /** The selected region's code, or null when nothing is selected. */
  selectedCode: string | null;
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

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${String(geometry.width)} ${String(geometry.height)}`}
        className="h-auto w-full"
        // Not role="img": that would prune the region links from the
        // accessibility tree while leaving them focusable, which is the worst
        // of both. It is a group of links, and it says so.
        role="group"
        aria-describedby={tableId}
        aria-label="Online job advertisements by region. Each region is a link to its figures, and the same figures are listed in the table below."
      >
        {/*
          State outlines beneath the data. They are what makes a partial map
          honest: a region with no figure is visibly inside a country that has
          been drawn, rather than simply absent from a blank page.
        */}
        <g fill="var(--color-paper-sunken)" stroke="var(--color-rule)" strokeWidth={0.5}>
          {geometry.base.map((area) => (
            <path key={`base-${area.code}`} d={area.d} />
          ))}
        </g>

        <g stroke="var(--color-paper)" strokeWidth={0.4}>
          {drawn.map(({ region, area, value, bin }) => (
            <a
              key={region.code}
              href={regionHref(region.code === selectedCode ? null : region.code)}
              className="map-region"
              aria-label={regionTitle(region.name, value)}
              aria-current={region.code === selectedCode ? 'true' : undefined}
            >
              <path
                d={area.d}
                fill={bin === null ? 'var(--color-scale-none)' : fillForStep(bin.step)}
              >
                {/* Pointer users get the same label as a native tooltip. */}
                <title>{regionTitle(region.name, value)}</title>
              </path>
            </a>
          ))}
        </g>

        {/* Outlines last, so borders are not overpainted by neighbours. */}
        <g fill="none" stroke="var(--color-rule-strong)" strokeWidth={0.6}>
          {geometry.base.map((area) => (
            <path key={`edge-${area.code}`} d={area.d} />
          ))}
        </g>

        {/*
          The selection, drawn above everything. Painting it in place would let
          a neighbour drawn later cover the outline on the shared border, which
          is exactly where the reader is looking. Shape, not colour: the border
          is heavier, and the panel and the table say which region it is.
        */}
        {selected === null ? null : (
          <path
            d={selected.area.d}
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth={1.6}
            strokeLinejoin="round"
            aria-hidden="true"
          />
        )}
      </svg>
    </figure>
  );
}

/**
 * The key.
 *
 * Prints the real range of each band. Quantile shading encodes rank rather
 * than magnitude, so without the numbers a reader could reasonably infer that
 * the darkest band is five times the lightest, which it is not.
 */
export function VacancyLegend({
  bins,
  hasMissing,
}: {
  bins: readonly Bin[];
  hasMissing: boolean;
}) {
  if (bins.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="text-ink-faint text-xs font-medium tracking-wide uppercase">
        Advertisements per region
      </h3>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {bins.map((bin) => (
          <li key={bin.step} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="border-rule-strong inline-block h-3 w-6 border"
              style={{ backgroundColor: fillForStep(bin.step) }}
            />
            <span className="text-ink-muted font-mono text-xs">
              {numberFormat.format(bin.min)}
              {bin.min === bin.max ? '' : `–${numberFormat.format(bin.max)}`}
            </span>
          </li>
        ))}
        {hasMissing ? (
          <li className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="border-rule-strong inline-block h-3 w-6 border"
              style={{ backgroundColor: 'var(--color-scale-none)' }}
            />
            <span className="text-ink-muted text-xs">No figure published</span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
