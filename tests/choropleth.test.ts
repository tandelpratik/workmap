import { describe, expect, it } from 'vitest';
import {
  binFor,
  buildStateChoroplethGeometry,
  quantileBins,
} from '@/geography/choropleth';
import { fillForStep, regionTitle } from '@/components/vacancy-map';
import { regionHref } from '@/components/region-figure';
import { occupationLabel } from '@/components/occupation-filter';

/**
 * Choropleth classification.
 *
 * The figures used here are the real July 2026 shape of the data: three
 * capitals in the tens of thousands and everything else in the hundreds or low
 * thousands. That skew is the whole reason the scale is quantile rather than
 * linear, so the tests are written against it rather than against tidy numbers.
 */

describe('quantile bins', () => {
  it('keeps regional variation visible despite the capitals', () => {
    // Greater Sydney is roughly fifty times a regional SA4. Under equal
    // intervals every region below the capitals lands in one band and the map
    // shows nothing but three dark cities.
    const values = [716, 821, 901, 911, 974, 1344, 1425, 2671, 28020, 36904, 42880];
    const bins = quantileBins(values, 5);

    expect(bins.length).toBeGreaterThan(1);
    // The lowest band must not swallow the mid-range regions.
    expect(bins[0]!.max).toBeLessThan(2671);
    // The capitals share the top band rather than each taking one.
    expect(bins[bins.length - 1]!.max).toBe(42880);
  });

  it('returns nothing for no values, rather than a band covering zero', () => {
    // A month with no data must not render a legend implying a measurement.
    expect(quantileBins([], 5)).toEqual([]);
  });

  it('does not emit duplicate bands when values repeat', () => {
    const bins = quantileBins([100, 100, 100, 100, 100, 100], 5);
    expect(bins.length).toBe(1);
    expect(bins[0]).toMatchObject({ min: 100, max: 100 });
  });

  it('orders bands upwards with contiguous steps', () => {
    const bins = quantileBins([5, 10, 20, 40, 80, 160, 320, 640], 4);
    for (let i = 1; i < bins.length; i += 1) {
      expect(bins[i]!.min).toBeGreaterThanOrEqual(bins[i - 1]!.min);
      expect(bins[i]!.max).toBeGreaterThan(bins[i - 1]!.max);
      expect(bins[i]!.step).toBe(bins[i - 1]!.step + 1);
    }
  });
});

describe('binFor', () => {
  const bins = quantileBins([716, 901, 1102, 1553, 2275, 42880], 5);

  it('places the smallest value in the lightest band', () => {
    expect(binFor(bins, 716)?.step).toBe(0);
  });

  it('places the largest value in the darkest band', () => {
    expect(binFor(bins, 42880)?.step).toBe(bins.length - 1);
  });

  it('places a value above every band in the darkest, not nowhere', () => {
    // A later release with a new record high must still be drawn. Returning
    // null would leave the busiest region on the map unshaded, which reads as
    // "no data" and is the opposite of the truth.
    const bin = binFor(bins, 99_999);
    expect(bin).not.toBeNull();
    expect(bin?.step).toBe(bins.length - 1);
  });

  it('has no band at all when there are no values', () => {
    expect(binFor([], 100)).toBeNull();
  });
});

describe('scale fills', () => {
  it('gives every band a distinct fill', () => {
    const fills = [0, 1, 2, 3, 4].map(fillForStep);
    expect(new Set(fills).size).toBe(5);
  });

  it('clamps rather than returning undefined for an out-of-range step', () => {
    expect(fillForStep(99)).toBe(fillForStep(4));
  });
});

describe('region title', () => {
  /**
   * Regression: these were rendered as `{name}: {expression}`, which is four
   * children, and React renders a <title> with more than one child as empty.
   * The map shipped fifty titles that announced nothing. A string is asserted
   * here rather than a rendering, because the failure was the shape of the
   * value, not the markup around it.
   */
  it('is one string carrying both the region and its figure', () => {
    const title = regionTitle('Greater Sydney', 42880);

    expect(title).toBe('Greater Sydney: 42,880 advertisements');
  });

  it('says a figure is missing rather than reading as zero', () => {
    // "Outback Queensland: 0 advertisements" would be a measurement. No
    // figure was published, which is a different fact (ADR-0002).
    expect(regionTitle('Outback Queensland', null)).toBe(
      'Outback Queensland: no figure published',
    );
  });
});

describe('region links', () => {
  it('keeps the state when selecting inside a drilldown', () => {
    expect(regionHref('101', '1')).toBe('/map?state=1&region=101');
  });

  it('clears the region without leaving the state', () => {
    // Clearing a selection must not also throw the reader back to the
    // national map: those are two separate actions and the breadcrumb is the
    // other one.
    expect(regionHref(null, '1')).toBe('/map?state=1');
  });

  it('is the bare map when neither is set', () => {
    expect(regionHref(null)).toBe('/map');
    expect(regionHref(null, null)).toBe('/map');
  });

  it('escapes a code rather than trusting it', () => {
    expect(regionHref('a b&c')).toBe('/map?region=a+b%26c');
  });
});

describe('state geometry', () => {
  /**
   * Reads the built artefacts, because the thing worth testing is the
   * agreement between the build and the reader. A fixture topology would
   * assert that this function parses a file we wrote for it, which is not the
   * failure that matters: the failure that matters is a geometry rebuild that
   * silently stops emitting what the state view needs.
   */
  it('draws a capital as one shape, not as the SA4s it contains', async () => {
    const geometry = await buildStateChoroplethGeometry({
      edition: 'ASGS2026',
      stateCode: '1',
      regionCodes: new Set(['1GSYD', '101']),
    });

    // Greater Sydney is one region with one figure, so it is one shape.
    expect(geometry.areasByCode.get('1GSYD')?.d).toMatch(/^M/);
    expect(geometry.areasByCode.get('101')?.d).toMatch(/^M/);

    // 115 is Sydney - Baulkham Hills and Hawkesbury, inside Greater Sydney.
    // IVI publishes no figure for it, so drawing it would either invent a gap
    // in the middle of the city or repeat the city's figure across its parts.
    expect(geometry.areasByCode.has('115')).toBe(false);

    // 102 is an NSW SA4 that was not asked for. Only what the caller says the
    // data reports on is drawn.
    expect(geometry.areasByCode.has('102')).toBe(false);
    expect(geometry.areasByCode.size).toBe(2);

    // The frame is the state, so the base outline is the state itself.
    expect(geometry.base).toHaveLength(1);
    expect(geometry.base[0]?.code).toBe('1');
  });

  it('refuses a state code it has no outline for', async () => {
    await expect(
      buildStateChoroplethGeometry({
        edition: 'ASGS2026',
        stateCode: '99',
        regionCodes: new Set(),
      }),
    ).rejects.toThrow(/No state outline/);
  });
});

describe('occupation labels', () => {
  it('shows the publisher’s own name with its code', () => {
    expect(occupationLabel({ code: '26', name: 'ICT Professionals' })).toBe(
      'ICT Professionals (26)',
    );
  });

  it('names the total row ourselves, because the source does not', () => {
    // JSA labels its all-occupations row per region: "Greater Sydney TOTAL",
    // "Capital Region TOTAL", fifty of them. Picking one would tell a reader
    // in Perth they were looking at Sydney, so the repository returns null and
    // the view supplies our own wording (ADR-0002).
    expect(occupationLabel({ code: '0', name: null })).toBe('All occupations');
  });

  it('falls back to the code rather than inventing a name', () => {
    expect(occupationLabel({ code: '2B', name: null })).toBe('Code 2B');
  });
});
