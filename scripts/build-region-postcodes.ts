import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import readXlsxFile from 'read-excel-file/node';
import { regionalAreas } from '@/config/regional-areas';
import { classifyPlace } from '@/domain/regional';
import { stateAbbreviation } from '@/domain/geography';

/**
 * Works out, for every statistical area, whether the postcodes inside it are
 * all regional, none regional, or a mixture.
 *
 *   npm run regional:build-regions
 *
 * This exists for the sources that publish a region rather than a place. Smart
 * Jobs Queensland is the case in point: it names one of a closed list of
 * regions, publishes no coordinates and no postcode, and 1,621 of its listings
 * name exactly one region. The instrument is written in postcodes, so a region
 * cannot be looked up in it directly. This answers the question the other way
 * round: which postcodes does that region contain, and do they agree?
 *
 * ## Why this is a join and not an estimate
 *
 * The obvious approach is to intersect the region's boundary with the postcode
 * boundaries and see what overlaps. That needs a minimum-overlap threshold,
 * because a postal area clipping the edge of a statistical area by a few
 * hectares would otherwise make an entirely uniform region look mixed. Any
 * threshold is a judgement about how much error is acceptable in a statutory
 * classification, and it would have to be published wherever a listing rested
 * on it.
 *
 * No threshold is needed, because the ABS builds both structures out of the
 * same atoms. A mesh block is the smallest unit of the standard, every postal
 * area is a set of mesh blocks, and every statistical area is a set of mesh
 * blocks. The ABS publishes both allocations. Joining them on the mesh block
 * gives the exact relationship as the ABS itself allocated it, with nothing
 * inferred, nothing overlapping and nothing to threshold.
 *
 * ## The three answers
 *
 *   REGIONAL      every postcode in the area is within a designated regional
 *                 area, so a listing placed only by this region is too.
 *   NOT_REGIONAL  none of them is.
 *   MIXED         the area holds postcodes on both sides of the line. This is
 *                 not a failure and must not be resolved by picking the larger
 *                 side: the Brisbane statistical areas are genuinely mixed,
 *                 because the instrument lists outer suburbs such as 4019 to
 *                 4022 and 4076 to 4078 while leaving the inner city out. A
 *                 listing placed only by a mixed region stays unknown.
 *
 * ## What it writes
 *
 * A small committed artefact, one row per statistical area. The 50 MB of
 * spreadsheets it reads are gitignored and re-downloadable, exactly as the
 * boundary archives are (ADR-0003). Nothing about this runs in production: it
 * is a build step, and the artefact is what ships.
 */

const RAW_DIR = join('data', 'raw', 'asgs-2021');
const OUT_DIR = join('data', 'regional');
const OUT_FILE = join(OUT_DIR, 'statistical-area-postcodes-2021.json');

const BASE_URL =
  'https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/' +
  'edition-3-july-2021-june-2026/access-and-downloads/allocation-files';

/**
 * The two allocation files, with the checksums they were read at.
 *
 * Verified on every run. A re-published spreadsheet under the same name would
 * otherwise silently change which regions are regional.
 */
const INPUTS = {
  meshBlocks: {
    file: 'MB_2021_AUST.xlsx',
    sha256: 'cbfe8b98ed17c3be994f5635bd5fd4cc721b6f798d14f583c41a32c6b6973884',
  },
  postalAreas: {
    file: 'POA_2021_AUST.xlsx',
    sha256: 'e1b82115e4cb46691924f6aa996f928d3771596e1d015acc17efdd807bb12c2e',
  },
} as const;

/** Column positions, asserted against the header rather than assumed. */
const MB_COLUMNS = ['MB_CODE_2021', 'SA4_CODE_2021', 'SA4_NAME_2021', 'STATE_NAME_2021'];
const POA_COLUMNS = ['MB_CODE_2021', 'POA_CODE_2021'];

function log(message: string, extra?: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ level: 'info', message, ...extra }));
}

