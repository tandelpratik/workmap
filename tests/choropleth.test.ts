import { describe, expect, it } from 'vitest';
import { binFor, quantileBins } from '@/geography/choropleth';
import { fillForStep, regionTitle } from '@/components/vacancy-map';

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
