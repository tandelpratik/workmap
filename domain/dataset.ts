/**
 * Derived datasets, as files.
 *
 * The figures on this site are built from a Creative Commons dataset that
 * permits redistribution and adaptation, so the arithmetic done here can be
 * handed to a reader rather than only shown to them. That is worth doing for a
 * research tool: a table on a page is something to read, and a file is something
 * to check.
 *
 * Two rules make it safe, and both are enforced here rather than at the route.
 *
 *   1. **A source that does not permit aggregation is not exportable.** The same
 *      gate the map and the rankings use. Adzuna listings are published on this
 *      site and may not be counted, so nothing derived from them is ever a file.
 *   2. **The attribution travels inside the file.** A CSV that leaves this site
 *      without its licence notice is a CSV that will be quoted somewhere with no
 *      way back to the publisher, and CC BY requires the notice to survive the
 *      copy. It goes in a comment header rather than a sidecar, because a
 *      sidecar gets lost on the first drag between folders.
 */

export interface DatasetColumn<T> {
  readonly key: string;
  /** Human heading, and the value for one row. */
  readonly heading: string;
  readonly value: (row: T) => string | number | null;
}

export interface DatasetProvenance {
  /** What this file contains, in one line. */
  readonly title: string;
  readonly publisher: string;
  readonly dataset: string;
  readonly referencePeriod: string | null;
  readonly licence: string;
  readonly licenceUrl: string;
  /** Required attribution wording, verbatim from the registry. */
  readonly attribution: string;
  /** What this project did to the publisher's figures. */
  readonly derivation: string;
  /** Where the file came from, so a copy can be traced back. */
  readonly source: string;
  readonly retrievedAt: Date;
}

/** RFC 4180: quote anything containing a comma, a quote or a newline. */
function escapeCsv(value: string | number | null): string {
  if (value === null) return '';
  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * The notice that travels with the file.
 *
 * `#` comments are not part of the CSV standard, and every spreadsheet and
 * parser this is likely to meet either skips them or shows them as leading rows
 * a reader can see and delete. The alternative was leaving the licence out of
 * the file, which is not an alternative.
 */
function csvHeader(provenance: DatasetProvenance): string[] {
  const lines = [
    provenance.title,
    '',
    `Publisher: ${provenance.publisher}`,
    `Dataset: ${provenance.dataset}`,
  ];
  if (provenance.referencePeriod !== null) {
    lines.push(`Reference period: ${provenance.referencePeriod}`);
  }
  lines.push(
    `Licence: ${provenance.licence} (${provenance.licenceUrl})`,
    `Attribution: ${provenance.attribution}`,
    `Derivation: ${provenance.derivation}`,
    `Source: ${provenance.source}`,
    `Retrieved: ${provenance.retrievedAt.toISOString()}`,
    '',
    'Figures count online job advertisements, not vacancies.',
  );
  return lines.map((line) => (line === '' ? '#' : `# ${line}`));
}

export function toCsv<T>(
  rows: readonly T[],
  columns: readonly DatasetColumn<T>[],
  provenance: DatasetProvenance,
): string {
  const body = [
    columns.map((column) => escapeCsv(column.heading)).join(','),
    ...rows.map((row) => columns.map((column) => escapeCsv(column.value(row))).join(',')),
  ];

  // CRLF, which is what RFC 4180 specifies and what keeps Excel from treating
  // the whole file as one row on Windows.
  return [...csvHeader(provenance), ...body].join('\r\n') + '\r\n';
}

/**
 * The same rows as JSON, with the provenance beside rather than above them.
 *
 * A consumer parsing JSON can read a sibling key; one parsing CSV cannot, which
 * is why the two carry the notice differently.
 */
export function toJson<T>(
  rows: readonly T[],
  columns: readonly DatasetColumn<T>[],
  provenance: DatasetProvenance,
): string {
  return JSON.stringify(
    {
      provenance: { ...provenance, retrievedAt: provenance.retrievedAt.toISOString() },
      columns: columns.map((column) => ({ key: column.key, heading: column.heading })),
      rows: rows.map((row) =>
        Object.fromEntries(columns.map((column) => [column.key, column.value(row)])),
      ),
    },
    null,
    2,
  );
}

/** A filename that says what the file is without needing the page it came from. */
export function datasetFilename(
  slug: string,
  referencePeriod: string | null,
  extension: 'csv' | 'json',
): string {
  const period =
    referencePeriod === null
      ? ''
      : `-${referencePeriod.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return `${slug}${period}.${extension}`;
}
