/**
 * Geography contracts (ADR-0003).
 *
 * The registry is identity and hierarchy only. Geometry is a static build
 * artefact and never reaches the domain, so nothing here knows what a boundary
 * looks like, only that one exists.
 */

/**
 * ASGS levels this product carries, broadest first.
 *
 * GCCSA sits beside SA4 rather than above it. Both are children of STATE in
 * the ASGS hierarchy, and a GCCSA is a union of SA4s, so the two levels
 * overlap in coverage and their counts must never be added together.
 *
 * GCCSA is carried because JSA IVI reports against it: the index splits
 * Australia into the eight capital-city GCCSAs plus the non-capital SA4s. A
 * national picture is impossible without both.
 */
export const geographyLevels = ['COUNTRY', 'STATE', 'GCCSA', 'SA4'] as const;
export type GeographyLevel = (typeof geographyLevels)[number];

/** Parent level in the ASGS hierarchy. Null for the root. */
export function parentLevelOf(level: GeographyLevel): GeographyLevel | null {
  switch (level) {
    case 'COUNTRY':
      return null;
    case 'STATE':
      return 'COUNTRY';
    // Both hang off STATE. GCCSA is not SA4's parent, despite being coarser:
    // treating it as one would imply every SA4 nests inside a GCCSA, and the
    // non-capital SA4s do not.
    case 'GCCSA':
      return 'STATE';
    case 'SA4':
      return 'STATE';
  }
}

/**
 * Whether two levels describe overlapping ground.
 *
 * GCCSA and SA4 both partition a state, so a figure at one level and a figure
 * at the other may cover the same vacancy. Summing across them double counts.
 * Callers that aggregate must consult this rather than assume levels are
 * disjoint.
 */
export function levelsOverlap(a: GeographyLevel, b: GeographyLevel): boolean {
  if (a === b) return false;
  const pair = new Set([a, b]);
  return pair.has('GCCSA') && pair.has('SA4');
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
  // Built from the level list rather than written out, so adding a level
  // cannot leave a bucket missing here and silently drop those areas.
  const summary = Object.fromEntries(
    geographyLevels.map((level) => [level, { total: 0, mappable: 0 }]),
  ) as Record<GeographyLevel, { total: number; mappable: number }>;

  for (const area of areas) {
    const bucket = summary[area.level];
    bucket.total += 1;
    if (area.hasGeometry) bucket.mappable += 1;
  }

  return summary;
}
