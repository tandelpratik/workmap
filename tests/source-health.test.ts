import { describe, expect, it } from 'vitest';
import { __testing } from '@/analytics/source-health';
import { lifecycle } from '@/config/lifecycle';

const { verdict, STALE_AFTER_HOURS } = __testing;

/**
 * The verdict rules.
 *
 * A monitor is only worth having if its warnings mean something, so the cases
 * that matter most here are the ones where it must stay quiet. The first live
 * run of this check reported a perfectly healthy monthly import as silent for
 * 190 hours, which is exactly how a monitor teaches people to ignore it.
 */

const NOW = new Date('2026-09-09T00:00:00Z');

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000);
}

function facts(overrides: Partial<Parameters<typeof verdict>[0]> = {}) {
  return {
    lastSuccessAt: hoursAgo(2),
    lastFailureAt: null,
    lastFailureMessage: null,
    runningSince: null,
    activeListings: 100,
    oldestVerifiedAt: hoursAgo(2),
    quarantinedRecently: 0,
    recordsWritten: 10,
    recordsSeen: 10,
    ...overrides,
  };
}

const SCHEDULED = { scheduled: true };
const ON_PUBLICATION = { scheduled: false };

describe('a scheduled source', () => {
  it('is healthy when it ran recently and brought back clean records', () => {
    expect(verdict(facts(), SCHEDULED, NOW).health).toBe('HEALTHY');
  });

  it('is silent when no run has succeeded within the window', () => {
    const result = verdict(
      facts({ lastSuccessAt: hoursAgo(STALE_AFTER_HOURS + 1) }),
      SCHEDULED,
      NOW,
    );
    expect(result.health).toBe('SILENT');
    expect(result.reason).toMatch(/hours/);
  });

  it('is still healthy just inside the window', () => {
    expect(
      verdict(facts({ lastSuccessAt: hoursAgo(STALE_AFTER_HOURS - 1) }), SCHEDULED, NOW)
        .health,
    ).toBe('HEALTHY');
  });

  it('is failing when the newest run failed', () => {
    const result = verdict(
      facts({ lastSuccessAt: hoursAgo(10), lastFailureAt: hoursAgo(1) }),
      SCHEDULED,
      NOW,
    );
    expect(result.health).toBe('FAILING');
  });

  it('is not failing when a later run succeeded after an earlier failure', () => {
    // A crawler that retries is normal. Only an unrecovered failure is news.
    expect(
      verdict(
        facts({ lastSuccessAt: hoursAgo(1), lastFailureAt: hoursAgo(10) }),
        SCHEDULED,
        NOW,
      ).health,
    ).toBe('HEALTHY');
  });

  it('is stale when it holds listings older than the expiry window', () => {
    const result = verdict(
      facts({ oldestVerifiedAt: hoursAgo(lifecycle.expireAfterDays * 24 + 1) }),
      SCHEDULED,
      NOW,
    );
    expect(result.health).toBe('STALE');
    expect(result.reason).toMatch(/retired/);
  });

  it('is stale when records could not be parsed', () => {
    const result = verdict(facts({ quarantinedRecently: 3 }), SCHEDULED, NOW);
    expect(result.health).toBe('STALE');
    expect(result.reason).toMatch(/changing its shape/);
  });

  it('reports a failure ahead of a parse problem', () => {
    // Both are true and only one is the thing to look at first.
    expect(
      verdict(
        facts({ lastFailureAt: hoursAgo(1), quarantinedRecently: 3 }),
        SCHEDULED,
        NOW,
      ).health,
    ).toBe('FAILING');
  });
});

describe('a source imported on publication', () => {
  /*
   * The false positive that prompted the distinction. Jobs and Skills Australia
   * publishes monthly and an operator imports the workbook; silence between
   * releases is the expected state, not an incident.
   */
  it('is healthy after weeks of silence', () => {
    expect(
      verdict(facts({ lastSuccessAt: hoursAgo(24 * 30) }), ON_PUBLICATION, NOW).health,
    ).toBe('HEALTHY');
  });

  it('is not judged on how old its records are either', () => {
    expect(
      verdict(
        facts({ oldestVerifiedAt: hoursAgo(lifecycle.expireAfterDays * 24 + 100) }),
        ON_PUBLICATION,
        NOW,
      ).health,
    ).toBe('HEALTHY');
  });

  it('is still reported as failing when a run fails', () => {
    // Cadence is not a fault; a failed import is, whenever it was run.
    expect(
      verdict(
        facts({ lastSuccessAt: hoursAgo(24 * 30), lastFailureAt: hoursAgo(1) }),
        ON_PUBLICATION,
        NOW,
      ).health,
    ).toBe('FAILING');
  });

  it('is still reported as stale when records could not be parsed', () => {
    expect(verdict(facts({ quarantinedRecently: 1 }), ON_PUBLICATION, NOW).health).toBe(
      'STALE',
    );
  });
});

describe('a source that has never run', () => {
  it('says so rather than reporting a failure', () => {
    const result = verdict(
      facts({ lastSuccessAt: null, lastFailureAt: null }),
      SCHEDULED,
      NOW,
    );
    expect(result.health).toBe('NOT_RUN');
    expect(result.reason).toMatch(/no ingestion run/i);
  });

  it('reports a source that has only ever failed as failing', () => {
    expect(
      verdict(facts({ lastSuccessAt: null, lastFailureAt: hoursAgo(5) }), SCHEDULED, NOW)
        .health,
    ).toBe('FAILING');
  });
});
