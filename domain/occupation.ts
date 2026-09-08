/**
 * Rules about occupation figures that more than one surface needs.
 *
 * Both of these were about to be written twice. The hierarchy rule was already
 * inline on the occupations page picking the month's movers, and the insights
 * page needs the same rule for the same reason; the concentration measure is
 * new and is the kind of derived statistic that must have one definition rather
 * than one per page.
 */

/**
 * Whether a published code is the finest grain the release carries.
 *
 * The publisher reports a hierarchy: `MANAGERS (1)` contains the finer groups
 * numbered `1x`, so a figure for the parent is its children added together.
 * Ranking or summing both together double-counts the same advertisements, and
 * ranking them together additionally answers "which group is biggest" with "the
 * one containing the others".
 *
 * A code that is a prefix of another published code is a parent. The rule reads
 * the release rather than assuming a code length, which keeps it correct if the
 * publisher adds a tier, and which handles the alphanumeric codes it actually
 * uses: `5` is a prefix of `5B`.
 */
export function isLeafCode(code: string, published: readonly string[]): boolean {
  return !published.some((other) => other !== code && other.startsWith(code));
}

/** The finest groups in a set of published codes. */
export function leafCodes(published: readonly string[]): string[] {
  return published.filter((code) => isLeafCode(code, published));
}

export interface ConcentrationInput {
  /** The occupation's figure in this area. */
  readonly localValue: number;
  /** Every occupation's figure in this area. */
  readonly localTotal: number;
  /** The occupation's figure nationally. */
  readonly nationalValue: number;
  /** Every occupation's figure nationally. */
  readonly nationalTotal: number;
}

/**
 * How over- or under-represented an occupation is in one area.
 *
 * The area's share of its own advertising that this occupation takes, divided
 * by the share the same occupation takes nationally. Labour economists call it
 * a location quotient; the page calls it concentration and explains it, because
 * the name is jargon and the idea is not.
 *
 * ```text
 *   1.0   the area advertises this occupation in the national proportion
 *   1.8   nearly twice the national proportion: a local specialism
 *   0.4   well under it
 * ```
 *
 * It is a statement about **mix**, not about size. A small state with a high
 * quotient for mining is not advertising more mining roles than New South
 * Wales; it is devoting more of its advertising to them. Reading it as volume is
 * the mistake this measure invites, and the page has to say so where it appears.
 *
 * Null rather than a number wherever the ratio would not mean anything: a
 * missing denominator, or a national share of zero, which would make every area
 * infinitely specialised in something nobody advertises.
 */
export function concentration(input: ConcentrationInput): number | null {
  const { localValue, localTotal, nationalValue, nationalTotal } = input;

  if (localTotal <= 0 || nationalTotal <= 0) return null;
  if (nationalValue <= 0) return null;

  const localShare = localValue / localTotal;
  const nationalShare = nationalValue / nationalTotal;
  if (nationalShare === 0) return null;

  return localShare / nationalShare;
}

/**
 * Whether a concentration figure is worth showing.
 *
 * A quotient computed from a handful of advertisements swings wildly on one
 * extra posting, and a ranking of the most specialised areas is otherwise a
 * ranking of the smallest samples. The floor is applied to the local figure,
 * which is the one that gets small.
 */
export function concentrationIsReportable(localValue: number, floor: number): boolean {
  return localValue >= floor;
}
