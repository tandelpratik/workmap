/**
 * How much history the product keeps.
 *
 * A published release carries years of monthly figures. The product shows the
 * latest month and its change on the month before, so it needs two periods and
 * stores two. The rest is not deleted because it is worthless, it is deleted
 * because storing it is a cost with no reader: the July 2026 IVI release alone
 * is 91 months across 2,850 series, a quarter of a million rows, against 5,700
 * for what is displayed. Free-tier rules.
 *
 * The published workbook remains the record. Raising this number and
 * re-importing restores whatever was dropped, which is the property that makes
 * the deletion safe: nothing here is the only copy of anything.
 *
 * Two is the floor rather than a preference. A single period cannot express a
 * change, so the trend figure would silently become "no comparison available"
 * for every region. A test asserts the floor.
 */

export const retention = {
  /** Reference periods kept per labour market series. Minimum 2. */
  labourMarketPeriods: 2,
} as const;
