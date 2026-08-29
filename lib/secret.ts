import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * Constant-time secret comparison.
 *
 * A plain `===` on a secret leaks its length and, in principle, its prefix
 * through timing. Both operands are hashed first so the comparison is over two
 * equal-length buffers: timingSafeEqual throws on a length mismatch, which
 * would itself be a length oracle.
 *
 * This lives in lib/ because it is framework-neutral and has no dependencies
 * beyond node:crypto (ADR-0008).
 */
export function secretsMatch(candidate: string, expected: string): boolean {
  if (candidate === '' || expected === '') return false;

  const a = createHash('sha256').update(candidate).digest();
  const b = createHash('sha256').update(expected).digest();

  return timingSafeEqual(a, b);
}

/**
 * Reads a bearer token from an Authorization header.
 *
 * Returns null rather than throwing on anything malformed, because a bad header
 * is an unauthenticated request, not an error worth reporting in detail.
 */
export function bearerToken(header: string | null): string | null {
  if (header === null) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ?? null;
}
