/**
 * Reading advertisement text.
 *
 * Two things every reader of an advertisement needs: the text with its markup
 * taken off, and the sentence a matched phrase sits in. Both were written for
 * the sponsorship detector and both are now needed by skill extraction, which
 * must not import the sponsorship module to get them: what a sentence is has
 * nothing to do with visas.
 *
 * Quoting a sentence rather than a window of characters is the part that
 * matters, and the reason is the same wherever it is used. A window cuts
 * mid-clause and can sever the qualifier that decides what the sentence means.
 * "Sponsorship is available" and "sponsorship is available only to applicants
 * already holding full work rights" differ in exactly the part a fixed window
 * is most likely to lose, and "a current C class licence is required" differs
 * from "a C class licence is not required" in one word near the end.
 */

/**
 * How long a run of text may be before it stops being a sentence.
 *
 * Advertisements arrive as HTML and a bulleted list has no terminating
 * punctuation at all, so stripping the markup can leave hundreds of characters
 * with nothing to split on. Past this length the quotation is trimmed around
 * the phrase instead, which is a worse quotation than a sentence and a better
 * one than a wall of text.
 */
const MAX_SENTENCE = 320;

/** How much text either side of a phrase is kept when no sentence is found. */
const FALLBACK_RADIUS = 110;

/**
 * Strips markup, decodes entities and collapses whitespace.
 *
 * Advertisements arrive as HTML. A phrase split by a tag ("visa<b>
 * sponsorship</b>") must still match, so tags become spaces rather than
 * being deleted, which would fuse the words either side of them.
 *
 * Numeric entities are decoded because the sources use them heavily and the
 * output of this function is quoted to readers. 1,811 of the 2,713 listings
 * held on 2026-09-13 carried at least one, `&#160;` alone appearing 11,067
 * times, and every one of those was reaching a sponsorship quotation as
 * literal "&#160;" text. Decoding happens after tags are stripped, which is
 * also why the named-entity replacements above are safe: a decoded "&lt;"
 * cannot reopen a tag that has already been removed.
 */
export function plainText(html: string): string {
  return (
    html
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      // Numeric entities, decimal and hexadecimal. Named entities are handled
      // above one at a time because only a handful appear; numeric ones cannot
      // be, because there is an entity for every character.
      .replace(/&#(\d+);/g, (whole, code: string) => codePoint(whole, Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (whole, code: string) =>
        codePoint(whole, Number.parseInt(code, 16)),
      )
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * One decoded character, or the entity untouched if it does not name one.
 *
 * Out-of-range and surrogate code points are left as they were written rather
 * than replaced with a substitution character. Text a source wrote badly is
 * still the source's text, and mangling it further would put a character in a
 * quotation that nobody published.
 */
function codePoint(whole: string, code: number): string {
  if (!Number.isInteger(code) || code <= 0 || code > 0x10ffff) return whole;
  if (code >= 0xd800 && code <= 0xdfff) return whole;
  return String.fromCodePoint(code);
}

/**
 * The sentence a phrase sits in.
 *
 * Bounded by sentence-ending punctuation, and trimmed to a window around the
 * phrase where the text has no punctuation to bound it.
 *
 * The returned `from` and `to` are the sentence's own bounds, and stay the
 * sentence's bounds even when the quoted text has been trimmed to a window
 * inside them. They are the identity of the sentence for grouping, and that
 * distinction is the whole reason they are returned separately from the text.
 *
 * Two phrases in one sentence must resolve together, or an advertisement saying
 * "sponsorship is available for the right candidate" would be read as two
 * sentences disagreeing with each other. Returning the window bounds instead
 * broke exactly that: two overlapping patterns matched the same words with
 * different lengths, produced two windows differing by four characters, and a
 * real listing showed the reader the same quotation twice.
 */
export function sentenceAt(
  text: string,
  start: number,
  end: number,
): { readonly text: string; readonly from: number; readonly to: number } {
  let from = 0;
  for (let index = start - 1; index >= 0; index -= 1) {
    if (/[.!?]/.test(text[index] ?? '')) {
      from = index + 1;
      break;
    }
  }

  let to = text.length;
  for (let index = end; index < text.length; index += 1) {
    if (/[.!?]/.test(text[index] ?? '')) {
      to = index + 1;
      break;
    }
  }

  // Unpunctuated text, usually a flattened bullet list. Fall back to a window
  // around the phrase rather than quoting a paragraph as though it were one
  // sentence.
  if (to - from > MAX_SENTENCE) {
    const windowFrom = Math.max(from, start - FALLBACK_RADIUS);
    const windowTo = Math.min(to, end + FALLBACK_RADIUS);
    const prefix = windowFrom > from ? '…' : '';
    const suffix = windowTo < to ? '…' : '';
    return {
      text: `${prefix}${text.slice(windowFrom, windowTo).trim()}${suffix}`,
      // The sentence's bounds, not the window's. See the note above: these are
      // an identity for grouping, and a window that moves with the phrase is
      // not one.
      from,
      to,
    };
  }

  return { text: text.slice(from, to).trim(), from, to };
}
