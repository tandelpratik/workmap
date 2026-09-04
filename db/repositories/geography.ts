import { getDatabase } from '../client';
import { failure, type Failure } from '@/lib/errors';
import { err, ok, type Result } from '@/lib/result';
import type { GeographyArea, GeographyLevel } from '@/domain/geography';

/**
 * Geography repository.
 *
 * Returns domain types, never Prisma rows, so callers do not depend on the
 * persistence layer (ADR-0001). Decimal columns are converted here, because a
 * Prisma Decimal leaking into the domain is exactly the kind of coupling the
 * boundary exists to prevent.
 */

interface GeographyRow {
  id: string;
  code: string;
  name: string;
  level: string;
  asgsEdition: string;
  hasGeometry: boolean;
  areaSqKm: { toString(): string } | null;
  parent: { code: string } | null;
}

function toDomain(row: GeographyRow): GeographyArea {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    level: row.level as GeographyLevel,
    parentCode: row.parent?.code ?? null,
    edition: row.asgsEdition,
    hasGeometry: row.hasGeometry,
    areaSqKm: row.areaSqKm === null ? null : Number(row.areaSqKm.toString()),
  };
}

const withParent = { parent: { select: { code: true } } } as const;

export async function listByLevel(
  edition: string,
  level: GeographyLevel,
): Promise<Result<GeographyArea[], Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;

  const rows = await database.value.geography.findMany({
    where: { asgsEdition: edition, level },
    include: withParent,
    orderBy: { code: 'asc' },
  });

  return ok(rows.map(toDomain));
}

/**
 * Children of an area at one level, by the parent's code.
 *
 * The level is required, not optional. GCCSA and SA4 both hang off STATE and
 * both partition it, so "the children of New South Wales" is an ambiguous
 * question: answering it with every child returns 30 SA4s and 4 GCCSAs
 * covering the same ground, and any caller that sums them double counts.
 * Making the caller name the partition removes the trap rather than
 * documenting it.
 */
export async function listChildren(
  edition: string,
  parentCode: string,
  level: GeographyLevel,
): Promise<Result<GeographyArea[], Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;

  const rows = await database.value.geography.findMany({
    where: { asgsEdition: edition, level, parent: { code: parentCode } },
    include: withParent,
    orderBy: { code: 'asc' },
  });

  return ok(rows.map(toDomain));
}

export async function findByCode(
  edition: string,
  level: GeographyLevel,
  code: string,
): Promise<Result<GeographyArea, Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;

  const row = await database.value.geography.findUnique({
    where: { code_level_asgsEdition: { code, level, asgsEdition: edition } },
    include: withParent,
  });

  if (!row) {
    // NOT_FOUND rather than an empty result: the caller asked for one area and
    // it does not exist, which is different from a query matching nothing.
    return err(
      failure(
        'NOT_FOUND',
        `No ${level} geography with code "${code}" in edition ${edition}.`,
      ),
    );
  }

  return ok(toDomain(row));
}

/** Editions currently loaded, newest first by code count. */
export async function listEditions(): Promise<Result<string[], Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;

  const rows = await database.value.geography.groupBy({
    by: ['asgsEdition'],
  });

  return ok(rows.map((row) => row.asgsEdition).sort());
}

export async function countByEdition(edition: string): Promise<Result<number, Failure>> {
  const database = getDatabase();
  if (!database.ok) return database;

  return ok(await database.value.geography.count({ where: { asgsEdition: edition } }));
}
