import { describe, expect, it } from 'vitest';
import { runQualityChecks } from '@/analytics/quality';

/**
 * The quality report itself.
 *
 * These run without a database, which is the case worth pinning: a machine with
 * nothing configured must report the stored-data checks as skipped rather than
 * as passed. A gate that reports success it has not earned is worse than no
 * gate, because it is trusted.
 *
 * The checks that read stored data are exercised by running `npm run
 * data:check` against a real database. Reproducing a corrupt corpus in fixtures
 * to prove a query finds it would test the fixture.
 */

describe('running with no database', () => {
  it('reports the stored-data checks as skipped, never as passed', async () => {
    const result = await runQualityChecks();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const skipped = result.value.checks.filter((check) => check.status === 'SKIPPED');
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.name).toBe('database');
    expect(skipped[0]?.detail).toMatch(/no database configured/i);
  });

  it('still checks what needs no database', async () => {
    const result = await runQualityChecks();
    if (!result.ok) throw new Error('expected a report');

    const names = result.value.checks.map((check) => check.name);
    expect(names).toContain('attribution.text-available');
    expect(names).toContain('attribution.licence-linkable');
    expect(names).toContain('lifecycle.thresholds-ordered');
  });

  it('passes the registry and threshold checks as the project stands', async () => {
    const result = await runQualityChecks();
    if (!result.ok) throw new Error('expected a report');

    const failures = result.value.checks.filter((check) => check.status === 'FAIL');
    expect(failures.map((check) => check.name)).toEqual([]);
    expect(result.value.ok).toBe(true);
  });
});

describe('the report', () => {
  it('counts every check exactly once', async () => {
    const result = await runQualityChecks();
    if (!result.ok) throw new Error('expected a report');

    const { checks, passed, failed, skipped } = result.value;
    expect(passed + failed + skipped).toBe(checks.length);
  });

  it('is not ok when anything failed', async () => {
    const result = await runQualityChecks();
    if (!result.ok) throw new Error('expected a report');
    expect(result.value.ok).toBe(result.value.failed === 0);
  });

  it('gives every check a name and a statement of what it asserts', async () => {
    const result = await runQualityChecks();
    if (!result.ok) throw new Error('expected a report');

    for (const check of result.value.checks) {
      expect(check.name.length, check.name).toBeGreaterThan(0);
      expect(check.asserts.length, check.name).toBeGreaterThan(0);
    }
  });

  it('carries no examples on a passing check', async () => {
    const result = await runQualityChecks();
    if (!result.ok) throw new Error('expected a report');

    for (const check of result.value.checks) {
      if (check.status !== 'PASS') continue;
      expect(check.failures, check.name).toBe(0);
      expect(check.examples, check.name).toEqual([]);
    }
  });
});
