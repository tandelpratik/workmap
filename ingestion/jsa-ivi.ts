import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { Prisma } from '@/db/generated/client/client';
import { getDatabase } from '@/db/client';
import {
  describeSeries,
  observationIsConsistent,
  type Observation,
  type ParsedSeries,
} from '@/domain/labour-market';
import {
  IVI_DATASET,
  JSA_SOURCE_KEY,
  parseIviWorkbook,
  type RowProblem,
  type SheetReport,
} from '@/integrations/jsa/ivi';
import { readWorkbook } from '@/integrations/jsa/workbook';
import { failure, invariant, type Failure } from '@/lib/errors';
import { err, ok, type Result } from '@/lib/result';
import { logger } from '@/lib/logger';
import {
  buildGeographyLookup,
  normaliseCode,
  resolveGeography,
  resolveOccupation,
  type OccupationCandidate,
} from './dimensions';
import type { GeographyLevel } from '@/domain/geography';

/**
 * JSA Internet Vacancy Index importer (ADR-0002, ADR-0005, ADR-0009).
 *
 * Reads a published IVI workbook and writes it as labour market series and
 * observations. Idempotent in three layers, because a monthly release that is
 * re-imported must not duplicate history or silently restate it:
 *
 *   1. The file is checksummed. Re-importing bytes that have already been
 *      imported is a no-op unless forced, which keeps a re-run cheap and makes
 *      a re-publication of the same reference period visible rather than
 *      silent.
 *   2. Series upsert on a key derived from what the source stated, so the same
 *      row always resolves to the same series (see buildSeriesKey).
 *   3. Observations are compared against what is stored, and only genuine
 *      changes are written. A second run of an unchanged file writes nothing.
 *
 * Nothing here interprets a missing figure. Resolution failures are not errors:
 * an unrecognised region keeps the source's own code and label and resolves
 * later without a re-import.
 */

const DEFAULT_EDITION = 'ASGS2026';

/**
 * A run whose quarantine rate exceeds this fails loudly (ADR-0005). A rate
 * this high means the release changed shape, and importing most of a dataset
 * is worse than importing none of it.
 */
const DEFAULT_MAX_QUARANTINE_RATE = 0.05;

/** Rows per createMany, to keep statements and memory bounded. */
const WRITE_BATCH_SIZE = 1_000;

/**
 * Quarantine records written per run. The counter records the true total; this
 * caps what is stored, because a structurally broken file can produce a
 * problem for every cell and the free tier has a row budget.
 */
const MAX_QUARANTINE_RECORDS = 500;

type Database = Prisma.TransactionClient;

export interface IviImportOptions {
  readonly filePath: string;
  /** ASGS edition the geography registry is resolved against. */
  readonly edition?: string;
  readonly triggeredBy?: string;
  /** Import even when this exact file has already been imported. */
  readonly force?: boolean;
  /** Parse and report without writing anything. */
  readonly dryRun?: boolean;
  readonly maxQuarantineRate?: number;
  readonly dataset?: string;
  readonly measure?: string;
  readonly unit?: string;
  /** Injected for tests, which run the importer inside a rolled-back transaction. */
  readonly client?: Database;
}

export interface DimensionSummary {
  readonly resolved: number;
  readonly unresolved: number;
  /** A few unresolved labels, so an operator can see what did not match. */
  readonly examples: readonly string[];
}

export interface IviImportOutcome {
  readonly status: 'COMPLETED' | 'SKIPPED_UNCHANGED' | 'DRY_RUN';
  readonly runId: string | null;
  readonly inputRef: string;
  readonly inputChecksum: string;
  /** Observations read from the file, including those that could not be read. */
  readonly seen: number;
  readonly written: number;
  /** Observations already stored with the same value, so not written again. */
  readonly skipped: number;
  readonly quarantined: number;
  readonly seriesSeen: number;
  readonly seriesWritten: number;
  readonly geography: DimensionSummary;
  readonly occupation: DimensionSummary;
  readonly sheets: readonly SheetReport[];
  readonly problems: readonly RowProblem[];
}

function checksumOf(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function summarise(resolved: number, unresolved: readonly string[]): DimensionSummary {
  return {
    resolved,
    unresolved: unresolved.length,
    examples: [...new Set(unresolved)].slice(0, 10),
  };
}

/**
 * Loads the ABS registry for an edition as resolution candidates.
 *
 * One query. The registry is 120 rows, so holding it in memory beats a lookup
 * per series by a wide margin.
 */
async function loadGeography(
  database: Database,
  edition: string,
): Promise<{ id: string; code: string; name: string; level: GeographyLevel }[]> {
  const rows = await database.geography.findMany({
    where: { asgsEdition: edition },
    select: { id: true, code: true, name: true, level: true },
  });
  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    level: row.level as GeographyLevel,
  }));
}

