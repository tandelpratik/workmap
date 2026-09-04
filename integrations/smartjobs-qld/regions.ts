/**
 * The portal's region vocabulary.
 *
 * This is the reason Smart Jobs is worth building first. Workday publishes
 * free text like "Telstra Store Roma", which needs a gazetteer and a fuzzy
 * resolver. This portal publishes a closed list of named Queensland regions,
 * so placing a listing is a lookup rather than a guess.
 *
 * The names sit close to ABS SA4 names without matching them, which is exactly
 * why the mapping is written out rather than inferred: "Cairns region" is not
 * the string "Cairns", and quietly trimming the suffix would be a fabricated
 * geography mapping, which the constitution forbids.
 *
 * `sa4Name` is the ABS SA4 label. Every mapped name here was checked against
 * the imported ASGS 2026 geography on 2026-09-01 and all 22 resolve to a real
 * SA4 row, so these are verified names rather than intentions.
 *
 * They are still not wired to anything: resolving a listing to an SA4 code and
 * placing it on a map is a separate milestone. A name matching is necessary
 * but not sufficient, and nothing here places a listing yet.
 */

export interface SmartJobsRegion {
  /** Exactly as the portal writes it. The join key. */
  readonly portalName: string;
  /** Intended ABS SA4 name. Null where the portal name is not a place. */
  readonly sa4Name: string | null;
  /** Whether the region lies outside Greater Brisbane. */
  readonly isRegional: boolean;
}

/**
 * Observed on 2026-08-31 from the portal's own location filter and from the
 * localities rendered on result rows.
 *
 * Deliberately not exhaustive-by-assumption: an unrecognised region is left
 * unmapped rather than approximated, in line with the rule that an unmapped
 * value stays unmapped.
 */
export const smartJobsRegions: readonly SmartJobsRegion[] = [
  {
    portalName: 'Brisbane Inner City',
    sa4Name: 'Brisbane Inner City',
    isRegional: false,
  },
  { portalName: 'Brisbane - North', sa4Name: 'Brisbane - North', isRegional: false },
  { portalName: 'Brisbane - South', sa4Name: 'Brisbane - South', isRegional: false },
  { portalName: 'Brisbane - East', sa4Name: 'Brisbane - East', isRegional: false },
  { portalName: 'Brisbane - West', sa4Name: 'Brisbane - West', isRegional: false },
  {
    portalName: 'Moreton Bay - North',
    sa4Name: 'Moreton Bay - North',
    isRegional: false,
  },
  {
    portalName: 'Moreton Bay - South',
    sa4Name: 'Moreton Bay - South',
    isRegional: false,
  },
  { portalName: 'Logan - Beaudesert', sa4Name: 'Logan - Beaudesert', isRegional: false },
  { portalName: 'Ipswich region', sa4Name: 'Ipswich', isRegional: false },
  { portalName: 'Gold Coast', sa4Name: 'Gold Coast', isRegional: true },
  { portalName: 'Sunshine Coast', sa4Name: 'Sunshine Coast', isRegional: true },
  { portalName: 'Cairns region', sa4Name: 'Cairns', isRegional: true },
  { portalName: 'Townsville region', sa4Name: 'Townsville', isRegional: true },
  {
    portalName: 'Mackay region',
    sa4Name: 'Mackay - Isaac - Whitsunday',
    isRegional: true,
  },
  { portalName: 'Rockhampton region', sa4Name: 'Central Queensland', isRegional: true },
  { portalName: 'Toowoomba region', sa4Name: 'Toowoomba', isRegional: true },
  {
    portalName: 'Darling Downs - Maranoa',
    sa4Name: 'Darling Downs - Maranoa',
    isRegional: true,
  },
  { portalName: 'Wide Bay', sa4Name: 'Wide Bay', isRegional: true },
  { portalName: 'Central West Qld', sa4Name: 'Queensland - Outback', isRegional: true },
  { portalName: 'North West Qld', sa4Name: 'Queensland - Outback', isRegional: true },
  { portalName: 'South West Qld', sa4Name: 'Queensland - Outback', isRegional: true },
  { portalName: 'Far North Qld', sa4Name: 'Queensland - Outback', isRegional: true },
  // Not places. Carried so they are recognised and deliberately not mapped,
  // rather than falling through as unknown regions every run.
  { portalName: 'Flexible', sa4Name: null, isRegional: false },
  { portalName: 'Various', sa4Name: null, isRegional: false },
  { portalName: 'Other - Outside Qld', sa4Name: null, isRegional: false },
];

const byPortalName = new Map(
  smartJobsRegions.map((region) => [region.portalName.toLowerCase(), region]),
);

/** Null when the portal used a name this adapter has not seen. */
export function findRegion(portalName: string): SmartJobsRegion | undefined {
  return byPortalName.get(portalName.trim().toLowerCase());
}

/**
 * The names a run met that this adapter does not know.
 *
 * Ingestion reports these rather than dropping them silently, so the
 * vocabulary can be extended deliberately when the portal adds a region.
 */
export function unrecognisedRegions(localities: readonly string[]): readonly string[] {
  return localities.filter((name) => findRegion(name) === undefined);
}
