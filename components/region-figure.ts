import type { GeographyLevel } from '@/domain/geography';
import type { Observation } from '@/domain/labour-market';

/**
 * One region's headline figure, as the view layer needs it.
 *
 * Declared here rather than imported from the repository because components
 * must not depend on persistence: they render what they are given, and the
 * page is what turns a stored row into this. The shape is deliberately narrow,
 * so a component cannot reach for a field it has no business displaying.
 */
export interface RegionFigure {
  readonly code: string;
  readonly name: string;
  readonly level: GeographyLevel;
  /** Carries the value and, when absent, why. Never coerced to zero. */
  readonly observation: Observation;
}
