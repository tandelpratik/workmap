import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import mapshaper from 'mapshaper';
import { findSourceDescriptor } from '@/config/sources';

/**
 * Geometry build (ADR-0003).
 *
 * Downloads authoritative ABS boundary files, extracts the geography registry,
 * and produces simplified display geometry as static artefacts.
 *
 * Source geometry and display geometry are kept separate. The downloaded ABS
 * archives are the source: they live in data/raw/, are gitignored, are
 * checksummed here, and can be re-fetched at any time. The TopoJSON tiers are
 * display geometry, derived from the source by the parameters recorded in the
 * manifest. Simplification is therefore reversible in the sense that matters:
 * nothing is lost, because the original is never modified and the derivation is
 * reproducible.
 *
 * Licence: ASGS boundaries are CC BY 4.0. Commercial use, redistribution and
 * adaptation are permitted with attribution, and the attribution must indicate
 * that changes were made, because simplification is a change. See
 * docs/compliance/SOURCE_REGISTER.md.
 *
 * Run with: npm run geo:build
 */

const SOURCE_KEY = 'abs-asgs';

/** ASGS Edition 4, July 2026 to June 2031. Part of geography identity. */
const EDITION = 'ASGS2026';
const DATUM = 'GDA2020';

const BASE_URL =
  'https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/' +
  'edition-4-july-2026-june-2031/access-and-downloads/digital-boundary-files';

const RAW_DIR = join('data', 'raw', 'asgs-2026');
const WORK_DIR = join('data', 'tmp', 'geometry');
const REGISTRY_DIR = join('data', 'geography');
const PUBLIC_DIR = join('public', 'geography');

interface LayerSpec {
  readonly level: 'COUNTRY' | 'STATE' | 'GCCSA' | 'SA4';
  readonly archive: string;
  readonly codeField: string;
  readonly nameField: string;
  /** Null for the root of the hierarchy. */
  readonly parentCodeField: string | null;
}

const LAYERS: readonly LayerSpec[] = [
  {
    level: 'COUNTRY',
    archive: 'AUS_2026_AUST_SHP_GDA2020.zip',
    codeField: 'AUS_CODE26',
    nameField: 'AUS_NAME26',
    parentCodeField: null,
  },
  {
    level: 'STATE',
    archive: 'STE_2026_AUST_SHP_GDA2020.zip',
    codeField: 'STE_CODE26',
    nameField: 'STE_NAME26',
    parentCodeField: 'AUS_CODE26',
  },
  {
    // Beside SA4, not above it. JSA IVI reports the eight capital cities at
    // this level and the rest of the country at SA4, so both are needed for a
    // national picture. The shapefile abbreviates the field to GCC, not GCCSA.
    level: 'GCCSA',
    archive: 'GCCSA_2026_AUST_SHP_GDA2020.zip',
    codeField: 'GCC_CODE26',
    nameField: 'GCC_NAME26',
    parentCodeField: 'STE_CODE26',
  },
  {
    level: 'SA4',
    archive: 'SA4_2026_AUST_SHP_GDA2020.zip',
    codeField: 'SA4_CODE26',
    nameField: 'SA4_NAME26',
    parentCodeField: 'STE_CODE26',
  },
];

/**
 * Simplification tiers. Retained percentage of vertices, per ADR-0003: an
 * aggressive national overview, and a finer per-state tier loaded only on
 * drilldown.
 */
const TIERS = {
  /**
   * National view. SA4s are small on screen here, so heavy simplification is
   * invisible and the payload matters more. Island rings below the vertex
   * threshold are dropped: at this zoom they are sub-pixel, and carrying them
   * doubled the transfer size. Measured: 0.7% with the island filter is 45 KB
   * gzipped, against 116 KB at 2% with every ring retained.
   *
   * This is a display generalisation and is disclosed as such. No feature is
   * lost: a build-time check asserts every geography-bearing area survives.
   */
  overview: { retain: '0.7%', minIslandVertices: 20 },
  /** Drilldown view, one file per state, loaded only when a state is opened. */
  detail: { retain: '12%', minIslandVertices: 0 },
} as const;

