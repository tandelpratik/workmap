import { describe, expect, it } from 'vitest';
import { collect, err, isErr, isOk, mapResult, ok, unwrapOr } from '@/lib/result';
import {
  assertNever,
  failure,
  failureCodes,
  invariant,
  InvariantError,
  statusForFailure,
} from '@/lib/errors';

describe('result', () => {
  it('narrows success and failure', () => {
    expect(isOk(ok(1))).toBe(true);
    expect(isErr(err('bad'))).toBe(true);
  });

  it('maps only the success value', () => {
    expect(mapResult(ok(2), (n) => n * 3)).toEqual({ ok: true, value: 6 });
    expect(mapResult(err('bad'), (n: number) => n * 3)).toEqual({
      ok: false,
      error: 'bad',
    });
  });

  it('falls back on failure', () => {
    expect(unwrapOr(ok('a'), 'b')).toBe('a');
    expect(unwrapOr(err('x'), 'b')).toBe('b');
  });

  it('collects to the first failure', () => {
    expect(collect([ok(1), ok(2)])).toEqual({ ok: true, value: [1, 2] });
    expect(collect([ok(1), err('bad'), ok(3)])).toEqual({ ok: false, error: 'bad' });
  });
});

describe('failure taxonomy', () => {
  it('maps every code to a status, with no unhandled variant', () => {
    for (const code of failureCodes) {
      const status = statusForFailure(code);
      expect(status).toBeGreaterThanOrEqual(200);
      expect(status).toBeLessThan(600);
    }
  });

  it('separates an empty answer from an absent one', () => {
    // NO_RESULTS is a successful query that matched nothing. NOT_AVAILABLE
    // means the product cannot answer yet, because no source is active
    // (ADR-0009). Collapsing them would tell a user there are no jobs in
    // Australia, which is false.
    expect(statusForFailure('NO_RESULTS')).toBe(200);
    expect(statusForFailure('NOT_AVAILABLE')).toBe(503);
  });

  it('suppresses rather than errors on a small sample', () => {
    expect(statusForFailure('INSUFFICIENT_SAMPLE')).toBe(200);
  });

  it('omits the correlation id when there is none', () => {
    expect(failure('NOT_FOUND', 'Missing.')).toEqual({
      code: 'NOT_FOUND',
      message: 'Missing.',
    });
    expect(failure('INTERNAL', 'Failed.', 'abc123').correlationId).toBe('abc123');
  });
});

describe('invariants', () => {
  it('throws on a broken invariant', () => {
    expect(() => invariant(false, 'must hold')).toThrow(InvariantError);
    expect(() => invariant(true, 'must hold')).not.toThrow();
  });

  it('reports an unhandled union variant', () => {
    expect(() => assertNever('surprise' as never, 'test')).toThrow(InvariantError);
  });
});
