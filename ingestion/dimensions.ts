import { stateAbbreviation, type GeographyLevel } from '@/domain/geography';
import type { SourceDimension } from '@/domain/labour-market';

/**
 * Resolving what a source called something to what the registry calls it.
 *
 * Pure, and separate from the importer, because this is where a mistake is
 * silent: attaching a figure to the wrong area produces a plausible map rather
 * than an error. Milestone 04 already lost a country row to a code collision,
 * so the rules here are deliberately unforgiving.
 *
 *   - A match must be exact after normalisation. There is no fuzzy matching,
 *     no prefix matching and no nearest-neighbour.
 *   - A code or name that matches areas at more than one level is ambiguous,
 *     not a match. ASGS codes are unique only within a level: "ZZZ" is both a
 *     country and an SA4 (milestone 04).
 *   - Anything that does not resolve stays unresolved and keeps the source's
 *     own code and label. It is never approximated to the closest thing.
 */

export type DimensionResolution =
  | { readonly status: 'RESOLVED'; readonly id: string; readonly level: GeographyLevel }
  | { readonly status: 'UNRESOLVED'; readonly reason: string };

export interface GeographyCandidate {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly level: GeographyLevel;
}

export interface GeographyLookup {
  readonly byCode: ReadonlyMap<string, readonly GeographyCandidate[]>;
  readonly byName: ReadonlyMap<string, readonly GeographyCandidate[]>;
}

/**
 * Abbreviations for the states and territories.
 *
 * The ABS registry carries full names, and labour statistics are routinely
 * published against abbreviations. Each entry maps to a registry name, so the
 * ABS still supplies the code; this table only says that "NSW" and "New South
 * Wales" are the same place, which is not a matter of opinion. An abbreviation
 * that is not listed does not resolve.
 */
const stateAliases: Readonly<Record<string, string>> = {
  nsw: 'new south wales',
  vic: 'victoria',
  qld: 'queensland',
  sa: 'south australia',
  wa: 'western australia',
  tas: 'tasmania',
  nt: 'northern territory',
  act: 'australian capital territory',
  aus: 'australia',
  aust: 'australia',
  australia: 'australia',
};

/**
 * The conventional abbreviation for a state or territory.
 *
 * The table itself lives in the domain, because which letters stand for
 * Queensland is a fact about Australian geography rather than about this
 * importer, and the pages need the same answer when they ask for a state's
 * listings. What stays here is the alias resolution: turning whatever a
 * provider wrote into a registry name is an ingestion concern.
 */
export function australianStateCode(name: string): string | null {
  const normalised = normaliseName(name);
  return stateAbbreviation(stateAliases[normalised] ?? normalised);
}

export function normaliseCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function buildGeographyLookup(
  areas: readonly GeographyCandidate[],
): GeographyLookup {
  const byCode = new Map<string, GeographyCandidate[]>();
  const byName = new Map<string, GeographyCandidate[]>();

  const add = (
    map: Map<string, GeographyCandidate[]>,
    key: string,
    area: GeographyCandidate,
  ): void => {
    const existing = map.get(key);
    if (existing) existing.push(area);
    else map.set(key, [area]);
  };

  for (const area of areas) {
    add(byCode, normaliseCode(area.code), area);
    add(byName, normaliseName(area.name), area);
  }

  return { byCode, byName };
}

function unique(
  candidates: readonly GeographyCandidate[] | undefined,
  level?: GeographyLevel,
): GeographyCandidate | 'AMBIGUOUS' | null {
  const scoped =
    level === undefined
      ? candidates
      : candidates?.filter((candidate) => candidate.level === level);

  if (scoped === undefined || scoped.length === 0) return null;
  if (scoped.length > 1) return 'AMBIGUOUS';
  return scoped[0] ?? null;
}

/**
 * Resolves a name when the caller already knows which level it belongs to.
 *
 * The general resolver treats a name matching two levels as ambiguous, which is
 * right when the level is unknown and wrong when it is not. Real Adzuna data
 * showed why both exist: the ASGS registry contains two areas called
 * "Australian Capital Territory", the state and the SA4 inside it, so every
 * Canberra advertisement failed to resolve. A provider that states its
 * hierarchy broadest-first has told us the level, and using that is reading the
 * source rather than guessing past it.
 */
