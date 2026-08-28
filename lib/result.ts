/**
 * Result type for expected failures (ADR-0008).
 *
 * The error taxonomy has two categories, and they are handled differently.
 * Expected failures (a source being unavailable, a sample being too small, an
 * input being invalid) are part of the product and are modelled as values, so
 * the type system forces every caller to decide what to render. Programmer
 * errors are thrown.
 *
 * The practical reason for the distinction: "no results", "not covered by this
 * dataset" and "the service is unavailable" are three different screens. A
 * design that collapses them into a thrown exception loses the information
 * needed to tell them apart.
 */

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E> = { readonly ok: false; readonly error: E };
export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

/** Transforms the success value, leaving a failure untouched. */
export function mapResult<T, U, E>(
  result: Result<T, E>,
  transform: (value: T) => U,
): Result<U, E> {
  return result.ok ? ok(transform(result.value)) : result;
}

/** Returns the success value, or the fallback when the result is a failure. */
export function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback;
}

/**
 * Collects an array of results into a result of an array, failing on the first
 * error. Useful when every record in a batch must be valid.
 */
export function collect<T, E>(results: readonly Result<T, E>[]): Result<T[], E> {
  const values: T[] = [];
  for (const result of results) {
    if (!result.ok) return result;
    values.push(result.value);
  }
  return ok(values);
}
