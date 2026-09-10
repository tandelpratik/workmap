import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import mapshaper from 'mapshaper';
import { getDatabase } from '@/db/client';
import { normalisePostcode } from '@/domain/regional';
import type { Failure } from '@/lib/errors';
import { ok, type Result } from '@/lib/result';
import { logger } from '@/lib/logger';

/**
 * Gives a stored location its postcode, by placing the coordinates the source
 * published inside an official postal area.
 *
 * This exists because the definition of a designated regional area is written
 * entirely in postcodes and no job source publishes one. Adzuna returns a
 * suburb string and a latitude and longitude; Smart Jobs Queensland returns a
 * closed region vocabulary. Without this step the classifier can only settle
 * the states the instrument covers in full, which is five per cent of the
 * corpus.
 *
 * What this is, precisely: a spatial join. The coordinates are the source's own
 * statement about where the job is, and the boundary is the ABS's own statement
 * about where a postal area lies. Nothing is estimated, interpolated or
 * guessed, and a point that falls in no postal area gets no postcode rather
 * than the nearest one.
 *
 * Two limitations travel with every postcode this produces, and both are
 * recorded on the row rather than left in a comment:
 *
 *   1. ABS postal areas approximate Australia Post postcodes. They are built
 *      from mesh blocks to allow census data to be published against postcodes,
 *      and the ABS says plainly that they are an approximation. A boundary
 *      here is not the boundary a postal delivery run would use.
 *
 *   2. The 2021 edition is used, because Non-ABS Structures have not yet been
 *      released for ASGS Edition 4. Everything else in this product is Edition
 *      4. That mismatch is confined to this one lookup and never reaches the
 *      geography registry, because a postal area is not stored as a geography:
 *      it produces a postcode and is then out of the picture.
 *
 * The work is done by mapshaper rather than in JavaScript. The shapefile is
 * 80 MB and the full-precision GeoJSON is over 100 MB, which is a great deal of
 * memory to hold in order to test a few hundred points; mapshaper reads the
 * shapefile in its own compact form and answers the same question in about a
 * quarter of a second. Simplifying the boundaries to make them fit in memory
 * would have been the other option, and it is the wrong one: simplification
 * moves boundaries, and a moved boundary is exactly what changes the answer for
 * a point that sits near one.
 */

/** Where the archive lives once fetched. Gitignored, and re-fetchable. */
const RAW_DIR = join('data', 'raw', 'asgs-2021');
const WORK_DIR = join('data', 'tmp', 'postcodes');
const ARCHIVE = 'POA_2021_AUST_GDA2020_SHP.zip';

const DOWNLOAD_URL =
  'https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/' +
  'edition-3-july-2021-june-2026/access-and-downloads/digital-boundary-files/' +
  ARCHIVE;

/**
 * The archive as published, checked on every run.
 *
 * A re-published file under the same name would otherwise change every postcode
 * this produces with nothing to show that it had happened.
 */
const ARCHIVE_SHA256 = '92182d5e491a2dc0d49bd282283722701eef8a347ae072c04c344b4aeac2c49a';

/** The attribute carrying the postcode, and the label stored beside it. */
const POSTCODE_FIELD = 'POA_CODE21';
export const POSTCODE_REFERENCE = 'ABS Postal Areas 2021 (ASGS Edition 3, GDA2020)';

export interface PostcodeOutcome {
  readonly candidates: number;
  readonly placed: number;
  readonly unplaced: number;
  readonly written: number;
}

