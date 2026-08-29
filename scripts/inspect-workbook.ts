import { readFile } from 'node:fs/promises';
import { parseIviWorkbook } from '@/integrations/jsa/ivi';
import { readWorkbook, cellText } from '@/integrations/jsa/workbook';

/**
 * Prints what a workbook actually contains, without importing it.
 *
 *   npm run jsa:inspect -- data/raw/jsa-ivi/<file>.xlsx
 *
 * Two sections per run: the raw shape of every sheet, and what the IVI reader
 * made of it. The second is the useful one when a release changes: a sheet
 * reported as SKIPPED prints the headers the reader did not recognise, and the
 * fix is to add those spellings to dimensionAliases in integrations/jsa/ivi.ts.
 *
 * This exists because the IVI files cannot be fetched from this environment,
 * so the first person to hold one needs to see its structure before trusting
 * an import of it.
 */

const PREVIEW_ROWS = 6;
const PREVIEW_COLUMNS = 8;
const PREVIEW_CELL_WIDTH = 24;

const [filePath] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));

if (filePath === undefined) {
  console.error('Usage: npm run jsa:inspect -- <path to workbook.xlsx>');
  process.exit(2);
}

function truncate(text: string): string {
  return text.length > PREVIEW_CELL_WIDTH
    ? `${text.slice(0, PREVIEW_CELL_WIDTH - 1)}…`
    : text;
}

async function main(path: string): Promise<number> {
  const bytes = await readFile(path);
  const workbook = await readWorkbook(bytes);

  if (!workbook.ok) {
    console.error(`${workbook.error.code}: ${workbook.error.message}`);
    return 1;
  }

  /* eslint-disable no-console */
  console.log(`\n${path}`);
  console.log(`${workbook.value.length} sheet(s), ${bytes.byteLength} bytes\n`);

  for (const sheet of workbook.value) {
    const columns = Math.max(0, ...sheet.rows.map((row) => row.length));
    console.log(`── ${sheet.name}: ${sheet.rows.length} rows × ${columns} columns`);

    for (const row of sheet.rows.slice(0, PREVIEW_ROWS)) {
      const cells = row
        .slice(0, PREVIEW_COLUMNS)
        .map((cell) => truncate(cellText(cell) ?? ''));
      console.log(`   ${cells.join(' | ')}`);
    }
    console.log('');
  }

  console.log('── What the IVI reader made of it\n');
  const parsed = parseIviWorkbook(workbook.value);

  if (!parsed.ok) {
    console.log(`   Nothing could be read. ${parsed.error.message}\n`);
    return 1;
  }

  for (const report of parsed.value.sheets) {
    console.log(`   ${report.sheet}: ${report.status}`);
    if (report.reason !== undefined) console.log(`      ${report.reason}`);
    if (report.headerRow !== undefined)
      console.log(`      header row ${report.headerRow}`);
    if (report.dimensionColumns !== undefined) {
      console.log(`      dimensions: ${report.dimensionColumns.join(', ') || 'none'}`);
    }
    if (report.qualifierColumns !== undefined && report.qualifierColumns.length > 0) {
      console.log(
        `      unrecognised columns kept as qualifiers: ${report.qualifierColumns.join(', ')}`,
      );
    }
    if (report.periodColumns !== undefined) {
      console.log(
        `      ${report.periodColumns} periods, ${report.firstPeriod ?? '?'} to ${report.lastPeriod ?? '?'}`,
      );
    }
    if (report.dataRows !== undefined) console.log(`      ${report.dataRows} data rows`);
    console.log('');
  }

  console.log(
    `   ${parsed.value.series.length} series, ${parsed.value.observations} observations, ` +
      `${parsed.value.duplicatesDropped} identical duplicates, ${parsed.value.problems.length} unreadable`,
  );

  for (const problem of parsed.value.problems.slice(0, 10)) {
    console.log(`      ${problem.sheet} row ${problem.row}: ${problem.message}`);
  }
  console.log('');
  /* eslint-enable no-console */

  return 0;
}

main(filePath)
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
