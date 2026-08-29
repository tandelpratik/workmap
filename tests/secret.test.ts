import { describe, expect, it } from 'vitest';
import { bearerToken, secretsMatch } from '@/lib/secret';

describe('constant-time secret comparison', () => {
  const secret = 'a'.repeat(32);

  it('accepts the right secret', () => {
    expect(secretsMatch(secret, secret)).toBe(true);
  });

  it('rejects a wrong secret of the same length', () => {
    expect(secretsMatch('b'.repeat(32), secret)).toBe(false);
  });

  it('rejects a wrong secret of a different length, without throwing', () => {
    // The operands are hashed before comparison precisely so that a length
    // mismatch is not itself an oracle, and does not throw.
    expect(secretsMatch('short', secret)).toBe(false);
    expect(secretsMatch('c'.repeat(200), secret)).toBe(false);
  });

  it('rejects a correct prefix', () => {
    expect(secretsMatch('a'.repeat(31), secret)).toBe(false);
  });

  it('treats an empty value as no credential at all', () => {
    expect(secretsMatch('', secret)).toBe(false);
    expect(secretsMatch(secret, '')).toBe(false);
    expect(secretsMatch('', '')).toBe(false);
  });
});

describe('reading a bearer token', () => {
  it('reads a well-formed header', () => {
    expect(bearerToken('Bearer abc123')).toBe('abc123');
  });

  it('is case insensitive about the scheme, as the standard requires', () => {
    expect(bearerToken('bearer abc123')).toBe('abc123');
  });

  it('tolerates surrounding whitespace', () => {
    expect(bearerToken('  Bearer   abc123  ')).toBe('abc123');
  });

  it('returns null for anything else', () => {
    expect(bearerToken(null)).toBeNull();
    expect(bearerToken('')).toBeNull();
    expect(bearerToken('abc123')).toBeNull();
    expect(bearerToken('Basic abc123')).toBeNull();
    expect(bearerToken('Bearer')).toBeNull();
  });
});
