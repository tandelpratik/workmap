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
  /** The month before, where one is held. Null means no comparison exists. */
  readonly previous: Observation | null;
}

/** The publisher's own name for the level, for a reader who is not an ASGS user. */
export function levelLabel(level: GeographyLevel): string {
  switch (level) {
    case 'GCCSA':
      return 'Capital city';
    case 'SA4':
      return 'Region';
    case 'STATE':
      return 'State or territory';
    case 'COUNTRY':
      return 'Country';
  }
}

/** How the publisher describes an absent figure, in the reader's terms. */
export function absenceLabel(state: string): string {
  switch (state) {
    case 'SUPPRESSED':
      return 'Withheld by the publisher';
    case 'NOT_COVERED':
      return 'Outside this dataset';
    case 'UNAVAILABLE':
      return 'Not published';
    default:
      return 'No figure';
  }
}

/**
 * The link that selects a region, and the one that clears the selection.
 *
 * Selection lives in the URL rather than in component state, which is what
 * makes it survive a reload, work without JavaScript, and stay shareable, the
 * same property the job search relies on. It also makes the "selection
 * persists" requirement a consequence of the design rather than something to
 * maintain.
 */
export function regionHref(code: string | null): string {
  return code === null ? '/map' : `/map?region=${encodeURIComponent(code)}`;
}
