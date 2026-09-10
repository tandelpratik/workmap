import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { brand } from '@/config/brand';
import { legal } from '@/config/legal';

/**
 * The legal boundary, asserted rather than trusted to reviewers.
 *
 * This product reports what a job advertisement said about visa sponsorship. It
 * does not advise anyone about their own migration position, which is
 * "immigration assistance" within the meaning of the Migration Act 1958 and is
 * reserved to registered agents and legal practitioners. It also never
 * characterises an employer as a sponsor, because that is a statement about a
 * real business that a reader may act on by relocating.
 *
 * Both of those are one careless sentence away at any time, and the product's
 * own name is the thing most likely to invite the sentence. So the boundary is
 * a test: a phrase that crosses it fails the build rather than surviving until
 * somebody notices it on a page.
 */

const root = join(import.meta.dirname, '..');

/** Everything a reader can end up looking at. */
const interfaceDirs = ['app', 'components', 'config'];

const skipDirs = new Set(['generated', 'node_modules', '.next']);

function sourceFiles(dir: string): string[] {
  const absolute = join(root, dir);
  let entries: string[];
  try {
    entries = readdirSync(absolute);
  } catch {
    return [];
  }

  return entries.flatMap((entry) => {
    if (skipDirs.has(entry)) return [];
    const full = join(absolute, entry);
    if (statSync(full).isDirectory()) return sourceFiles(join(dir, entry));
    return /\.(ts|tsx)$/.test(entry) ? [join(dir, entry)] : [];
  });
}

/**
 * Phrases that are wrong wherever they appear, including inside a sentence
 * denying them.
 *
 * That last part is why the list is short. "Visa eligibility" is not here: the
 * product has to be able to say it does not assess visa eligibility. What is
 * here is either a claim about an employer that no advertisement can support,
 * or an assessment addressed to the reader, and neither has an innocent
 * phrasing. Third-person denials pass; second-person ones do not, which is why
 * every string in config/legal.ts is written in the third person.
 */
const forbidden = [
  // Claims about an employer. "Approved sponsor" is a term of art in the
  // sponsorship system and asserting it of a business is a statement of fact
  // about their standing with the Department, not a reading of their advert.
  'verified sponsor',
  'approved sponsor',
  'registered sponsor',
  'guaranteed sponsorship',
  'sponsorship guaranteed',
  // Assessments addressed to the reader.
  'you are eligible',
  'you may be eligible',
  'you might be eligible',
  'you qualify',
  'you may qualify',
  'pr pathway',
  'pathway to pr',
  'permanent residency pathway',
];

describe('the published legal position', () => {
  it('carries the product name, so a rename carries with it', () => {
    // Written out nowhere: the string is composed from the brand configuration,
    // so a rename cannot leave the legal text naming a product that no longer
    // exists (ADR-0007).
    expect(legal.disclaimer.startsWith(brand.productName)).toBe(true);
    expect(legal.notGovernment).toContain(brand.productName);
    expect(legal.notAffiliatedWithSources).toContain(brand.productName);
  });

  it('states both halves of what the product is', () => {
    // What it does, and what it is not. A disclaimer carrying only the second
    // half reads as a hedge; only the first is a claim with no boundary on it.
    expect(legal.disclaimer).toContain('sponsorship wording published');
    expect(legal.disclaimer).toContain('does not provide migration advice');
  });

  it('names an official destination on a government host', () => {
    const url = new URL(legal.officialVisaInformation.url);
    expect(url.protocol).toBe('https:');
    expect(url.hostname.endsWith('.gov.au')).toBe(true);
  });

  it('states its exclusions in the third person', () => {
    expect(legal.exclusions.length).toBeGreaterThan(0);
    for (const exclusion of legal.exclusions) {
      // "whether you are eligible" reads as an assessment of the reader even
      // inside a sentence refusing to make one.
      expect(exclusion.toLowerCase()).not.toMatch(/\byou\b|\byour\b/);
    }
  });
});

describe('the interface never crosses the boundary', () => {
  it('carries no phrase that claims sponsorship or assesses a reader', () => {
    const offenders = interfaceDirs.flatMap(sourceFiles).flatMap((file) => {
      const text = readFileSync(join(root, file), 'utf8').toLowerCase();
      const found = forbidden.filter((phrase) => text.includes(phrase));
      return found.length === 0
        ? []
        : [`${relative('.', file).split(sep).join('/')}: ${found.join(', ')}`];
    });

    expect(
      offenders,
      'These phrases either assert something about an employer that no ' +
        'advertisement can support, or assess the reader, which is migration ' +
        `advice. Found: ${offenders.join('; ')}`,
    ).toEqual([]);
  });

  it('is published on every page by the site footer', () => {
    /*
     * A source-text assertion rather than a render one, for the same reason the
     * brand test is: what matters is that the one component every page renders
     * still reaches for the configured string. Deleting the disclaimer from the
     * footer, or replacing it with a hand-written paraphrase, fails here.
     */
    const footer = readFileSync(
      join(root, 'components', 'layout', 'site-footer.tsx'),
      'utf8',
    );
    expect(footer).toContain('legal.disclaimer');
  });
});
