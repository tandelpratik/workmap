/**
 * Geography contracts (ADR-0003).
 *
 * The registry is identity and hierarchy only. Geometry is a static build
 * artefact and never reaches the domain, so nothing here knows what a boundary
 * looks like, only that one exists.
 */

export const geographyLevels = ['COUNTRY', 'STATE', 'SA4'] as const;
export type GeographyLevel = (typeof geographyLevels)[number];

/** Parent level in the ASGS hierarchy. Null for the root. */
export function parentLevelOf(level: GeographyLevel): GeographyLevel | null {
  switch (level) {
    case 'COUNTRY':
      return null;
    case 'STATE':
      return 'COUNTRY';
    case 'SA4':
      return 'STATE';
  }
}

export interface GeographyArea {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly level: GeographyLevel;
  /** Null for the root of the hierarchy. */
  readonly parentCode: string | null;
  /**
   * ASGS edition. Part of identity, because boundary codes change between
   * editions and a series must not silently span two of them.
   */
  readonly edition: string;
  /**
   * Whether the area has a published boundary. False for offshore, migratory,
   * no-usual-address and outside-Australia areas, which exist as codes so that
   * sources can report against them.
   */
  readonly hasGeometry: boolean;
  readonly areaSqKm: number | null;
}

/**
 * Whether an area can be drawn.
 *
 * An area without a boundary is not missing data and must not be rendered as a
 * gap or as zero. It is a real area that cannot be mapped, and the accessible
 * table is the only place it can be represented honestly (ADR-0003).
 */
export function isMappable(area: Pick<GeographyArea, 'hasGeometry'>): boolean {
  return area.hasGeometry;
}

export interface HierarchyProblem {
  readonly code: string;
  readonly level: GeographyLevel;
  readonly problem: string;
}

/**
 * Structural validation of a registry.
 *
 * Run before anything is written. A release that fails these checks is a source
 * problem, and importing it would corrupt the registry rather than fail loudly.
 */
export function validateHierarchy(
  areas: readonly Pick<GeographyArea, 'code' | 'level' | 'parentCode'>[],
): HierarchyProblem[] {
  const problems: HierarchyProblem[] = [];
  const codesByLevel = new Map<GeographyLevel, Set<string>>();

  for (const level of geographyLevels) codesByLevel.set(level, new Set());

  for (const area of areas) {
    const codes = codesByLevel.get(area.level);
    if (!codes) {
      problems.push({
        code: area.code,
        level: area.level,
        problem: `Unknown level "${area.level}".`,
      });
      continue;
    }
    if (codes.has(area.code)) {
      problems.push({
        code: area.code,
        level: area.level,
        problem: 'Duplicate code within its level.',
      });
    }
    codes.add(area.code);
  }

  for (const area of areas) {
    const expectedParent = parentLevelOf(area.level);

    if (expectedParent === null) {
      if (area.parentCode !== null) {
        problems.push({
          code: area.code,
          level: area.level,
          problem: 'Root level must not have a parent.',
        });
      }
      continue;
    }

    if (area.parentCode === null) {
      problems.push({
        code: area.code,
        level: area.level,
        problem: `Missing parent. Every ${area.level} must belong to a ${expectedParent}.`,
      });
      continue;
    }

    if (!codesByLevel.get(expectedParent)?.has(area.parentCode)) {
      problems.push({
        code: area.code,
        level: area.level,
        problem: `Parent ${expectedParent} "${area.parentCode}" is not present in the registry.`,
      });
    }
  }

  return problems;
}

/** Counts by level, and how many of each cannot be mapped. */
export function summarise(
  areas: readonly Pick<GeographyArea, 'level' | 'hasGeometry'>[],
): Record<GeographyLevel, { total: number; mappable: number }> {
  const summary = {
    COUNTRY: { total: 0, mappable: 0 },
    STATE: { total: 0, mappable: 0 },
    SA4: { total: 0, mappable: 0 },
  };

  for (const area of areas) {
    const bucket = summary[area.level];
    bucket.total += 1;
    if (area.hasGeometry) bucket.mappable += 1;
  }

  return summary;
}