async function loadOccupations(
  database: Database,
): Promise<Map<string, OccupationCandidate[]>> {
  const rows = await database.occupation.findMany({
    select: { id: true, code: true, classificationVersion: true },
  });

  const byCode = new Map<string, OccupationCandidate[]>();
  for (const row of rows) {
    const key = normaliseCode(row.code);
    const existing = byCode.get(key);
    if (existing) existing.push(row);
    else byCode.set(key, [row]);
  }
  return byCode;
}

interface SeriesWriteCounts {
  readonly written: number;
  readonly skipped: number;
}

/**
 * Writes one series' observations, touching only what changed.
 *
 * Reads what is stored first, so an unchanged monthly re-import performs one
 * read per series and no writes at all. Comparing rather than blind-upserting
 * is what makes the second run observably a no-op, which is the only honest
 * test of idempotency.
 */
async function writeObservations(
  database: Database,
  seriesId: string,
  observations: readonly Observation[],
): Promise<SeriesWriteCounts> {
  const existing = await database.labourMarketMetric.findMany({
    where: { seriesId },
    select: { periodStart: true, value: true, valueState: true },
  });

  const stored = new Map(
    existing.map((metric) => [
      metric.periodStart.getTime(),
      {
        value: metric.value === null ? null : Number(metric.value.toString()),
        valueState: metric.valueState as string,
      },
    ]),
  );

  const toCreate: {
    seriesId: string;
    periodStart: Date;
    value: number | null;
    valueState: Observation['valueState'];
  }[] = [];
  const toUpdate: Observation[] = [];
  let skipped = 0;

  for (const observation of observations) {
    // The value and state travelled through the reader and the merge; a broken
    // pair here would be rejected by the database CHECK with no indication of
    // which series caused it (ADR-0002).
    invariant(
      observationIsConsistent(observation),
      `Inconsistent observation for series ${seriesId} at ${observation.periodStart.toISOString()}.`,
    );

    const current = stored.get(observation.periodStart.getTime());
    if (current === undefined) {
      toCreate.push({
        seriesId,
        periodStart: observation.periodStart,
        value: observation.value,
        valueState: observation.valueState,
      });
      continue;
    }

    if (
      current.valueState === observation.valueState &&
      current.value === observation.value
    ) {
      skipped += 1;
      continue;
    }

    toUpdate.push(observation);
  }

  for (let index = 0; index < toCreate.length; index += WRITE_BATCH_SIZE) {
    await database.labourMarketMetric.createMany({
      data: toCreate.slice(index, index + WRITE_BATCH_SIZE),
    });
  }

  // Revisions of official statistics are normal and expected, so an updated
  // figure is written rather than refused. The run counters record how many.
  for (const observation of toUpdate) {
    await database.labourMarketMetric.update({
      where: {
        seriesId_periodStart: { seriesId, periodStart: observation.periodStart },
      },
      data: {
        value: observation.value,
        valueState: observation.valueState,
        retrievedAt: new Date(),
      },
    });
  }

  return { written: toCreate.length + toUpdate.length, skipped };
}

