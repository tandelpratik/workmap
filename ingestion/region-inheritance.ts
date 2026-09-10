import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { findRegion } from '@/integrations/smartjobs-qld/regions';
import { regionalStatuses, type RegionalStatus } from '@/domain/regional';

/**
 * Settling a listing that names a region rather than a place.
 *
 * Some sources publish neither a postcode nor a coordinate. Smart Jobs
 * Queensland publishes one or more names from a closed list of regions, and a
 * single advertisement routinely names several: one row in the corpus names 23,
 * which is a real statewide role rather than bad data.
 *
 * A region cannot be looked up in the instrument, because the instrument is
 * written in postcodes. So the question is asked the other way round, and the
 * answer comes from an artefact built by `npm run regional:build-regions`: for
 * every statistical area, do all the postcodes inside it fall the same side of
 * the line? That artefact is a join of two ABS allocations on the mesh block
 * they share, so it involves no boundary intersection and no overlap threshold.
 *
 * The rule here is unanimity, applied twice.
 *
 *   1. A region settles a listing only if every postcode inside that region
 *      agrees. The Brisbane areas hold postcodes on both sides, because the
 *      instrument lists outer suburbs such as 4019 to 4022 while leaving the
 *      inner city out, so they settle nothing.
 *   2. A listing naming several regions is settled only if every region it
 *      names gives the same answer. That is stricter than it needs to be for
 *      the common case and exactly right for the hard one: a role advertised
 *      across twelve regional centres is regional, and one advertised across
 *      Brisbane and Cairns together is not something this product can place.
 *
 * Anything else is UNKNOWN, which is an answer and not a failure.
 *
 * ## Why this reads the provider's vocabulary here
 *
 * The region names belong to one provider, so recognising them is an ingestion
 * concern rather than a domain one, and this module is the only place that
 * knows them. It is also self-gating: a location whose text does not parse
 * entirely into known region names is left alone. An Adzuna location like
 * "Unanderra, Wollongong Area" fails on the first part and never reaches the
 * region rule, which is correct, because those listings carry coordinates and
 * are settled by postcode instead.
 */

const ARTEFACT = join('data', 'regional', 'statistical-area-postcodes-2021.json');

/**
 * The artefact's own vocabulary. MIXED is not a `RegionalStatus`: it is a
 * statement about an area holding postcodes on both sides, which is a different
 * thing from a listing being in one.
 */
const areaStatuses = ['REGIONAL', 'NOT_REGIONAL', 'MIXED', 'UNKNOWN'] as const;

const artefactSchema = z.object({
  instrument: z.object({ id: z.string().min(1), registerId: z.string().min(1) }),
  areas: z
    .array(
      z.object({
        code: z.string().min(1),
        name: z.string().min(1),
        stateCode: z.string().nullable(),
        status: z.enum(areaStatuses),
        distinctPostcodes: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});

export type RegionArtefact = z.infer<typeof artefactSchema>;

/**
 * Reads the artefact.
 *
 * Validated rather than trusted even though this project generated it, for the
 * same reason the geography registry is: it is generated from a third-party
 * release whose schema can change, and a silently empty read would turn every
 * region into an unknown without anybody noticing.
 */
export async function loadRegionArtefact(): Promise<RegionArtefact> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(ARTEFACT, 'utf8'));
  } catch {
    throw new Error(
      `${ARTEFACT} is missing or unreadable. Run "npm run regional:build-regions" ` +
        'to produce it.',
    );
  }

  const parsed = artefactSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `${ARTEFACT} failed validation: ${parsed.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

export interface RegionLookup {
  /** Statistical area code to the verdict for the postcodes inside it. */
  readonly statusByCode: ReadonlyMap<string, (typeof areaStatuses)[number]>;
  /** Statistical area name to code, from the geography registry in force. */
  readonly codeByName: ReadonlyMap<string, string>;
}

/**
 * Builds the lookup.
 *
 * Names come from the registry the product actually uses and codes are the join
 * key, never names. Statistical area names are edited between editions while
 * their codes are not, and the artefact is built from the 2021 allocation while
 * the registry is Edition 4. Joining on the name would silently drop the
 * handful of areas that were renamed.
 */
export function buildRegionLookup(
  artefact: RegionArtefact,
  registryAreas: readonly { readonly code: string; readonly name: string }[],
): RegionLookup {
  const statusByCode = new Map(artefact.areas.map((area) => [area.code, area.status]));
  const codeByName = new Map(
    registryAreas.map((area) => [area.name.trim().toLowerCase(), area.code]),
  );
  return { statusByCode, codeByName };
}

/**
 * The verdict for a location described only by region names.
 *
 * Returns null when the text is not a list of known regions, which is the
 * signal to leave the location to another rule rather than an answer about it.
 */
export function classifyByRegions(
  lookup: RegionLookup,
  rawText: string,
): RegionalStatus | null {
  const parts = rawText
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (parts.length === 0) return null;

  const verdicts = new Set<string>();

  for (const part of parts) {
    const region = findRegion(part);
    // Not this provider's vocabulary at all. Say nothing rather than guess.
    if (region === undefined) return null;

    // A recognised entry that is not a place: "Flexible", "Various", "Other -
    // Outside Qld". It contributes nothing and must not settle anything, so it
    // is skipped rather than counted as agreement.
    if (region.sa4Name === null) continue;

    const code = lookup.codeByName.get(region.sa4Name.trim().toLowerCase());
    if (code === undefined) return null;

    const status = lookup.statusByCode.get(code);
    if (status === undefined) return null;
    verdicts.add(status);
  }

  // Every named region was a non-place, so nothing was actually named.
  if (verdicts.size === 0) return null;

  // Unanimity or nothing. A single mixed or disagreeing region is enough to
  // leave the listing unplaced, which is the honest outcome.
  if (verdicts.size > 1) return 'UNKNOWN';

  const [only] = [...verdicts];
  if (only === 'REGIONAL' || only === 'NOT_REGIONAL') {
    return regionalStatuses.find((status) => status === only) ?? 'UNKNOWN';
  }
  return 'UNKNOWN';
}
