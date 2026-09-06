import type {
  SmartJobsJobDetail,
  SmartJobsSearchPage,
  SmartJobsSearchRow,
} from './types';

/**
 * HTML parsing for Smart Jobs and Careers.
 *
 * The portal serves no JSON API, so the markup is the contract. Everything
 * here is deliberately narrow: it looks for the specific structures observed
 * on 2026-08-31 and throws when they are absent, rather than returning an
 * empty page. An empty result and a changed layout must never look alike,
 * because one is a fact about the labour market and the other is a bug.
 */

const BASE_URL = 'https://smartjobs.qld.gov.au/jobtools/';

export class SmartJobsParseError extends Error {
  constructor(message: string) {
    super(`Smart Jobs markup did not match what the adapter expects: ${message}`);
    this.name = 'SmartJobsParseError';
  }
}

/**
 * Reads a capture group that the pattern guarantees.
 *
 * Under `noUncheckedIndexedAccess` a group is `string | undefined` even when
 * the regex cannot match without it. Throwing here keeps the "fail loudly"
 * rule intact instead of coercing the absence away with a non-null assertion.
 */
function group(match: RegExpMatchArray, index: number, what: string): string {
  const value = match[index];
  if (value === undefined) {
    throw new SmartJobsParseError(`matched ${what} but capture ${index} was empty`);
  }
  return value;
}

/** Named entities the portal actually emits, plus numeric forms. */
export function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&hellip;/g, '…')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Splits the portal's comma-separated region string.
 *
 * Region names legitimately contain hyphens and spaces ("Darling Downs -
 * Maranoa"), so only the comma separates them.
 */
export function splitLocalities(value: string): readonly string[] {
  return decodeEntities(value)
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Splits "Job Title, Employer" as the result heading writes it.
 *
 * The employer follows the final comma. Titles contain commas of their own,
 * so the split is from the right and only once.
 */
function splitTitleAndEmployer(text: string): { title: string; employer: string | null } {
  const index = text.lastIndexOf(',');
  if (index === -1) {
    return { title: text.trim(), employer: null };
  }
  return {
    title: text.slice(0, index).trim(),
    employer: emptyToNull(text.slice(index + 1)),
  };
}

/**
 * The two shapes a result link takes.
 *
 * The portal mixes them within one page: a query-string form carrying
 * `in_jnCounter`, and a vanity path such as `/jobs/QLD-QLD-PTCAP2026`. They
 * are the same kind of listing and the detail pages are identical, so both are
 * followed.
 *
 * Matching only the first cost about 40% of the rows on a deep page. They were
 * dropped in silence, which read as the portal running out of results rather
 * than as a parser that could not see them, and it made the whole source look
 * an order of magnitude smaller than it is.
 */
const RESULT_LINK =
  /<a\s+href="((?:jncustomsearch\.viewFullSingle\?|\/jobs\/)[^"]*)"[^>]*>([\s\S]*?)<\/a>/i;

