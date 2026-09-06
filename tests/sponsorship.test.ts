import { describe, expect, it } from 'vitest';
import {
  detectSponsorship,
  plainText,
  sponsorshipLabel,
  type SponsorshipSignal,
} from '@/domain/sponsorship';

/**
 * Sponsorship wording detection.
 *
 * The strings here are real advertisement text already held in the database,
 * not invented examples. Two of them are the reason this is phrase matching
 * rather than a keyword search: both contain "visa" and neither offers
 * sponsorship to anyone.
 */

const REAL = {
  affirmative:
    'Pay rate – up to $57 per hour (based on experience) up to $18,550 tax free ' +
    'superannuation Sponsorship available for candidates with AHPRA seeking PR ' +
    'Autonomous and rewarding role in a very supportive team',
  affirmativeVisa:
    'multidisciplinary team delivering comprehensive care across all stages of life ' +
    'DPA location with visa sponsorship available and flexibility to pursue your ' +
    'interests in women’s health and family medicine',
  refusal:
    'Remuneration : $108,021 base, plus 17% superannuation and leave loading Work ' +
    'rights required: Visa sponsorship is not available for this position. ' +
    'Candidates must hold full rights to work in Australia to be considered.',
  visaHolders:
    'Applications from local, interstate, and international teachers (including ' +
    'Working Holiday Makers and Skilled Regional Visa Holders) are welcome. We are ' +
    'seeking expressions of interest from teachers in the following subject areas',
  visaInTitle:
    'Expressions of interest (EOI) for the below roles:HR Advisor (Recruitment ' +
    'Services)HR Advisor (Establishment Services)HR Advisor (Visa and JEMS)HR ' +
    'Advisor (Workforce Policy &amp; Standards)',
} as const;

const full = (text: string) => detectSponsorship({ text, isExcerpt: false });

describe('reading an offer of sponsorship', () => {
  it('finds it, and keeps the words that said so', () => {
    const found = full(REAL.affirmative);

    expect(found.signal).toBe('MENTIONED');
    expect(found.evidence[0]?.phrase.toLowerCase()).toContain('sponsorship available');
    // The evidence has to be checkable by a reader, so it carries context.
    expect(found.evidence[0]?.context).toContain('AHPRA');
  });

  it('finds it when phrased as visa sponsorship', () => {
    const found = full(REAL.affirmativeVisa);

    expect(found.signal).toBe('MENTIONED');
    expect(found.evidence[0]?.phrase.toLowerCase()).toContain('visa sponsorship');
  });
});

describe('reading a refusal', () => {
  it('reports the refusal rather than the phrase it contains', () => {
    // "Visa sponsorship is not available" contains "visa sponsorship". A
    // matcher that stopped at the phrase would label this advertisement as
    // offering exactly what it refuses.
    const found = full(REAL.refusal);

    expect(found.signal).toBe('EXCLUDED');
    expect(found.evidence[0]?.context.toLowerCase()).toContain('not available');
  });

  it('prefers the refusal when an advertisement contains both', () => {
    // The two errors are not symmetrical. Telling someone an employer sponsors
    // when it does not can send them to relocate or apply on a false basis.
    const both =
      'Visa sponsorship is not available for this position. Sponsorship available ' +
      'for candidates in other roles.';
    expect(full(both).signal).toBe('EXCLUDED');
  });
});

describe('wording that mentions visas but offers nothing', () => {
  it('does not treat existing visa holders as an offer to sponsor', () => {
    // Real advertisement. It welcomes people who already hold a visa, which is
    // the opposite of offering to obtain one for them.
    expect(full(REAL.visaHolders).signal).toBe('NOT_MENTIONED');
  });

  it('does not match the word visa inside a job title', () => {
    // Real advertisement: "HR Advisor (Visa and JEMS)" is a Queensland Health
    // role that processes visas. Nothing to do with sponsoring the applicant.
    expect(full(REAL.visaInTitle).signal).toBe('NOT_MENTIONED');
  });

  it('ignores unrelated senses of sponsorship', () => {
    const text = 'We are proud of our community sponsorship of local sporting clubs.';
    expect(full(text).signal).toBe('NOT_MENTIONED');
  });
});

describe('silence is only reported when the whole advertisement was read', () => {
  it('says not mentioned for a full advertisement that is silent', () => {
    const found = full('A great role in a supportive team. Apply today.');
    expect(found.signal).toBe('NOT_MENTIONED');
    expect(found.evidence).toEqual([]);
  });

  it('refuses to conclude anything from an excerpt', () => {
    // Every Adzuna listing is a snippet. Absence of the wording in a fragment
    // says nothing about the advertisement, and reporting it as "not
    // mentioned" would turn a gap in our data into a claim about someone's
    // job advertisement.
    const found = detectSponsorship({
      text: 'A great role in a supportive team. Apply today.',
      isExcerpt: true,
    });
    expect(found.signal).toBe('INDETERMINATE');
    expect(found.evidence).toEqual([]);
  });

  it('still reports wording that is present in an excerpt', () => {
    // An excerpt cannot prove absence, but it can prove presence.
    const found = detectSponsorship({ text: REAL.affirmative, isExcerpt: true });
    expect(found.signal).toBe('MENTIONED');
    expect(found.evidence.length).toBeGreaterThan(0);
  });

  it('treats no text at all as unknown, never as silence', () => {
    expect(detectSponsorship({ text: null, isExcerpt: false }).signal).toBe(
      'INDETERMINATE',
    );
    expect(detectSponsorship({ text: '   ', isExcerpt: false }).signal).toBe(
      'INDETERMINATE',
    );
  });
});

describe('markup', () => {
  it('matches a phrase split by a tag', () => {
    const found = full('<p>visa <strong>sponsorship</strong> available</p>');
    expect(found.signal).toBe('MENTIONED');
  });

  it('does not fuse words either side of a tag', () => {
    // Deleting tags rather than replacing them with a space would produce
    // "novisa sponsorship", changing what the advertisement says.
    expect(plainText('<p>no</p><p>visa</p>')).toBe('no visa');
  });
});

describe('labels', () => {
  it('describes the advertisement, never the employer', () => {
    // "This employer does not sponsor" is a claim about a business. Nothing in
    // an advertisement's silence supports it, and publishing it would be a
    // representation we cannot stand behind.
    for (const signal of [
      'MENTIONED',
      'EXCLUDED',
      'NOT_MENTIONED',
      'INDETERMINATE',
    ] as SponsorshipSignal[]) {
      const label = sponsorshipLabel(signal).toLowerCase();
      expect(label).not.toContain('employer');
      expect(label).not.toContain('you ');
      expect(label).not.toContain('eligible');
      expect(label).not.toContain('qualify');
    }
  });

  it('never states a conclusion for the two unknown cases', () => {
    expect(sponsorshipLabel('NOT_MENTIONED')).toContain('advertisement');
    expect(sponsorshipLabel('INDETERMINATE')).toContain('Not known');
  });
});