async function sha256(path: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(path))
    .digest('hex');
}

async function ensureInput(spec: { file: string; sha256: string }): Promise<string> {
  const target = join(RAW_DIR, spec.file);

  if (!existsSync(target)) {
    const url = `${BASE_URL}/${spec.file}`;
    log('Downloading allocation file', { file: spec.file });
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Could not download ${spec.file}: HTTP ${String(response.status)}`);
    }
    await mkdir(RAW_DIR, { recursive: true });
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
  }

  const digest = await sha256(target);
  if (digest !== spec.sha256) {
    throw new Error(
      `${spec.file} does not match its recorded checksum.\n` +
        `  expected ${spec.sha256}\n  found    ${digest}\n` +
        'The ABS has re-published it. Verify the release, update the checksum and ' +
        'the source register, and re-run. Nothing has been written.',
    );
  }

  return target;
}

type Row = readonly unknown[];

/**
 * The rows of a workbook, whichever shape the reader hands back.
 *
 * read-excel-file returns a bare array of rows for some workbooks and a list of
 * named sheets for others. Both of these files come back as the second, and
 * assuming one shape is how a silent empty read happens.
 */
async function sheetRows(path: string): Promise<Row[]> {
  const parsed: unknown = await readXlsxFile(path);
  if (!Array.isArray(parsed)) throw new Error(`${path} did not parse to rows.`);

  const first: unknown = parsed[0];
  if (first !== null && typeof first === 'object' && 'data' in first) {
    const data = (first as { data?: unknown }).data;
    if (!Array.isArray(data)) throw new Error(`${path} has a sheet with no rows.`);
    return data as Row[];
  }
  return parsed as Row[];
}

/** Column index by name, so a re-ordered release fails loudly. */
function indexColumns(header: Row, required: readonly string[]): Map<string, number> {
  const names = header.map((cell) => String(cell ?? '').trim());
  const index = new Map<string, number>();
  for (const column of required) {
    const at = names.indexOf(column);
    if (at === -1) {
      throw new Error(
        `Column "${column}" is missing. Found: ${names.join(', ')}. ` +
          'The ABS schema may have changed.',
      );
    }
    index.set(column, at);
  }
  return index;
}

function text(row: Row, at: number | undefined): string {
  return at === undefined ? '' : String(row[at] ?? '').trim();
}

interface AreaTally {
  code: string;
  name: string;
  stateCode: string | null;
  meshBlocks: number;
  withPostcode: number;
  regional: number;
  notRegional: number;
  postcodes: Set<string>;
}

async function main(): Promise<void> {
  const poaPath = await ensureInput(INPUTS.postalAreas);
  const mbPath = await ensureInput(INPUTS.meshBlocks);

  // Postal areas first, reduced to a two-column map so the bigger workbook has
  // room. The full row arrays are dropped as soon as the map is built.
  log('Reading postal area allocation');
  const poaRows = await sheetRows(poaPath);
  const poaHeader = poaRows[0];
  if (poaHeader === undefined) throw new Error('Postal area file has no header row.');
  const poaIndex = indexColumns(poaHeader, POA_COLUMNS);

  const postcodeByMeshBlock = new Map<string, string>();
  for (let i = 1; i < poaRows.length; i += 1) {
    const row = poaRows[i];
    if (row === undefined) continue;
    const meshBlock = text(row, poaIndex.get('MB_CODE_2021'));
    const postcode = text(row, poaIndex.get('POA_CODE_2021'));
    if (meshBlock !== '' && postcode !== '') postcodeByMeshBlock.set(meshBlock, postcode);
  }
  poaRows.length = 0;
  log('Postal areas read', { meshBlocks: postcodeByMeshBlock.size });

  log('Reading mesh block allocation');
  const mbRows = await sheetRows(mbPath);
  const mbHeader = mbRows[0];
  if (mbHeader === undefined) throw new Error('Mesh block file has no header row.');
  const mbIndex = indexColumns(mbHeader, MB_COLUMNS);

  const areas = new Map<string, AreaTally>();
  let unmatched = 0;

  for (let i = 1; i < mbRows.length; i += 1) {
    const row = mbRows[i];
    if (row === undefined) continue;

    const meshBlock = text(row, mbIndex.get('MB_CODE_2021'));
    const code = text(row, mbIndex.get('SA4_CODE_2021'));
    if (meshBlock === '' || code === '') continue;

    const entry: AreaTally = areas.get(code) ?? {
      code,
      name: text(row, mbIndex.get('SA4_NAME_2021')),
      stateCode: stateAbbreviation(text(row, mbIndex.get('STATE_NAME_2021'))),
      meshBlocks: 0,
      withPostcode: 0,
      regional: 0,
      notRegional: 0,
      postcodes: new Set<string>(),
    };
    entry.meshBlocks += 1;

    const postcode = postcodeByMeshBlock.get(meshBlock);
    if (postcode === undefined) {
      // A mesh block the postal area allocation does not cover: offshore,
      // migratory and no-usual-address blocks land here. Counted, never guessed.
      unmatched += 1;
      areas.set(code, entry);
      continue;
    }

    const verdict = classifyPlace(regionalAreas, {
      postcode,
      jurisdiction: entry.stateCode,
    });
    entry.withPostcode += 1;
    entry.postcodes.add(postcode);
    if (verdict.status === 'REGIONAL') entry.regional += 1;
    else if (verdict.status === 'NOT_REGIONAL') entry.notRegional += 1;

    areas.set(code, entry);
  }
  mbRows.length = 0;

  const rows = [...areas.values()]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((area) => {
      /*
       * All, none, or both. A region holding postcodes on both sides is
       * reported as mixed and is never resolved by taking the larger side: the
       * whole reason to carry this artefact is to avoid asserting something
       * about a listing that its own region does not settle.
       */
      const status =
        area.withPostcode === 0
          ? 'UNKNOWN'
          : area.notRegional === 0
            ? 'REGIONAL'
            : area.regional === 0
              ? 'NOT_REGIONAL'
              : 'MIXED';

      return {
        code: area.code,
        name: area.name,
        stateCode: area.stateCode,
        status,
        meshBlocks: area.meshBlocks,
        meshBlocksWithPostcode: area.withPostcode,
        meshBlocksRegional: area.regional,
        meshBlocksNotRegional: area.notRegional,
        distinctPostcodes: area.postcodes.size,
      };
    });

  const artefact = {
    generatedAt: new Date().toISOString(),
    // What decided each postcode, and what supplied the allocation. Both travel
    // with the artefact so a row can be traced without reading this script.
    instrument: {
      id: regionalAreas.instrument.id,
      registerId: regionalAreas.instrument.registerId,
    },
    allocation: {
      edition: 'ASGS Edition 3, 2021',
      sourceKey: 'abs-asgs',
      note:
        'Statistical areas and postal areas are both allocated from mesh blocks ' +
        'by the ABS. This artefact joins the two allocations on the mesh block, ' +
        'so no boundary is intersected and no overlap threshold is applied.',
      meshBlockFile: `${BASE_URL}/${INPUTS.meshBlocks.file}`,
      meshBlockSha256: INPUTS.meshBlocks.sha256,
      postalAreaFile: `${BASE_URL}/${INPUTS.postalAreas.file}`,
      postalAreaSha256: INPUTS.postalAreas.sha256,
    },
    meshBlocksWithoutPostalArea: unmatched,
    areas: rows,
  };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(OUT_FILE, `${JSON.stringify(artefact, null, 2)}\n`);

  const counts = rows.reduce<Record<string, number>>((into, row) => {
    into[row.status] = (into[row.status] ?? 0) + 1;
    return into;
  }, {});

  log('Statistical area postcodes written', {
    file: OUT_FILE,
    areas: rows.length,
    meshBlocksWithoutPostalArea: unmatched,
    ...counts,
  });
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
