import readXlsxFile from 'read-excel-file/node';
import { failure, type Failure } from '@/lib/errors';
import { err, ok, type Result } from '@/lib/result';

/**
 * Spreadsheet reading, and nothing else.
 *
 * This is the only module that knows the product reads .xlsx files or which
 * library does it. It hands back plain rows of plain cells; deciding what any
 * of them mean belongs to the reader in ./ivi.ts, and neither concept reaches
 * the domain (ADR-0001).
 *
 * A malformed or non-spreadsheet file is an expected failure, not a programmer
 * error: an operator will eventually point this at the wrong download, and the
 * answer is a clear message rather than a stack trace (ADR-0008).
 */

export type Cell = string | number | boolean | Date | null;

export interface Worksheet {
  readonly name: string;
  readonly rows: readonly (readonly Cell[])[];
}

/**
 * Narrows a cell the library typed loosely.
 *
 * Anything unrecognised becomes null rather than being coerced to a string,
 * because a silently stringified value would later parse as a label and end up
 * in a series key.
 */
function toCell(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
      return Number.isFinite(value) ? value : null;
    case 'boolean':
      return value;
    default:
      return null;
  }
}

/** Every sheet in the workbook, in file order, with its cells narrowed. */
export async function readWorkbook(
  input: Buffer | string,
): Promise<Result<Worksheet[], Failure>> {
  let sheets: { sheet: string; data: unknown[][] }[];

  try {
    sheets = (await readXlsxFile(input)) as unknown as {
      sheet: string;
      data: unknown[][];
    }[];
  } catch (error) {
    // The library's message names the malformed part of the archive, which is
    // useful to an operator and safe to show: it describes the file they chose,
    // not anything internal.
    return err(
      failure(
        'INVALID_INPUT',
        `The file could not be read as a spreadsheet: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ),
    );
  }

  if (sheets.length === 0) {
    return err(failure('INVALID_INPUT', 'The workbook contains no sheets.'));
  }

  return ok(
    sheets.map((sheet) => ({
      name: sheet.sheet,
      rows: sheet.data.map((row) => row.map(toCell)),
    })),
  );
}

/** Trimmed text of a cell, or null when it holds nothing readable. */
export function cellText(cell: Cell): string | null {
  if (cell === null) return null;
  if (cell instanceof Date) return cell.toISOString();
  const text = String(cell).trim();
  return text === '' ? null : text;
}
