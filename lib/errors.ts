/**
 * Error taxonomy (ADR-0008).
 *
 * Failures carry a stable machine-readable code so the UI can choose the right
 * state, and a message safe to show a user. Stack traces, SQL and provider
 * payloads never appear in either.
 */

export const failureCodes = [
  /** The query ran and matched nothing. */
  'NO_RESULTS',
  /** The requested entity does not exist. */
  'NOT_FOUND',
  /** Input failed validation at a trust boundary. */
  'INVALID_INPUT',
  /** The caller is not permitted to do this. */
  'FORBIDDEN',
  /** An upstream source could not be reached. */
  'SOURCE_UNAVAILABLE',
  /** An upstream source refused because of rate limiting. */
  'RATE_LIMITED',
  /**
   * The product cannot answer this question yet, because no source is active
   * for it. Distinct from NO_RESULTS: this is not an empty answer, it is the
   * absence of an answer (ADR-0009).
   */
  'NOT_AVAILABLE',
  /** The dataset does not cover this geography, occupation or period. */
  'NOT_COVERED',
  /** A value exists but is withheld because the sample is too small. */
  'INSUFFICIENT_SAMPLE',
  /** A required dependency is not configured in this environment. */
  'NOT_CONFIGURED',
  /** Anything unexpected. Details are logged, never returned. */
  'INTERNAL',
] as const;

export type FailureCode = (typeof failureCodes)[number];

export interface Failure {
  readonly code: FailureCode;
  /** Safe to display. Contains no internal detail. */
  readonly message: string;
  /** Correlates a user-visible failure with a log entry. */
  readonly correlationId?: string;
}

export function failure(
  code: FailureCode,
  message: string,
  correlationId?: string,
): Failure {
  return correlationId === undefined
    ? { code, message }
    : { code, message, correlationId };
}

/** Maps a failure to the HTTP status a route handler should return. */
export function statusForFailure(code: FailureCode): number {
  switch (code) {
    case 'NO_RESULTS':
      return 200;
    case 'NOT_FOUND':
    case 'NOT_COVERED':
      return 404;
    case 'INVALID_INPUT':
      return 400;
    case 'FORBIDDEN':
      return 403;
    case 'RATE_LIMITED':
      return 429;
    case 'SOURCE_UNAVAILABLE':
    case 'NOT_AVAILABLE':
    case 'NOT_CONFIGURED':
      return 503;
    case 'INSUFFICIENT_SAMPLE':
      return 200;
    case 'INTERNAL':
      return 500;
  }
}

/**
 * A broken invariant. This is a programmer error, not an expected failure, so
 * it is thrown rather than returned. It must never be shown to a user.
 */
export class InvariantError extends Error {
  override readonly name = 'InvariantError';

  constructor(message: string) {
    super(message);
  }
}

/** Asserts a condition that the code believes is always true. */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new InvariantError(message);
  }
}

/**
 * Exhaustiveness check for discriminated unions. Adding a variant without
 * handling it becomes a type error rather than a silent fallthrough.
 */
export function assertNever(value: never, context: string): never {
  throw new InvariantError(`Unhandled variant in ${context}: ${String(value)}`);
}