export async function importJsaIvi(
  options: IviImportOptions,
): Promise<Result<IviImportOutcome, Failure>> {
  const edition = options.edition ?? DEFAULT_EDITION;
  const dataset = options.dataset ?? IVI_DATASET;
  const maxQuarantineRate = options.maxQuarantineRate ?? DEFAULT_MAX_QUARANTINE_RATE;

  let database: Database;
  if (options.client) {
    database = options.client;
  } else {
    const connection = getDatabase();
    if (!connection.ok) return connection;
    database = connection.value;
  }

  // --- Compliance gate (ADR-0009) -----------------------------------------
  // Checked against the database rather than the caller's intent, exactly as
  // the geography importer does.
  const source = await database.source.findUnique({ where: { key: JSA_SOURCE_KEY } });
  if (!source) {
    return err(
      failure(
        'NOT_CONFIGURED',
        `Source "${JSA_SOURCE_KEY}" is not registered. Run the seed before importing.`,
      ),
    );
  }
  if (source.complianceStatus !== 'VERIFIED') {
    return err(
      failure(
        'FORBIDDEN',
        `Source "${JSA_SOURCE_KEY}" has compliance status ${source.complianceStatus}. ` +
          'Verify its terms before importing. See docs/compliance/SOURCE_REGISTER.md',
      ),
    );
  }

  // --- Input ---------------------------------------------------------------
  let bytes: Buffer;
  try {
    bytes = await readFile(options.filePath);
  } catch {
    return err(failure('NOT_FOUND', `No readable file at "${options.filePath}".`));
  }

  const inputRef = basename(options.filePath);
  const inputChecksum = checksumOf(bytes);

  if (!options.force && !options.dryRun) {
    const alreadyImported = await database.ingestionRun.findFirst({
      where: {
        sourceKey: JSA_SOURCE_KEY,
        dataset,
        status: 'COMPLETED',
        inputChecksum,
      },
      select: { id: true },
    });

    if (alreadyImported) {
      logger.info('JSA IVI input already imported, nothing to do', {
        inputRef,
        inputChecksum,
        previousRunId: alreadyImported.id,
      });
      return ok({
        status: 'SKIPPED_UNCHANGED',
        runId: alreadyImported.id,
        inputRef,
        inputChecksum,
        seen: 0,
        written: 0,
        skipped: 0,
        quarantined: 0,
        seriesSeen: 0,
        seriesWritten: 0,
        geography: summarise(0, []),
        occupation: summarise(0, []),
        sheets: [],
        problems: [],
      });
    }
  }

  // --- Parse ---------------------------------------------------------------
  const workbook = await readWorkbook(bytes);
  if (!workbook.ok) return workbook;

  const parsed = parseIviWorkbook(workbook.value, {
    dataset,
    ...(options.measure === undefined ? {} : { measure: options.measure }),
    ...(options.unit === undefined ? {} : { unit: options.unit }),
  });
  if (!parsed.ok) return parsed;

  const { series, observations, duplicatesDropped, problems, sheets } = parsed.value;
  const seen = observations + problems.length;

  if (options.dryRun) {
    return ok({
      status: 'DRY_RUN',
      runId: null,
      inputRef,
      inputChecksum,
      seen,
      written: 0,
      skipped: duplicatesDropped,
      quarantined: problems.length,
      seriesSeen: series.length,
      seriesWritten: 0,
      geography: summarise(0, []),
      occupation: summarise(0, []),
      sheets,
      problems,
    });
  }

  // --- Run -----------------------------------------------------------------
  let runId: string;
  try {
    const run = await database.ingestionRun.create({
      data: {
        sourceKey: JSA_SOURCE_KEY,
        dataset,
        status: 'RUNNING',
        triggeredBy: options.triggeredBy ?? 'manual',
        inputRef,
        inputChecksum,
      },
      select: { id: true },
    });
    runId = run.id;
  } catch {
    // A unique index permits one RUNNING run per source and dataset, so an
    // overlapping trigger becomes a refusal rather than a double import.
    return err(
      failure(
        'SOURCE_UNAVAILABLE',
        `An import of ${dataset} is already running. Wait for it to finish, or clear the stalled run.`,
      ),
    );
  }

  let written = 0;
  let skipped = duplicatesDropped;
  let seriesWritten = 0;
  let geographyResolved = 0;
  let occupationResolved = 0;
  const geographyUnresolved: string[] = [];
  const occupationUnresolved: string[] = [];

  try {
    const lookup = buildGeographyLookup(await loadGeography(database, edition));
    const occupationsByCode = await loadOccupations(database);

    for (const entry of series) {
      const counts = await writeSeries(database, entry, lookup, occupationsByCode);
      written += counts.written;
      skipped += counts.skipped;
      seriesWritten += 1;

      if (counts.geographyResolved) geographyResolved += 1;
      else geographyUnresolved.push(labelOf(entry, 'geography'));

      if (counts.occupationResolved) occupationResolved += 1;
      else occupationUnresolved.push(labelOf(entry, 'occupation'));
    }

    // Quarantine after the writes: a row the reader could not use must not stop
    // the rows it could (ADR-0005).
    for (const problem of problems.slice(0, MAX_QUARANTINE_RECORDS)) {
      await database.ingestionError.create({
        data: {
          runId,
          sourceKey: JSA_SOURCE_KEY,
          sourceId: problem.seriesKey ?? null,
          kind: problem.kind === 'NO_DIMENSIONS' ? 'MAPPING' : 'VALIDATION',
          message: `${problem.sheet} row ${problem.row}${
            problem.column === undefined ? '' : ` column ${problem.column}`
          }: ${problem.message}`,
          ...(problem.raw === undefined ? {} : { rawPayload: { raw: problem.raw } }),
        },
      });
    }

    const quarantineRate = seen === 0 ? 0 : problems.length / seen;
    if (quarantineRate > maxQuarantineRate) {
      await database.ingestionRun.update({
        where: { id: runId },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          recordsSeen: seen,
          recordsWritten: written,
          recordsSkipped: skipped,
          recordsQuarantined: problems.length,
          error: `Quarantine rate ${(quarantineRate * 100).toFixed(1)}% exceeded the ${(
            maxQuarantineRate * 100
          ).toFixed(1)}% threshold.`,
        },
      });

      return err(
        failure(
          'INVALID_INPUT',
          `${problems.length} of ${seen} values could not be read (${(
            quarantineRate * 100
          ).toFixed(1)}%), above the ${(maxQuarantineRate * 100).toFixed(
            1,
          )}% threshold. The release has probably changed shape. Nothing further was imported; inspect the quarantined records for run ${runId}.`,
        ),
      );
    }

    await database.ingestionRun.update({
      where: { id: runId },
      data: {
        status: 'COMPLETED',
        finishedAt: new Date(),
        recordsSeen: seen,
        recordsWritten: written,
        recordsSkipped: skipped,
        recordsQuarantined: problems.length,
      },
    });
  } catch (error) {
    await database.ingestionRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        recordsSeen: seen,
        recordsWritten: written,
        recordsSkipped: skipped,
        recordsQuarantined: problems.length,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }

  const outcome: IviImportOutcome = {
    status: 'COMPLETED',
    runId,
    inputRef,
    inputChecksum,
    seen,
    written,
    skipped,
    quarantined: problems.length,
    seriesSeen: series.length,
    seriesWritten,
    geography: summarise(geographyResolved, geographyUnresolved),
    occupation: summarise(occupationResolved, occupationUnresolved),
    sheets,
    problems,
  };

  logger.info('JSA IVI import complete', {
    runId,
    inputRef,
    seriesWritten,
    written,
    skipped,
    quarantined: problems.length,
    geographyUnresolved: outcome.geography.unresolved,
  });

  return ok(outcome);
}

