import { describe, expect, it } from 'vitest';
import {
  concentration,
  concentrationIsReportable,
  isLeafCode,
  leafCodes,
} from '@/domain/occupation';

/**
 * The hierarchy rule and the concentration measure.
 *
 * Both are used to make claims about the labour market on a public page, so
 * both get the awkward cases rather than the happy path: a parent beside its
 * child, a denominator of zero, an occupation nobody advertises nationally.
 */

// The shape the release actually publishes: single-character major groups,
// two-character finer ones, and at least one alphanumeric code.
const PUBLISHED = ['0', '1', '1B', '2', '26', '2F', '2G', '5', '5A', '5B', '8', '82'];

describe('the hierarchy rule', () => {
  it('treats a code that prefixes another as a parent', () => {
    expect(isLeafCode('2', PUBLISHED)).toBe(false);
    expect(isLeafCode('5', PUBLISHED)).toBe(false);
    expect(isLeafCode('8', PUBLISHED)).toBe(false);
  });

  it('treats a code nothing extends as the finest grain', () => {
    expect(isLeafCode('26', PUBLISHED)).toBe(true);
    expect(isLeafCode('82', PUBLISHED)).toBe(true);
  });

  it('handles the alphanumeric codes the publisher actually uses', () => {
    // "5" is a prefix of "5A" and "5B", which a code-length rule would miss.
    expect(isLeafCode('5A', PUBLISHED)).toBe(true);
    expect(isLeafCode('5B', PUBLISHED)).toBe(true);
    expect(isLeafCode('2F', PUBLISHED)).toBe(true);
  });

  it('does not call a code its own parent', () => {
    expect(isLeafCode('26', ['26'])).toBe(true);
  });

  it('returns only the finest codes, in the order given', () => {
    // "0" survives, because it prefixes nothing here. Excluding the
    // all-occupations row is the caller's job and every caller does it
    // explicitly, which is clearer than a rule with one special case in it.
    expect(leafCodes(PUBLISHED)).toEqual(['0', '1B', '26', '2F', '2G', '5A', '5B', '82']);
  });

  it('treats the all-occupations code as a parent of everything', () => {
    // "0" prefixes nothing here, so it survives the rule and callers must
    // exclude it themselves. Pinned so a caller cannot assume otherwise.
    expect(isLeafCode('0', PUBLISHED)).toBe(true);
  });
});

describe('concentration', () => {
  it('is one when the local mix matches the national mix', () => {
    const value = concentration({
      localValue: 100,
      localTotal: 1_000,
      nationalValue: 10_000,
      nationalTotal: 100_000,
    });
    expect(value).toBeCloseTo(1, 10);
  });

  it('is above one when an area advertises more than its share', () => {
    const value = concentration({
      localValue: 200,
      localTotal: 1_000,
      nationalValue: 10_000,
      nationalTotal: 100_000,
    });
    expect(value).toBeCloseTo(2, 10);
  });

  it('is below one when it advertises less', () => {
    const value = concentration({
      localValue: 50,
      localTotal: 1_000,
      nationalValue: 10_000,
      nationalTotal: 100_000,
    });
    expect(value).toBeCloseTo(0.5, 10);
  });

  it('measures mix rather than volume', () => {
    // A small area devoting a fifth of its advertising to a group outranks a
    // large one advertising twenty times as many of the same roles. That is the
    // measure working, and the reason the page prints the count beside it.
    const small = concentration({
      localValue: 200,
      localTotal: 1_000,
      nationalValue: 10_000,
      nationalTotal: 100_000,
    });
    const large = concentration({
      localValue: 4_000,
      localTotal: 50_000,
      nationalValue: 10_000,
      nationalTotal: 100_000,
    });
    expect(small).toBeGreaterThan(large as number);
    expect(large).toBeCloseTo(0.8, 10);
  });

  it('reproduces a figure computed from the live release', () => {
    // Australian Capital Territory, ICT Professionals, July 2026: 494 of the
    // territory's 4,393 advertisements against roughly 6,024 of 205,954
    // nationally. The page rendered 3.83.
    const value = concentration({
      localValue: 494,
      localTotal: 4_393,
      nationalValue: 6_024,
      nationalTotal: 205_954,
    });
    expect(value).not.toBeNull();
    expect(Number((value as number).toFixed(2))).toBeCloseTo(3.84, 1);
  });

  it('refuses a ratio that would not mean anything', () => {
    const base = {
      localValue: 100,
      localTotal: 1_000,
      nationalValue: 10_000,
      nationalTotal: 100_000,
    };

    // No local advertising at all: no mix to describe.
    expect(concentration({ ...base, localTotal: 0 })).toBeNull();
    // No national advertising: no proportion to compare against.
    expect(concentration({ ...base, nationalTotal: 0 })).toBeNull();
    // Nobody advertises this occupation nationally, which would otherwise make
    // every area infinitely specialised in it.
    expect(concentration({ ...base, nationalValue: 0 })).toBeNull();
    // Negative figures are not a thing the source publishes, and if one ever
    // arrived it must not produce a confident-looking quotient.
    expect(concentration({ ...base, localTotal: -1 })).toBeNull();
  });

  it('is zero, not null, when an area advertises none of a real occupation', () => {
    // A genuine measurement: the country advertises these and this area does
    // not. Distinct from the nulls above, which are absences of a denominator.
    const value = concentration({
      localValue: 0,
      localTotal: 1_000,
      nationalValue: 10_000,
      nationalTotal: 100_000,
    });
    expect(value).toBe(0);
  });
});

describe('the reporting floor', () => {
  it('admits a figure at the floor and refuses one below it', () => {
    expect(concentrationIsReportable(100, 100)).toBe(true);
    expect(concentrationIsReportable(99, 100)).toBe(false);
  });

  it('keeps a wild quotient off the page when the sample is tiny', () => {
    // Twelve advertisements against a national share of one percent is a
    // quotient of six, and one more posting moves it to six and a half.
    const wild = concentration({
      localValue: 12,
      localTotal: 200,
      nationalValue: 1_000,
      nationalTotal: 100_000,
    });
    expect(wild).toBeGreaterThan(5);
    expect(concentrationIsReportable(12, 100)).toBe(false);
  });
});
