import { describe, expect, it } from 'vitest';
import {
  isPubliclyVisible,
  lifecycleLabel,
  lifecycleOf,
  lifecycleStates,
  type LifecycleFacts,
} from '@/domain/lifecycle';
import { lifecycle } from '@/config/lifecycle';

/**
 * The derived states, and the ordering the whole scheme rests on.
 *
 * These are pure functions over dates, so they are tested against a fixed
 * `now`. A lifecycle test that reads the real clock passes for a week and then
 * starts failing at midnight for reasons nobody can reproduce.
 */

const NOW = new Date('2026-09-08T00:00:00Z');

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

function facts(overrides: Partial<LifecycleFacts> = {}): LifecycleFacts {
  return {
    status: 'ACTIVE',
    firstSeenAt: daysAgo(30),
    lastVerifiedAt: daysAgo(1),
    postedAt: daysAgo(30),
    ...overrides,
  };
}

describe('the stored decisions win', () => {
  it('reports a withdrawn listing as removed whatever its dates', () => {
    const state = lifecycleOf(
      facts({
        status: 'WITHDRAWN',
        firstSeenAt: NOW,
        lastVerifiedAt: NOW,
        postedAt: NOW,
      }),
      lifecycle,
      NOW,
    );
    expect(state).toBe('REMOVED');
  });

  it('reports an expired listing as expired whatever its dates', () => {
    const state = lifecycleOf(
      facts({ status: 'EXPIRED', firstSeenAt: NOW, lastVerifiedAt: NOW, postedAt: NOW }),
      lifecycle,
      NOW,
    );
    expect(state).toBe('EXPIRED');
  });
});

describe('the derived states', () => {
  it('marks a listing posted today as new', () => {
    expect(lifecycleOf(facts({ postedAt: NOW }), lifecycle, NOW)).toBe('NEW');
  });

  it('stops calling a listing new once it is past the window', () => {
    const justInside = daysAgo(lifecycle.newWithinDays);
    const justOutside = daysAgo(lifecycle.newWithinDays + 0.5);

    expect(lifecycleOf(facts({ postedAt: justInside }), lifecycle, NOW)).toBe('NEW');
    expect(lifecycleOf(facts({ postedAt: justOutside }), lifecycle, NOW)).toBe('ACTIVE');
  });

  /*
   * The backfill case. A crawl that fills a corpus gives thousands of listings
   * the same discovery date, and reading newness off that labelled every row on
   * every page at once. Newness is the employer's fact.
   */
  it('does not call a listing new because we found it recently', () => {
    const state = lifecycleOf(
      facts({ firstSeenAt: NOW, postedAt: daysAgo(60) }),
      lifecycle,
      NOW,
    );
    expect(state).toBe('ACTIVE');
  });

  it('never calls a listing new when the source published no posting date', () => {
    const state = lifecycleOf(
      facts({ firstSeenAt: NOW, postedAt: null }),
      lifecycle,
      NOW,
    );
    expect(state).toBe('ACTIVE');
  });

  it('marks a listing stale once verification is older than the threshold', () => {
    const justInside = daysAgo(lifecycle.staleAfterDays);
    const justOutside = daysAgo(lifecycle.staleAfterDays + 0.5);

    expect(lifecycleOf(facts({ lastVerifiedAt: justInside }), lifecycle, NOW)).toBe(
      'ACTIVE',
    );
    expect(lifecycleOf(facts({ lastVerifiedAt: justOutside }), lifecycle, NOW)).toBe(
      'STALE',
    );
  });

  it('prefers stale over new when both would be true', () => {
    // Posted recently, never confirmed since, and discovery is now older than
    // the stale threshold. A crawl reached it once and never came back, which
    // is the case a reader most needs warning about.
    const state = lifecycleOf(
      facts({
        firstSeenAt: daysAgo(lifecycle.staleAfterDays + 1),
        lastVerifiedAt: null,
        postedAt: NOW,
      }),
      lifecycle,
      NOW,
    );
    expect(state).toBe('STALE');
  });

  it('does not treat a missing verification as a verification', () => {
    // Never confirmed, but only found today. Not stale yet, and not pretending
    // discovery was a confirmation either.
    expect(
      lifecycleOf(
        facts({ firstSeenAt: NOW, lastVerifiedAt: null, postedAt: NOW }),
        lifecycle,
        NOW,
      ),
    ).toBe('NEW');
  });

  it('reports an ordinary confirmed listing as active', () => {
    expect(lifecycleOf(facts(), lifecycle, NOW)).toBe('ACTIVE');
  });
});

describe('visibility', () => {
  it('hides exactly the two states search excludes', () => {
    const hidden = lifecycleStates.filter((state) => !isPubliclyVisible(state));
    expect([...hidden].sort()).toEqual(['EXPIRED', 'REMOVED']);
  });
});

describe('labels', () => {
  it('leaves the ordinary case unlabelled', () => {
    expect(lifecycleLabel('ACTIVE')).toBeNull();
  });

  it('labels every other state', () => {
    for (const state of lifecycleStates) {
      if (state === 'ACTIVE') continue;
      expect(lifecycleLabel(state), state).not.toBeNull();
    }
  });

  it('describes staleness as a gap in confirmation rather than as expiry', () => {
    // The wording matters. "Expired" would be a claim about the vacancy;
    // this is a statement about what we have checked.
    expect(lifecycleLabel('STALE')).toMatch(/confirmed/i);
  });
});

describe('the threshold ordering', () => {
  it('marks nothing stale before the crawler would revisit it', () => {
    // A staleness window shorter than the refresh interval would mark the whole
    // corpus stale on a schedule of our own making, and it would look like a
    // source problem.
    expect(lifecycle.staleAfterDays).toBeGreaterThanOrEqual(lifecycle.refreshAfterDays);
  });

  it('warns before it retires', () => {
    expect(lifecycle.staleAfterDays).toBeLessThan(lifecycle.expireAfterDays);
  });

  it('stops calling a listing new well before it could be stale', () => {
    expect(lifecycle.newWithinDays).toBeLessThan(lifecycle.staleAfterDays);
  });
});