function parseRow(li: string): SmartJobsSearchRow | null {
  const link = li.match(RESULT_LINK);
  if (!link) return null;

  const href = decodeEntities(group(link, 1, 'a result link'));
  // Whichever form the link took, take its identifier for tracing.
  const rowRef =
    href.match(/in_jnCounter=(\d+)/i)?.[1] ??
    href.match(/\/jobs\/([^?#/]+)/i)?.[1] ??
    null;
  if (rowRef === null) {
    throw new SmartJobsParseError(`a result link carried no identifier: ${href}`);
  }

  const heading = stripTags(group(link, 2, 'a result heading'));
  if (heading.length === 0) {
    throw new SmartJobsParseError(`result ${rowRef} had an empty heading`);
  }
  const { title, employer } = splitTitleAndEmployer(heading);

  const type = li.match(/<span class="type">([\s\S]*?)<\/span>/i);
  const locality = li.match(/<strong class="locality">([\s\S]*?)<\/strong>/i);
  const description = li.match(/<div class="search-description">([\s\S]*?)<\/div>/i);

  return {
    rowRef,
    title,
    employer,
    employmentText: type ? emptyToNull(stripTags(group(type, 1, 'a type span'))) : null,
    localities: locality
      ? splitLocalities(stripTags(group(locality, 1, 'a locality')))
      : [],
    excerpt: description
      ? emptyToNull(stripTags(group(description, 1, 'a description')))
      : null,
    detailUrl: new URL(href, BASE_URL).toString(),
  };
}

/**
 * Collects the hidden fields of the paging form.
 *
 * The portal advances by replaying its own form with `in_nav=next_set`. The
 * cursor is `in_pg`, which the server has already set to the next offset.
 */
function parseNextPageForm(
  html: string,
  total: number,
  rowCount: number,
): Readonly<Record<string, string>> | null {
  const formIndex = html.search(/<form[^>]*name="resultsform"/i);
  if (formIndex === -1) return null;

  const end = html.toLowerCase().indexOf('</form>', formIndex);
  const form = html.slice(formIndex, end === -1 ? undefined : end);

  const fields: Record<string, string> = {};
  for (const match of form.matchAll(/<input\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/type\s*=\s*"?hidden"?/i.test(tag)) continue;
    const name = tag.match(/name\s*=\s*"?([A-Za-z_0-9]+)"?/i);
    if (!name) continue;
    const value = tag.match(/value\s*=\s*"([^"]*)"/i);
    fields[group(name, 1, 'a hidden field name')] =
      value === null ? '' : decodeEntities(group(value, 1, 'a hidden field value'));
  }

  const offset = Number(fields.in_pg);
  if (!Number.isFinite(offset) || offset <= 0) return null;
  // The server keeps offering a cursor past the end. Stop on the arithmetic
  // rather than trusting it, or ingestion loops on the final page.
  if (offset >= total || rowCount === 0) return null;

  return { ...fields, in_nav: 'next_set' };
}

export function parseSearchResults(html: string): SmartJobsSearchPage {
  const totalMatch = html.match(/of\s*<strong>\s*([\d,]+)\s*<\/strong>\s*matching/i);
  if (!totalMatch) {
    throw new SmartJobsParseError('no "of N matching jobs" count was found');
  }
  const rawTotal = group(totalMatch, 1, 'the result count');
  const total = Number(rawTotal.replace(/,/g, ''));
  if (!Number.isFinite(total)) {
    throw new SmartJobsParseError(`unreadable result count "${rawTotal}"`);
  }

  const listStart = html.search(/<ol[^>]*class="[^"]*search-results[^"]*"/i);
  if (listStart === -1) {
    if (total === 0) return { total: 0, rows: [], nextPageForm: null };
    throw new SmartJobsParseError(`${total} jobs reported but no results list present`);
  }
  const listEnd = html.toLowerCase().indexOf('</ol>', listStart);
  const list = html.slice(listStart, listEnd === -1 ? undefined : listEnd);

  const rows: SmartJobsSearchRow[] = [];
  for (const match of list.matchAll(/<li>([\s\S]*?)<\/li>/gi)) {
    const row = parseRow(match[0]);
    if (row) rows.push(row);
  }

  if (rows.length === 0 && total > 0) {
    throw new SmartJobsParseError(`${total} jobs reported but no rows could be parsed`);
  }

  return { total, rows, nextPageForm: parseNextPageForm(html, total, rows.length) };
}

interface JsonLdJobPosting {
  readonly title?: unknown;
  readonly description?: unknown;
  readonly datePosted?: unknown;
  readonly validThrough?: unknown;
  readonly employmentType?: unknown;
  readonly hiringOrganization?: { readonly name?: unknown } | null;
  readonly identifier?: { readonly value?: unknown } | null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Labels the portal renders after the location, in any order.
 *
 * The location field runs until the next label. Missing one lets that label's
 * text be swallowed into the final region name, which was exactly the bug a
 * live run caught: "Townsville region Job ad reference QLD/164089" arrived as
 * a region. Every label seen on a live page is listed, and the terminator is
 * an alternation rather than a single guess.
 */
const FIELD_LABELS_AFTER_LOCATION = [
  'Job ad reference',
  'Closing date',
  'Yearly salary',
  'Fortnightly salary',
  'Total remuneration',
  'Salary Other',
  'Contact person',
  'Contact details',
  'Classification',
  'Occupational group',
  'Position type',
].join('|');

/**
 * Reads the labelled "Workplace Location" field.
 *
 * The JSON-LD on this portal publishes an entirely empty `jobLocation`, so the
 * only geography available is this rendered field. That is the reason the
 * detail parser reads markup at all rather than trusting the structured data.
 */
function parseWorkplaceLocation(html: string): readonly string[] {
  const text = stripTags(html);
  const match = text.match(
    new RegExp(
      `Workplace Location\\s*(.+?)\\s*(?:${FIELD_LABELS_AFTER_LOCATION}|$)`,
      'i',
    ),
  );
  return match ? splitLocalities(group(match, 1, 'Workplace Location')) : [];
}

export function parseJobDetail(html: string): SmartJobsJobDetail {
  const script = html.match(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!script) {
    throw new SmartJobsParseError('the detail page carried no JSON-LD block');
  }

  let posting: JsonLdJobPosting;
  try {
    posting = JSON.parse(group(script, 1, 'the JSON-LD block')) as JsonLdJobPosting;
  } catch (error) {
    throw new SmartJobsParseError(
      `the JSON-LD block was not valid JSON: ${(error as Error).message}`,
    );
  }

  const reference = asString(posting.identifier?.value);
  if (!reference) {
    // Without this there is no idempotency key, so ingestion would create a
    // duplicate on every run. Refusing is the only safe outcome.
    throw new SmartJobsParseError('the JSON-LD carried no identifier value');
  }
  const title = asString(posting.title);
  if (!title) {
    throw new SmartJobsParseError(`listing ${reference} carried no title`);
  }

  const employmentType = posting.employmentType;
  const employmentTypes = Array.isArray(employmentType)
    ? employmentType.filter((value): value is string => typeof value === 'string')
    : typeof employmentType === 'string'
      ? [employmentType]
      : [];

  const licence = html.match(
    /<meta[^>]*name="DCTERMS\.license"[^>]*content="([^"]*)"[^>]*>/i,
  );

  return {
    reference,
    title,
    employer: asString(posting.hiringOrganization?.name),
    description: asString(posting.description),
    datePosted: asString(posting.datePosted),
    validThrough: asString(posting.validThrough),
    employmentTypes,
    localities: parseWorkplaceLocation(html),
    declaredLicence: licence
      ? decodeEntities(group(licence, 1, 'the DCTERMS.license meta'))
      : null,
  };
}