export interface RegistryEntry {
  readonly code: string;
  readonly name: string;
  readonly level: LayerSpec['level'];
  readonly parentCode: string | null;
  /**
   * False for classification areas that exist as codes but have no boundary,
   * such as offshore, migratory and no-usual-address areas. They are recorded
   * because a source may report against them, and they are never given
   * invented geometry.
   */
  readonly hasGeometry: boolean;
  /** As published by the ABS. Null when the area has no extent. */
  readonly areaSqKm: number | null;
  /**
   * What the ABS says changed for this area since the previous edition, for
   * example "No change" or "Name change".
   *
   * This is what makes it safe to join data published against an older edition.
   * If every area reports no code or boundary change, an older series keys to
   * the current registry without mislabelling geography.
   */
  readonly changeSincePreviousEdition: string | null;
}

interface GeoJsonFeature {
  properties: Record<string, unknown>;
  geometry: unknown | null;
}

function log(message: string, extra?: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ level: 'info', message, ...extra }));
}

async function sha256(path: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

async function download(archive: string): Promise<string> {
  const target = join(RAW_DIR, archive);
  if (existsSync(target)) {
    log('Archive already present, not re-downloading', { archive });
    return target;
  }

  const url = `${BASE_URL}/${archive}`;
  log('Downloading archive', { archive });

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${archive}: HTTP ${response.status}`);
  }

  await mkdir(RAW_DIR, { recursive: true });
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
  return target;
}

/** Full-precision GeoJSON, used to read attributes and detect null geometry. */
async function toGeoJson(archivePath: string, out: string): Promise<GeoJsonFeature[]> {
  await mapshaper.runCommands(`-i "${archivePath}" -o format=geojson "${out}"`);
  const parsed = JSON.parse(await readFile(out, 'utf8')) as {
    features?: GeoJsonFeature[];
  };
  return parsed.features ?? [];
}

function buildRegistry(
  layer: LayerSpec,
  features: readonly GeoJsonFeature[],
): RegistryEntry[] {
  return features.map((feature) => {
    const properties = feature.properties;
    const code = String(properties[layer.codeField] ?? '').trim();
    const name = String(properties[layer.nameField] ?? '').trim();

    if (!code || !name) {
      throw new Error(
        `Record in ${layer.level} is missing code or name. The source schema may have changed.`,
      );
    }

    const parentRaw = layer.parentCodeField ? properties[layer.parentCodeField] : null;
    const parentCode =
      parentRaw === null || parentRaw === undefined || String(parentRaw).trim() === ''
        ? null
        : String(parentRaw).trim();

    const areaRaw = properties['AREASQKM26'];
    const areaSqKm =
      typeof areaRaw === 'number' && Number.isFinite(areaRaw) ? areaRaw : null;

    const changeRaw = properties['CHG_LBL26'];
    const changeSincePreviousEdition =
      typeof changeRaw === 'string' && changeRaw.trim() !== '' ? changeRaw.trim() : null;

    return {
      code,
      name,
      level: layer.level,
      parentCode,
      hasGeometry: feature.geometry !== null && feature.geometry !== undefined,
      areaSqKm,
      changeSincePreviousEdition,
    };
  });
}

/**
 * Counts what changed per level since the previous edition.
 *
 * Recorded in the manifest so the decision to join older data to this edition
 * rests on the source's own statement rather than on a claim in a document.
 */
export function summariseEditionChanges(
  entries: readonly RegistryEntry[],
): Record<string, Record<string, number>> {
  const summary: Record<string, Record<string, number>> = {};
  for (const entry of entries) {
    const label = entry.changeSincePreviousEdition ?? 'Not stated';
    let bucket = summary[entry.level];
    if (!bucket) {
      bucket = {};
      summary[entry.level] = bucket;
    }
    bucket[label] = (bucket[label] ?? 0) + 1;
  }
  return summary;
}

/**
 * Structural checks before anything is written. A boundary release that fails
 * these is a source problem, and importing it would corrupt the registry.
 */
export function validateRegistry(entries: readonly RegistryEntry[]): string[] {
  const problems: string[] = [];
  const byLevel = new Map<string, Set<string>>();

  for (const entry of entries) {
    const codes = byLevel.get(entry.level) ?? new Set<string>();
    if (codes.has(entry.code)) {
      problems.push(`Duplicate ${entry.level} code: ${entry.code}`);
    }
    codes.add(entry.code);
    byLevel.set(entry.level, codes);
  }

  const countries = byLevel.get('COUNTRY') ?? new Set();
  const states = byLevel.get('STATE') ?? new Set();

  if (countries.size === 0) problems.push('No COUNTRY records found.');
  if (states.size === 0) problems.push('No STATE records found.');

  for (const entry of entries) {
    if (entry.level === 'COUNTRY') {
      if (entry.parentCode !== null) {
        problems.push(`COUNTRY ${entry.code} should have no parent.`);
      }
      continue;
    }

    if (entry.parentCode === null) {
      problems.push(`${entry.level} ${entry.code} has no parent code.`);
      continue;
    }

    const parentLevel = entry.level === 'STATE' ? countries : states;
    if (!parentLevel.has(entry.parentCode)) {
      problems.push(
        `${entry.level} ${entry.code} references parent ${entry.parentCode}, which does not exist.`,
      );
    }
  }

  return problems;
}

/** Counts features in a TopoJSON object, so nothing is silently dropped. */
async function topoFeatureIds(path: string): Promise<Set<string>> {
  const topology = JSON.parse(await readFile(path, 'utf8')) as {
    objects: Record<string, { geometries?: { id?: string | number }[] }>;
  };
  const ids = new Set<string>();
  for (const object of Object.values(topology.objects)) {
    for (const geometry of object.geometries ?? []) {
      if (geometry.id !== undefined) ids.add(String(geometry.id));
    }
  }
  return ids;
}

async function buildTiers(
  sa4Archive: string,
  steArchive: string,
  gccsaArchive: string,
  registry: readonly RegistryEntry[],
): Promise<string[]> {
  await mkdir(PUBLIC_DIR, { recursive: true });
  const written: string[] = [];

  const islandFilter =
    TIERS.overview.minIslandVertices > 0
      ? `-filter-islands min-vertices=${TIERS.overview.minIslandVertices} `
      : '';

  // Overview tiers for the national view. Areas with no boundary drop out
  // naturally; they are never given an invented shape.
  const overview = join(PUBLIC_DIR, `sa4-overview-${EDITION}.topo.json`);
  await mapshaper.runCommands(
    `-i "${sa4Archive}" -filter-fields SA4_CODE26,SA4_NAME26,STE_CODE26 ` +
      `-simplify ${TIERS.overview.retain} keep-shapes ${islandFilter}-clean ` +
      `-o format=topojson id-field=SA4_CODE26 "${overview}"`,
  );
  written.push(overview);

  // The capital cities. JSA IVI reports these instead of their constituent
  // SA4s, so without this layer the map has eight holes over most of the
  // population. Drawn from the same simplification tier as the SA4 overview so
  // the two read as one surface where they meet.
  const gccsa = join(PUBLIC_DIR, `gccsa-overview-${EDITION}.topo.json`);
  await mapshaper.runCommands(
    `-i "${gccsaArchive}" -filter-fields GCC_CODE26,GCC_NAME26,STE_CODE26 ` +
      `-simplify ${TIERS.overview.retain} keep-shapes ${islandFilter}-clean ` +
      `-o format=topojson id-field=GCC_CODE26 "${gccsa}"`,
  );
  written.push(gccsa);

  const states = join(PUBLIC_DIR, `state-overview-${EDITION}.topo.json`);
  await mapshaper.runCommands(
    `-i "${steArchive}" -filter-fields STE_CODE26,STE_NAME26 ` +
      `-simplify ${TIERS.overview.retain} keep-shapes ${islandFilter}-clean ` +
      `-o format=topojson id-field=STE_CODE26 "${states}"`,
  );
  written.push(states);

  // Detail: one file per state.
  //
  // TopoJSON holds several layers as objects inside one topology, so writing a
  // split result to a directory produces a single combined file. That would
  // defeat the point of the tier, which is to transfer one state rather than
  // all of them, so each layer is written with its own -o target= clause.
  //
  // Simplification runs before the split, over the whole dataset, so shared
  // state borders stay identical between files rather than drifting apart.
  const detailDir = join(PUBLIC_DIR, `sa4-detail-${EDITION}`);
  await rm(detailDir, { recursive: true, force: true });
  await mkdir(detailDir, { recursive: true });

  const stateCodes = registry
    .filter((entry) => entry.level === 'STATE' && entry.hasGeometry)
    .map((entry) => entry.code);

  const outputs = stateCodes
    .map(
      (code) =>
        `-o target=${code} format=topojson id-field=SA4_CODE26 ` +
        `"${join(detailDir, `sa4-${code}.topo.json`)}"`,
    )
    .join(' ');

  //
  // GCC_CODE26 is carried here and not in the overview tier. The state view
  // draws a capital city from its constituent SA4s, because the capital and
  // the regions around it must come from the same simplification tier or their
  // shared border does not meet. Knowing which SA4s make up Greater Sydney is
  // what makes that possible, and it is a fact the ABS publishes on the SA4
  // boundaries themselves rather than one this project may infer.
  await mapshaper.runCommands(
    `-i "${sa4Archive}" -filter-fields SA4_CODE26,SA4_NAME26,STE_CODE26,GCC_CODE26,GCC_NAME26 ` +
      `-simplify ${TIERS.detail.retain} keep-shapes -clean ` +
      `-split STE_CODE26 ${outputs}`,
  );
  // The capitals, at the same tier and dissolved from the same SA4s.
  //
  // A capital is one figure in the data and many SA4s in the boundary file, so
  // it is merged here rather than drawn as its parts. Drawing the parts would
  // show internal borders the figure does not have, and outlining a selected
  // capital would trace every one of them. Dissolving after the same
  // simplification means its edge is made of the very arcs its neighbours use,
  // so the two meet exactly.
  const capitalOutputs = stateCodes
    .map(
      (code) =>
        `-o target=${code} format=topojson id-field=GCC_CODE26 ` +
        `"${join(detailDir, `gccsa-${code}.topo.json`)}"`,
    )
    .join(' ');

  await mapshaper.runCommands(
    `-i "${sa4Archive}" -filter-fields SA4_CODE26,SA4_NAME26,STE_CODE26,GCC_CODE26,GCC_NAME26 ` +
      `-simplify ${TIERS.detail.retain} keep-shapes -clean ` +
      `-dissolve GCC_CODE26 copy-fields=STE_CODE26,GCC_NAME26 ` +
      `-split STE_CODE26 ${capitalOutputs}`,
  );

  for (const file of await readdir(detailDir)) written.push(join(detailDir, file));

  // Simplification must not lose an area. Losing one would put a hole in the
  // map with no error anywhere, so this is checked rather than assumed.
  const expected = new Set(
    registry
      .filter((entry) => entry.level === 'SA4' && entry.hasGeometry)
      .map((entry) => entry.code),
  );
  const rendered = await topoFeatureIds(overview);
  const missing = [...expected].filter((code) => !rendered.has(code));
  if (missing.length > 0) {
    throw new Error(
      `Simplification dropped ${missing.length} SA4 area(s) from the overview tier: ` +
        `${missing.slice(0, 10).join(', ')}. Reduce simplification or relax the island filter.`,
    );
  }

  return written;
}

export async function build(): Promise<void> {
  await mkdir(WORK_DIR, { recursive: true });
  await mkdir(REGISTRY_DIR, { recursive: true });

  const registry: RegistryEntry[] = [];
  const sources: Record<string, { url: string; sha256: string; bytes: number }> = {};

  for (const layer of LAYERS) {
    const archivePath = await download(layer.archive);
    const info = await stat(archivePath);
    sources[layer.level] = {
      url: `${BASE_URL}/${layer.archive}`,
      sha256: await sha256(archivePath),
      bytes: info.size,
    };

    const geojson = join(WORK_DIR, `${layer.level}.geojson`);
    const features = await toGeoJson(archivePath, geojson);
    const entries = buildRegistry(layer, features);
    registry.push(...entries);

    log('Layer read', {
      layer: layer.level,
      records: entries.length,
      withoutGeometry: entries.filter((e) => !e.hasGeometry).length,
    });
  }

  const problems = validateRegistry(registry);
  if (problems.length > 0) {
    throw new Error(
      `Registry validation failed, nothing written:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
  }

  const registryPath = join(REGISTRY_DIR, `registry-${EDITION}.json`);
  await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

  const written = await buildTiers(
    join(RAW_DIR, 'SA4_2026_AUST_SHP_GDA2020.zip'),
    join(RAW_DIR, 'STE_2026_AUST_SHP_GDA2020.zip'),
    join(RAW_DIR, 'GCCSA_2026_AUST_SHP_GDA2020.zip'),
    registry,
  );

  const artefacts: Record<string, number> = {};
  for (const file of written) {
    artefacts[file.split(/[\\/]/).slice(-2).join('/')] = (await stat(file)).size;
  }

  // CC BY 4.0 obliges attribution to travel with redistributed material. These
  // files are served publicly, so the notice ships beside them rather than
  // depending on a UI change that might not happen. The wording comes from the
  // source registry, so it cannot drift from what compliance recorded.
  const descriptor = findSourceDescriptor(SOURCE_KEY);
  if (!descriptor?.attributionText) {
    throw new Error(
      `Source "${SOURCE_KEY}" has no attribution text. Boundary files must not be ` +
        'published without the wording its licence requires.',
    );
  }
  await writeFile(
    join(PUBLIC_DIR, 'ATTRIBUTION.txt'),
    [
      descriptor.attributionText,
      '',
      'Licence: https://creativecommons.org/licenses/by/4.0/',
      `Source: ${BASE_URL}`,
      '',
    ].join('\n'),
  );

  const manifest = {
    edition: EDITION,
    editionLabel: 'ASGS Edition 4, July 2026 to June 2031',
    datum: DATUM,
    sourceKey: SOURCE_KEY,
    licence: 'CC BY 4.0',
    generatedAt: new Date().toISOString(),
    simplification: TIERS,
    sources,
    registry: {
      path: registryPath.replace(/\\/g, '/'),
      records: registry.length,
      withoutGeometry: registry.filter((e) => !e.hasGeometry).length,
    },
    /**
     * What the ABS reports as changed since the previous edition. Determines
     * whether a series published against an older edition can be joined to this
     * one by code without mislabelling geography.
     */
    editionCompatibility: {
      previousEdition: 'ASGS2021 (Edition 3, July 2021 to June 2026)',
      changesByLevel: summariseEditionChanges(registry),
    },
    artefacts,
  };

  await writeFile(
    join(REGISTRY_DIR, `manifest-${EDITION}.json`),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  log('Geometry build complete', {
    edition: EDITION,
    registryRecords: registry.length,
    artefacts: Object.keys(artefacts).length,
  });
}

if (process.argv[1]?.includes('build-geometry')) {
  build()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}