export function resolveGeographyAtLevel(
  lookup: GeographyLookup,
  name: string,
  level: GeographyLevel,
): DimensionResolution {
  const normalised = normaliseName(name);
  const aliased = stateAliases[normalised] ?? normalised;
  const match = unique(lookup.byName.get(aliased), level);

  if (match === 'AMBIGUOUS') {
    return {
      status: 'UNRESOLVED',
      reason: `Name "${name}" matches more than one ${level} area, so it is ambiguous.`,
    };
  }
  if (match === null) {
    return {
      status: 'UNRESOLVED',
      reason: `No ${level} in the registry is named "${name}". The source's own label is kept.`,
    };
  }
  return { status: 'RESOLVED', id: match.id, level: match.level };
}

/**
 * Resolves a geography the source named, preferring its code.
 *
 * Milestone 04b established that an IVI series keyed by SA4 code joins
 * correctly to the Edition 4 registry whichever edition it was published
 * against, and that names must never be the join: four SA4 names differ
 * between editions. The name path exists only because state and territory
 * series are published by name, and it is an exact match against the ABS
 * registry, not an interpretation of it.
 */
export function resolveGeography(
  lookup: GeographyLookup,
  dimension: SourceDimension,
): DimensionResolution {
  if (dimension.code !== null && dimension.code.trim() !== '') {
    const code = normaliseCode(dimension.code);
    const direct = unique(lookup.byCode.get(code));

    if (direct === 'AMBIGUOUS') {
      return {
        status: 'UNRESOLVED',
        reason: `Code "${dimension.code}" exists at more than one geography level, so it is ambiguous.`,
      };
    }
    if (direct !== null)
      return { status: 'RESOLVED', id: direct.id, level: direct.level };

    // A purely numeric code padded differently by the publisher, for example
    // "01" for state 1. Only applied to digits, where dropping leading zeros
    // cannot change which code is meant.
    if (/^\d+$/.test(code)) {
      const unpadded = code.replace(/^0+(?=\d)/, '');
      const padded = unique(lookup.byCode.get(unpadded));
      if (padded === 'AMBIGUOUS') {
        return {
          status: 'UNRESOLVED',
          reason: `Code "${dimension.code}" exists at more than one geography level, so it is ambiguous.`,
        };
      }
      if (padded !== null) {
        return { status: 'RESOLVED', id: padded.id, level: padded.level };
      }
    }
  }

  if (dimension.name !== null && dimension.name.trim() !== '') {
    const normalised = normaliseName(dimension.name);
    const aliased = stateAliases[normalised] ?? normalised;
    const byName = unique(lookup.byName.get(aliased));

    if (byName === 'AMBIGUOUS') {
      return {
        status: 'UNRESOLVED',
        reason: `Name "${dimension.name}" matches areas at more than one geography level, so it is ambiguous.`,
      };
    }
    if (byName !== null)
      return { status: 'RESOLVED', id: byName.id, level: byName.level };
  }

  const stated = dimension.code ?? dimension.name ?? '(nothing)';
  return {
    status: 'UNRESOLVED',
    reason: `No geography in the registry matches "${stated}". The source's own code and label are kept.`,
  };
}

export interface OccupationCandidate {
  readonly id: string;
  readonly code: string;
  readonly classificationVersion: string;
}

/**
 * Resolves an occupation by its code.
 *
 * Names are not a fallback here. Occupation titles are long, are edited
 * between classification versions, and several differ only in a qualifier, so
 * a name match would be a guess dressed as a join. Until the classification is
 * loaded at milestone 11 this resolves nothing, which is the correct answer:
 * the source's code and title are kept on the series and resolve later without
 * a re-import.
 */
export function resolveOccupation(
  byCode: ReadonlyMap<string, readonly OccupationCandidate[]>,
  dimension: SourceDimension,
):
  | { readonly status: 'RESOLVED'; readonly id: string }
  | { readonly status: 'UNRESOLVED'; readonly reason: string } {
  if (dimension.code === null || dimension.code.trim() === '') {
    return {
      status: 'UNRESOLVED',
      reason:
        'The source stated no occupation code, and titles are never matched by name.',
    };
  }

  const candidates = byCode.get(normaliseCode(dimension.code));
  if (candidates === undefined || candidates.length === 0) {
    return {
      status: 'UNRESOLVED',
      reason: `No occupation with code "${dimension.code}" is loaded. The source's code and title are kept.`,
    };
  }
  if (candidates.length > 1) {
    return {
      status: 'UNRESOLVED',
      reason: `Code "${dimension.code}" exists in more than one classification version, so it is ambiguous.`,
    };
  }

  const only = candidates[0];
  return only === undefined
    ? { status: 'UNRESOLVED', reason: 'No candidate.' }
    : { status: 'RESOLVED', id: only.id };
}
