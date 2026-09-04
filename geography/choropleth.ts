import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { geoConicEqualArea, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import type { Topology } from 'topojson-specification';
import type { GeographyLevel } from '@/domain/geography';

/**
 * Choropleth geometry, prepared on the server.
 *
 * Boundaries are decoded, projected and turned into path strings here so the
 * browser receives finished SVG. No mapping library is shipped to the client:
 * the national view is a static picture, and sending a tile engine to draw it
 * would cost the reader far more than the map is worth (ADR-0003, free-tier
 * rules).
 *
 * The projection is equal-area on purpose. A vacancy choropleth invites the
 * eye to compare the size of coloured regions, and a Mercator would inflate
 * the southern states relative to the tropics while doing so.
 */

const ARTEFACT_DIR = join(process.cwd(), 'public', 'geography');

/** Which file holds each level's overview geometry. */
const OVERVIEW_FILES: Partial<Record<GeographyLevel, string>> = {
  STATE: 'state-overview',
  GCCSA: 'gccsa-overview',
  SA4: 'sa4-overview',
};

export interface ProjectedArea {
  /** ASGS code, the join key back to the registry. */
  readonly code: string;
  /** SVG path data in viewBox coordinates. */
  readonly d: string;
}

export interface ChoroplethGeometry {
  readonly width: number;
  readonly height: number;
  /** Outlines drawn under the data so the frame is always legible. */
  readonly base: readonly ProjectedArea[];
  /** One shape per region, keyed by the code the data reports it under. */
  readonly areasByCode: ReadonlyMap<string, ProjectedArea>;
}

async function readTopology(name: string, edition: string): Promise<Topology> {
  const path = join(ARTEFACT_DIR, `${name}-${edition}.topo.json`);
  return JSON.parse(await readFile(path, 'utf8')) as Topology;
}

/** Every object in a topology, as one collection. */
function featuresOf(topology: Topology): Feature<Geometry>[] {
  const collections = Object.keys(topology.objects).map(
    (key) => feature(topology, topology.objects[key]!) as FeatureCollection<Geometry>,
  );
  return collections.flatMap((collection) => collection.features);
}

function codeOf(item: Feature<Geometry>): string | null {
  if (item.id !== undefined && item.id !== null) return String(item.id);
  // mapshaper writes the id field as the feature id, but a topology built with
  // different options can leave it in properties. Both are read rather than
  // assuming one, because a missing code silently drops a region from the map.
  const properties = (item.properties ?? {}) as Record<string, unknown>;
  for (const key of ['GCC_CODE26', 'SA4_CODE26', 'STE_CODE26']) {
    const value = properties[key];
    if (typeof value === 'string' && value !== '') return value;
  }
  return null;
}

/**
 * Projects the base outline and the requested data levels into one frame.
 *
 * The projection is fitted to the **states**, never to the data. Fitting it to
 * whatever regions happen to have figures would rescale the map as coverage
 * changed, so a partial import would silently render a zoomed-in map of one
 * state that looks like the whole country.
 */
export async function buildChoroplethGeometry(options: {
  readonly edition: string;
  readonly levels: readonly GeographyLevel[];
  readonly width?: number;
  readonly height?: number;
}): Promise<ChoroplethGeometry> {
  const width = options.width ?? 960;
  const height = options.height ?? 800;

  const states = featuresOf(await readTopology('state-overview', options.edition));

  // Australian Albers. Standard parallels and central meridian are the
  // conventional ones for the continent, so the result matches how Australia
  // is normally drawn in an atlas.
  const projection = geoConicEqualArea()
    .parallels([-18, -36])
    .rotate([-134, 0])
    .fitSize([width, height], {
      type: 'FeatureCollection',
      features: states,
    } as FeatureCollection<Geometry>);
  const path = geoPath(projection);

  const toArea = (item: Feature<Geometry>): ProjectedArea | null => {
    const code = codeOf(item);
    if (code === null) return null;
    const d = path(item);
    // Areas with no drawable geometry exist in the registry on purpose
    // (offshore, migratory, no usual address). They are skipped rather than
    // given an invented shape.
    if (d === null || d === '') return null;
    return { code, d };
  };

  const base = states.map(toArea).filter((area): area is ProjectedArea => area !== null);

  const areasByCode = new Map<string, ProjectedArea>();
  for (const level of options.levels) {
    const file = OVERVIEW_FILES[level];
    if (file === undefined) continue;
    for (const item of featuresOf(await readTopology(file, options.edition))) {
      const area = toArea(item);
      if (area !== null) areasByCode.set(area.code, area);
    }
  }

  return { width, height, base, areasByCode };
}

/**
 * One state, drawn from the detail tier.
 *
 * The drilldown ADR-0003 planned for. Boundaries here are an order of
 * magnitude finer than in the national view, which is affordable because one
 * state's file is transferred rather than the whole country's.
 *
 * Capitals are why this is not the national map cropped. JSA IVI reports a
 * capital as one figure and the rest of a state SA4 by SA4, so a state view
 * must draw Greater Sydney as one region and the regions around it
 * individually. Taking the capital from the national tier and its neighbours
 * from this one would leave a seam along every shared border, so the build
 * dissolves the capitals from these same SA4s at this same simplification and
 * they are read from that file.
 *
 * Which codes carry data is the caller's business, not this module's, so it
 * passes them in and geography stays free of any knowledge of the database.
 */
export async function buildStateChoroplethGeometry(options: {
  readonly edition: string;
  readonly stateCode: string;
  /** The codes the data reports on, at whatever level it reports them. */
  readonly regionCodes: ReadonlySet<string>;
  readonly width?: number;
  readonly height?: number;
}): Promise<ChoroplethGeometry> {
  const width = options.width ?? 960;
  const height = options.height ?? 800;

  const states = featuresOf(await readTopology('state-overview', options.edition));
  const outline = states.filter((item) => codeOf(item) === options.stateCode);
  if (outline.length === 0) {
    throw new Error(`No state outline for code "${options.stateCode}".`);
  }

  const detailDir = join(ARTEFACT_DIR, `sa4-detail-${options.edition}`);
  const readDetail = async (prefix: string): Promise<Topology> =>
    JSON.parse(
      await readFile(join(detailDir, `${prefix}-${options.stateCode}.topo.json`), 'utf8'),
    ) as Topology;

  // Fitted to the state, so the drilldown fills the frame. The national view
  // fits the country. Both fit an outline rather than the data, so a change in
  // coverage can never rescale the map.
  const projection = geoConicEqualArea()
    .parallels([-18, -36])
    .rotate([-134, 0])
    .fitSize([width, height], {
      type: 'FeatureCollection',
      features: outline,
    } as FeatureCollection<Geometry>);
  const path = geoPath(projection);

  const toArea = (item: Feature<Geometry>): ProjectedArea | null => {
    const code = codeOf(item);
    if (code === null) return null;
    const d = path(item);
    if (d === null || d === '') return null;
    return { code, d };
  };

  const base = outline
    .map(toArea)
    .filter((area): area is ProjectedArea => area !== null)
    .map((area) => ({ ...area, code: options.stateCode }));

  // Only codes the data reports on are drawn. An SA4 inside a capital is not
  // missing data, it is reported as part of the capital, and shading it as a
  // gap would invent a hole in the middle of the city.
  const areasByCode = new Map<string, ProjectedArea>();
  for (const prefix of ['gccsa', 'sa4']) {
    for (const item of featuresOf(await readDetail(prefix))) {
      const area = toArea(item);
      if (area === null || !options.regionCodes.has(area.code)) continue;
      areasByCode.set(area.code, area);
    }
  }

  return { width, height, base, areasByCode };
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

export interface Bin {
  readonly min: number;
  readonly max: number;
  /** 0 is the lightest tint. */
  readonly step: number;
}

/**
 * Quantile bins over the values present.
 *
 * Quantiles rather than equal intervals because the distribution is extremely
 * skewed: Greater Sydney carries tens of thousands of advertisements and a
 * regional SA4 carries hundreds, so equal intervals would put every region
 * into the palest band and show nothing but the capitals.
 *
 * The trade-off is stated on the page: quantile shading shows rank, not
 * magnitude, and the legend prints the real range of each band so a reader can
 * see what the colour stands for.
 */
export function quantileBins(values: readonly number[], count: number): Bin[] {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return [];

  const bins: Bin[] = [];
  const size = sorted.length / count;
  for (let step = 0; step < count; step += 1) {
    const from = sorted[Math.floor(step * size)];
    const toIndex = Math.min(sorted.length - 1, Math.ceil((step + 1) * size) - 1);
    const to = sorted[toIndex];
    if (from === undefined || to === undefined) continue;
    // Collapse duplicate bands rather than printing two identical ranges.
    if (bins.length > 0 && bins[bins.length - 1]!.max >= to) continue;
    bins.push({ min: from, max: to, step: bins.length });
  }
  return bins;
}

/** Which bin a value falls in, or null when it falls outside every band. */
export function binFor(bins: readonly Bin[], value: number): Bin | null {
  for (const bin of bins) {
    if (value <= bin.max) return bin;
  }
  return bins.length > 0 ? (bins[bins.length - 1] ?? null) : null;
}