function labelOf(entry: ParsedSeries, dimension: 'geography' | 'occupation'): string {
  const stated = entry.definition[dimension];
  return stated.name ?? stated.code ?? '(unstated)';
}

interface SeriesWriteResult extends SeriesWriteCounts {
  readonly geographyResolved: boolean;
  readonly occupationResolved: boolean;
}

/**
 * Resolves a series' dimensions and writes it.
 *
 * The source's own identifiers are stored whether or not they resolved, which
 * is what lets milestone 11 attach occupations to series imported today
 * without re-reading the file.
 */
async function writeSeries(
  database: Database,
  entry: ParsedSeries,
  lookup: ReturnType<typeof buildGeographyLookup>,
  occupationsByCode: Map<string, OccupationCandidate[]>,
): Promise<SeriesWriteResult> {
  const { definition } = entry;

  const geography = resolveGeography(lookup, definition.geography);
  const occupation = resolveOccupation(occupationsByCode, definition.occupation);

  const data = {
    sourceKey: definition.sourceKey,
    dataset: definition.dataset,
    measure: definition.measure,
    unit: definition.unit,
    basis: definition.basis,
    granularity: definition.granularity,
    geographyId: geography.status === 'RESOLVED' ? geography.id : null,
    occupationId: occupation.status === 'RESOLVED' ? occupation.id : null,
    sourceGeographyCode: definition.geography.code,
    sourceGeographyName: definition.geography.name,
    sourceOccupationCode: definition.occupation.code,
    sourceOccupationName: definition.occupation.name,
    // Describes the series from what the source stated. Our own labelling was
    // checked for forbidden phrasing before parsing began; the source's own
    // names are preserved verbatim rather than edited (ADR-0002).
    description: describeSeries(definition),
    methodologyUrl: null,
  };

  const series = await database.labourMarketSeries.upsert({
    where: { seriesKey: entry.seriesKey },
    create: { seriesKey: entry.seriesKey, ...data },
    update: data,
    select: { id: true },
  });

  const counts = await writeObservations(database, series.id, entry.observations);

  return {
    ...counts,
    geographyResolved: geography.status === 'RESOLVED',
    occupationResolved: occupation.status === 'RESOLVED',
  };
}
