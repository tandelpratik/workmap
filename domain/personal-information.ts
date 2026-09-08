import type { NormalizedJob } from './job';

/**
 * Personal information minimisation.
 *
 * A job advertisement is written to be read by applicants, not to be indexed by
 * a third party, and Queensland advertisements in particular routinely name a
 * contact officer with a direct telephone number and a work email address. The
 * licence covering the advertisement does not make republishing that
 * proportionate, and this product has no use for it: every listing links to the
 * original, where the contact appears in the context the publisher intended.
 *
 * So contact details are removed on the way in, before anything is stored,
 * rather than hidden on the way out. Minimising what is collected is stronger
 * than minimising what is displayed, and it means a later feature, an export or
 * a database dump cannot reintroduce what a render-time filter would have been
 * hiding.
 *
 * This is a deterministic filter over two patterns that can be recognised
 * reliably. It is deliberately not an attempt to recognise everything:
 *
 *   - **Names are not removed.** A contact officer's name is indistinguishable
 *     from an employer's name, a suburb or half the words in a job title, and a
 *     filter that guessed would mangle legitimate advertisement text. The rights
 *     matrix records `contactDetails: WITHHELD`; this implements the part of it
 *     that can be implemented without damage.
 *   - **Postal addresses are not removed.** A workplace address is the location
 *     of the job, which is the product's subject. A residential address is not
 *     separable from it by pattern.
 *
 * Where the filter cannot reach, the position is documented rather than assumed
 * solved, and the report route exists so a person can ask for a specific removal.
 */

/** What was taken out, so a removal can be counted and audited. */
export const redactionKinds = ['EMAIL', 'PHONE'] as const;
export type RedactionKind = (typeof redactionKinds)[number];

export interface Redaction {
  readonly kind: RedactionKind;
  /** Where the removed text began in the original string. */
  readonly index: number;
  /** How many characters were removed. The text itself is never kept. */
  readonly length: number;
}

export interface RedactionResult {
  readonly text: string;
  readonly redactions: readonly Redaction[];
}

/** Stands in for what was removed, so the sentence still reads as a sentence. */
const EMAIL_PLACEHOLDER = '[email removed]';
const PHONE_PLACEHOLDER = '[phone number removed]';

/**
 * Patterns, ordered so the longest and most specific run first.
 *
 * Every one is anchored at both ends. An unanchored phone pattern will happily
 * consume part of a salary, an ABN or a job reference, and a filter that eats a
 * salary figure has done more damage than the one it prevented.
 *
 * The telephone anchors are digit boundaries rather than word boundaries, and
 * the difference is not academic. Descriptions arrive as stripped HTML, so a
 * number frequently runs straight into whatever followed the closing tag:
 * `07 4885 7716Join a passionate team`. A trailing `\b` is satisfied by neither
 * side of `6J` and the number survived the filter, which a live sweep found on
 * real listings. `(?!\d)` still refuses to take a fragment of a longer digit
 * run, which is the only thing the boundary was protecting against.
 */
const PATTERNS: readonly {
  readonly kind: RedactionKind;
  readonly pattern: RegExp;
  readonly placeholder: string;
}[] = [
  {
    kind: 'EMAIL',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g,
    placeholder: EMAIL_PLACEHOLDER,
  },
  {
    // International form: +61 followed by nine digits, however grouped.
    kind: 'PHONE',
    pattern: /(?<!\d)\+61[ ()\-.]?\d(?:[ ()\-.]?\d){8}(?!\d)/g,
    placeholder: PHONE_PLACEHOLDER,
  },
  {
    // Bracketed area code: (07) 3234 5678.
    kind: 'PHONE',
    pattern: /\(0[2-8]\)[ \-.]?\d{4}[ \-.]?\d{4}(?!\d)/g,
    placeholder: PHONE_PLACEHOLDER,
  },
  {
    // Ten digits beginning 02, 03, 04, 07 or 08, flat or in the usual groups.
    // The trailing boundary is what keeps this out of longer digit strings.
    kind: 'PHONE',
    pattern: /(?<!\d)0[23478](?:[ \-.]?\d){8}(?!\d)/g,
    placeholder: PHONE_PLACEHOLDER,
  },
  {
    // The 1300 and 1800 ranges.
    kind: 'PHONE',
    pattern: /(?<!\d)1[38]00[ \-.]?\d{3}[ \-.]?\d{3}(?!\d)/g,
    placeholder: PHONE_PLACEHOLDER,
  },
  {
    // The six-digit 13 range, written 13 12 34 or 131234.
    kind: 'PHONE',
    pattern: /(?<!\d)13[ \-.]?\d{2}[ \-.]?\d{2}(?![ \-.]?\d)/g,
    placeholder: PHONE_PLACEHOLDER,
  },
];

/**
 * Removes contact details from a block of advertisement text.
 *
 * Matches from every pattern are collected first and applied in one pass from
 * the end backwards, so an earlier replacement cannot shift the offsets of a
 * later one. Overlapping matches keep the first, which is why the patterns are
 * ordered longest-first: `+61 7 3234 5678` should be recognised as one
 * international number rather than as a fragment plus a local one.
 */
export function redactPersonalInformation(text: string): RedactionResult {
  const found: { kind: RedactionKind; index: number; length: number; with: string }[] =
    [];

  for (const { kind, pattern, placeholder } of PATTERNS) {
    // Fresh lastIndex per call: these are module-level /g regexes and would
    // otherwise carry state between invocations.
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      const overlaps = found.some(
        (existing) => start < existing.index + existing.length && end > existing.index,
      );
      if (!overlaps) {
        found.push({ kind, index: start, length: match[0].length, with: placeholder });
      }
    }
  }

  if (found.length === 0) return { text, redactions: [] };

  found.sort((a, b) => a.index - b.index);

  let output = '';
  let cursor = 0;
  for (const item of found) {
    output += text.slice(cursor, item.index) + item.with;
    cursor = item.index + item.length;
  }
  output += text.slice(cursor);

  return {
    text: output,
    redactions: found.map(({ kind, index, length }) => ({ kind, index, length })),
  };
}

/** Whether a string still carries anything this filter recognises. */
export function containsPersonalInformation(text: string): boolean {
  return redactPersonalInformation(text).redactions.length > 0;
}

export interface SanitisedJob {
  readonly job: NormalizedJob;
  readonly redactions: readonly Redaction[];
}

/**
 * A listing with contact details removed from its description.
 *
 * Applied by ingestion before the content hash is computed, so the hash covers
 * the text that will actually be stored and an unchanged advertisement still
 * looks unchanged on the next run.
 *
 * Only the description is filtered. The title, employer and location are short
 * factual fields that the rights matrix marks publishable, and running a phone
 * pattern over a suburb name buys nothing.
 */
export function withoutPersonalInformation(job: NormalizedJob): SanitisedJob {
  if (job.description === null) return { job, redactions: [] };

  const result = redactPersonalInformation(job.description);
  if (result.redactions.length === 0) return { job, redactions: [] };

  return {
    job: { ...job, description: result.text },
    redactions: result.redactions,
  };
}