async function sha256(path: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

/**
 * The archive, fetched if it is not already held.
 *
 * Verified by checksum whether it was just downloaded or was already on disk.
 * A file that arrived some other way gets the same scrutiny as one this
 * function fetched.
 */
async function ensureArchive(): Promise<string> {
  const target = join(RAW_DIR, ARCHIVE);

  if (!existsSync(target)) {
    logger.info('Downloading postal area boundaries', { url: DOWNLOAD_URL });
    const response = await fetch(DOWNLOAD_URL);
    if (!response.ok) {
      throw new Error(
        `Could not download ${ARCHIVE}: HTTP ${String(response.status)}. ` +
          'The ABS may have moved or re-released it; check the source register.',
      );
    }
    await mkdir(RAW_DIR, { recursive: true });
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
  }

  const digest = await sha256(target);
  if (digest !== ARCHIVE_SHA256) {
    throw new Error(
      `${ARCHIVE} does not match the checksum recorded for it.\n` +
        `  expected ${ARCHIVE_SHA256}\n  found    ${digest}\n` +
        'The ABS has re-published the file. Verify the new release, update the ' +
        'checksum and the source register, and re-run. Nothing has been written.',
    );
  }

  return target;
}

/**
 * The unpacked shapefile.
 *
 * mapshaper reads a zip through `-i` but not through `-join`, so the archive
 * has to be opened on disk. The unpacked copy lives under the gitignored
 * working directory and is left in place, because unpacking 80 MB on every run
 * to answer the same question is a waste of a free tier's disk budget and its
 * patience.
 */
async function ensureUnpacked(archivePath: string): Promise<string> {
  const dir = join(WORK_DIR, 'poa2021');
  const shapefile = join(dir, 'POA_2021_AUST_GDA2020.shp');
  if (existsSync(shapefile)) return shapefile;

  await mkdir(dir, { recursive: true });
  // mapshaper unpacks a zip on import, so it doubles as the extractor and
  // avoids adding an unzip dependency for one call.
  await mapshaper.runCommands(
    `-i "${archivePath}" -o format=shapefile "${join(dir, 'POA_2021_AUST_GDA2020.shp')}"`,
  );

  const written = await readdir(dir);
  if (!written.some((name) => name.endsWith('.shp'))) {
    throw new Error(`Unpacking ${ARCHIVE} produced no shapefile.`);
  }
  return shapefile;
}

interface PointRow {
  readonly id: string;
  readonly longitude: number;
  readonly latitude: number;
}

/** Places each point in a postal area. Returns location id to postcode. */
async function placePoints(
  shapefile: string,
  points: readonly PointRow[],
): Promise<ReadonlyMap<string, string>> {
  await mkdir(WORK_DIR, { recursive: true });
  const source = join(WORK_DIR, 'points.geo.json');
  const joined = join(WORK_DIR, 'points-joined.geo.json');

  await writeFile(
    source,
    JSON.stringify({
      type: 'FeatureCollection',
      features: points.map((point) => ({
        type: 'Feature',
        properties: { id: point.id },
        geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] },
      })),
    }),
  );

  await mapshaper.runCommands(
    `-i "${source}" -join "${shapefile}" fields=${POSTCODE_FIELD} -o format=geojson "${joined}"`,
  );

  const parsed = JSON.parse(await readFile(joined, 'utf8')) as {
    features?: { properties?: Record<string, unknown> }[];
  };

  const placed = new Map<string, string>();
  for (const feature of parsed.features ?? []) {
    const id = feature.properties?.['id'];
    const raw = feature.properties?.[POSTCODE_FIELD];
    if (typeof id !== 'string' || typeof raw !== 'string') continue;
    // Validated rather than trusted. The field is a string in the shapefile and
    // three of the 2,644 areas carry no geometry at all, so a value that is not
    // a four-digit postcode is dropped instead of stored.
    const postcode = normalisePostcode(raw);
    if (postcode !== null) placed.set(id, postcode);
  }

  return placed;
}

/**
 * Resolves postcodes for stored locations that have coordinates and no
 * postcode.
 *
 * A location that already carries a postcode is never overwritten. A postcode
 * the source published outranks one derived from coordinates, and re-deriving
 * over the top of it would replace a fact with an inference.
 */
export async function resolveStoredPostcodes(
  options: { readonly dryRun?: boolean } = {},
): Promise<Result<PostcodeOutcome, Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;
  const prisma = database.value;

  const rows = await prisma.location.findMany({
    where: {
      postcode: null,
      NOT: [{ latitude: null }, { longitude: null }],
    },
    select: { id: true, latitude: true, longitude: true },
  });

  if (rows.length === 0) {
    logger.info('No locations need a postcode', {});
    return ok({ candidates: 0, placed: 0, unplaced: 0, written: 0 });
  }

  const points: PointRow[] = rows.flatMap((row) => {
    if (row.latitude === null || row.longitude === null) return [];
    return [
      {
        id: row.id,
        latitude: Number(row.latitude.toString()),
        longitude: Number(row.longitude.toString()),
      },
    ];
  });

  const archive = await ensureArchive();
  const shapefile = await ensureUnpacked(archive);
  const placed = await placePoints(shapefile, points);

  let written = 0;
  if (options.dryRun !== true) {
    for (const [id, postcode] of placed) {
      await prisma.location.update({
        where: { id },
        data: {
          postcode,
          postcodeSource: 'DERIVED_FROM_COORDINATES',
          postcodeReference: POSTCODE_REFERENCE,
        },
      });
      written += 1;
    }
  }

  const outcome: PostcodeOutcome = {
    candidates: points.length,
    placed: placed.size,
    // A point in no postal area. Offshore coordinates and a handful of
    // classification areas with no boundary both land here, and both are
    // correctly left without a postcode rather than given the nearest one.
    unplaced: points.length - placed.size,
    written,
  };

  logger.info('Postcode resolution complete', {
    reference: POSTCODE_REFERENCE,
    ...outcome,
    dryRun: options.dryRun === true,
  });

  return ok(outcome);
}
