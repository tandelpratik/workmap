import { describe, expect, it } from 'vitest';
import {
  affirmativeSignals,
  detectSponsorship,
  isEvidenced,
  plainText,
  sentenceAt,
  sponsorshipLabel,
  sponsorshipMeaning,
  sponsorshipSignals,
  type SponsorshipSignal,
} from '@/domain/sponsorship';

/**
 * Sponsorship wording detection.
 *
 * The strings marked REAL are advertisement text already held in the database,
 * not invented examples. Two of them are the reason this is phrase matching
 * rather than a keyword search: both contain "visa" and neither offers
 * sponsorship to anyone.
 *
 * The strength tests matter more than the presence tests. Whether an
 * advertisement mentions sponsorship is a question the old detector already
 * answered; how firmly it said so is the question a reader deciding whether to
 * move house is actually asking, and the direction the detector errs in when
 * the wording is ambiguous is a decision this file pins down.
 */

const REAL = {
  offered:
    'Pay rate – up to $57 per hour (based on experience) up to $18,550 tax free ' +
    'superannuation Sponsorship available for candidates with AHPRA seeking PR ' +
    'Autonomous and rewarding role in a very supportive team',
  offeredVisa:
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

describe('the strength of what an advertisement said', () => {
  it('reads a statement that sponsorship is available as an offer', () => {
    const found = full(REAL.offered);
    expect(found.signal).toBe('OFFERED');
    expect(found.evidence[0]?.phrase.toLowerCase()).toContain('sponsorship available');
  });

  it('reads a stated willingness as open to sponsorship', () => {
    // The employer has said it will do the thing without saying the thing is
    // already on the table. Neither an offer nor a mere possibility.
    for (const text of [
      'We are happy to sponsor the right applicant for a 482 visa.',
      'The company is willing to sponsor candidates with relevant experience.',
      'We are open to sponsoring an overseas applicant.',
      'For an exceptional candidate we can sponsor a visa.',
    ]) {
      expect(full(text).signal, text).toBe('OPEN_TO');
    }
  });

  it('reads a hedge as a possibility rather than an offer', () => {
    for (const text of [
      'Visa sponsorship may be available for the successful applicant.',
      'Sponsorship will be considered for suitably qualified candidates.',
      'We may consider sponsorship on a case by case basis.',
      'Visa sponsorship is negotiable.',
    ]) {
      expect(full(text).signal, text).toBe('MAY_BE_CONSIDERED');
    }
  });

  it('reads a bare mention at the weakest affirmative strength', () => {
    /*
     * A benefits list saying only "visa sponsorship" has raised the subject and
     * has not said how firmly. Reading it as an offer would be us supplying a
     * commitment the employer did not write, so it takes the weakest
     * affirmative reading and the sentence is printed for the reader to judge.
     */
    const found = full(
      'What we offer: Relocation assistance. Visa sponsorship. Parking.',
    );
    expect(found.signal).toBe('MAY_BE_CONSIDERED');
    expect(found.evidence[0]?.phrase.toLowerCase()).toBe('visa sponsorship');
  });
});

describe('how competing wording is resolved', () => {
  it('takes the strongest reading within one sentence', () => {
    // "Available" is what this sentence says. The qualifier narrows who, not
    // whether, so it must not drag the finding down to a possibility.
    const found = full('Visa sponsorship is available for the right candidate.');
    expect(found.signal).toBe('OFFERED');
  });

  it('takes the weakest reading across sentences', () => {
    /*
     * The asymmetry this module turns on. Telling a reader an employer offers
     * sponsorship when the advertisement only floated the possibility may send
     * them to relocate or resign on a false basis; the reverse understates an
     * employer whose own sentence is printed directly beneath the label.
     */
    const found = full(
      'Benefits include visa sponsorship. Sponsorship may be considered on a ' +
        'case by case basis for exceptional applicants.',
    );
    expect(found.signal).toBe('MAY_BE_CONSIDERED');
  });

  it('quotes only the sentences at the strength it reports', () => {
    // The label and the quotation beneath it must say the same thing. Showing
    // a stronger sentence under a weaker label invites the reader to conclude
    // the label is wrong, or worse, to believe the stronger one.
    const found = full(
      'Sponsorship is available for nursing roles. Sponsorship may be ' +
        'considered for administrative roles.',
    );
    expect(found.signal).toBe('MAY_BE_CONSIDERED');
    expect(found.evidence).toHaveLength(1);
    expect(found.evidence[0]?.sentence.toLowerCase()).toContain('may be');
  });

  it('prefers a refusal over any offer in the same advertisement', () => {
    const both =
      'Visa sponsorship is not available for this position. Sponsorship available ' +
      'for candidates in other roles.';
    expect(full(both).signal).toBe('EXCLUDED');
  });
});

describe('reading a refusal', () => {
  it('reports the refusal rather than the phrase it contains', () => {
    // "Visa sponsorship is not available" contains "visa sponsorship". A
    // matcher that stopped at the phrase would label this advertisement as
    // offering exactly what it refuses.
    const found = full(REAL.refusal);
    expect(found.signal).toBe('EXCLUDED');
    expect(found.evidence[0]?.sentence.toLowerCase()).toContain('not available');
  });

  it('reads a refusal that contains no affirmative phrase to negate', () => {
    /*
     * The defect the explicit refusal patterns exist for. "Sponsorship is not
     * available" has the word "not" sitting between "sponsorship" and
     * "available", so no affirmative pattern matches it anywhere, and a
     * detector built only on negating affirmative matches reported the
     * clearest statement an employer can make on the subject as no statement
     * at all.
     */
    for (const text of [
      'Sponsorship is not available for this role.',
      'We are unable to sponsor applicants.',
      'No sponsorship is offered for this position.',
      'We do not offer visa sponsorship.',
      'Sponsorship is unavailable.',
    ]) {
      expect(full(text).signal, text).toBe('EXCLUDED');
    }
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
    /*
     * Why there is no bare "sponsorship" pattern. A marketing or events role
     * can be entirely about sponsorship agreements, and matching the word
     * alone would fill a visa sponsorship filter with jobs that have nothing
     * to do with visas.
     */
    for (const text of [
      'We are proud of our community sponsorship of local sporting clubs.',
      'You will manage sponsorship agreements and commercial partnerships.',
      'Reporting on sponsorship revenue and event delivery.',
    ]) {
      expect(full(text).signal, text).toBe('NOT_MENTIONED');
    }
  });
});

describe('the quoted evidence', () => {
  it('is the sentence the phrase sat in, not a window of characters', () => {
    /*
     * A fixed window cuts mid-clause and can sever the very qualifier that
     * decides what a sentence means. The sentence boundary is what makes the
     * quotation a quotation rather than a fragment a reader has to reassemble.
     */
    const found = full(
      'We offer a supportive team and modern facilities. Visa sponsorship is ' +
        'available for applicants who already hold AHPRA registration. Apply today.',
    );
    const sentence = found.evidence[0]?.sentence ?? '';
    expect(sentence).toContain('AHPRA registration');
    expect(sentence).not.toContain('modern facilities');
    expect(sentence).not.toContain('Apply today');
  });

  it('falls back to a window when the text has no sentence at all', () => {
    // A flattened bullet list. Quoting the whole paragraph as though it were
    // one sentence would be a worse quotation than a trimmed one.
    const wall = `${'benefit item '.repeat(40)}visa sponsorship ${'more item '.repeat(40)}`;
    const found = full(wall);
    expect(found.signal).toBe('MAY_BE_CONSIDERED');
    const sentence = found.evidence[0]?.sentence ?? '';
    expect(sentence.length).toBeLessThan(400);
    expect(sentence).toContain('visa sponsorship');
    expect(sentence.startsWith('…')).toBe(true);
  });

  it('groups two phrases in one sentence into one finding', () => {
    // "visa sponsorship" and "sponsorship available" both match here. They are
    // one statement, and reporting them as two would print the same sentence
    // to the reader twice.
    const found = full(REAL.offeredVisa);
    expect(found.signal).toBe('OFFERED');
    expect(found.evidence).toHaveLength(1);
  });

  it('groups overlapping phrases in unpunctuated text into one finding', () => {
    /*
     * The defect a real listing found and no test had. Two patterns match the
     * same words with different lengths here ("sponsorship available" and
     * "sponsorship available for"). The text is long and has no sentence
     * punctuation, so each match fell back to a window around itself, the two
     * windows differed by four characters, and grouping by the window instead
     * of by the sentence showed the reader the same quotation twice.
     */
    const padding = 'a supportive team and modern facilities '.repeat(8);
    const found = full(
      `${padding}Sponsorship available for candidates with AHPRA seeking PR ${padding}`,
    );
    expect(found.signal).toBe('OFFERED');
    expect(found.evidence).toHaveLength(1);
  });

  it('accompanies every finding that reports wording', () => {
    // The rule the quality check enforces against stored rows, asserted here
    // against the detector that writes them.
    for (const text of [REAL.offered, REAL.offeredVisa, REAL.refusal]) {
      const found = full(text);
      expect(isEvidenced(found.signal), text).toBe(true);
      expect(found.evidence.length, text).toBeGreaterThan(0);
    }
    for (const signal of ['NOT_MENTIONED', 'INDETERMINATE'] as SponsorshipSignal[]) {
      expect(isEvidenced(signal)).toBe(false);
    }
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
    const found = detectSponsorship({ text: REAL.offered, isExcerpt: true });
    expect(found.signal).toBe('OFFERED');
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
    expect(found.signal).toBe('OFFERED');
  });

  it('does not fuse words either side of a tag', () => {
    // Deleting tags rather than replacing them with a space would produce
    // "novisa sponsorship", changing what the advertisement says.
    expect(plainText('<p>no</p><p>visa</p>')).toBe('no visa');
  });
});

describe('sentence boundaries', () => {
  it('takes the run of text between terminators', () => {
    const text = 'One. Two is here. Three.';
    const found = sentenceAt(text, text.indexOf('is'), text.indexOf('is') + 2);
    expect(found.text).toBe('Two is here.');
  });

  it('handles a phrase in the first and last sentence', () => {
    const text = 'Start here. End there.';
    expect(sentenceAt(text, 0, 5).text).toBe('Start here.');
    expect(sentenceAt(text, text.indexOf('End'), text.indexOf('End') + 3).text).toBe(
      'End there.',
    );
  });
});

describe('labels', () => {
  it('offers exactly the six findings the product publishes', () => {
    expect([...sponsorshipSignals]).toEqual([
      'OFFERED',
      'OPEN_TO',
      'MAY_BE_CONSIDERED',
      'EXCLUDED',
      'NOT_MENTIONED',
      'INDETERMINATE',
    ]);
  });

  it('orders the affirmatives weakest first, which is the resolution order', () => {
    // The comparison in detectSponsorship reads this array rather than
    // restating the order, so a reordering here changes behaviour and must be
    // deliberate.
    expect([...affirmativeSignals]).toEqual(['MAY_BE_CONSIDERED', 'OPEN_TO', 'OFFERED']);
  });

  it('describes the advertisement, never the employer and never the reader', () => {
    /*
     * "This employer does not sponsor" is a claim about a business. Nothing in
     * an advertisement's silence supports it, and publishing it would be a
     * representation we cannot stand behind. "You may be eligible" is worse:
     * it is migration advice.
     */
    for (const signal of sponsorshipSignals) {
      for (const wording of [sponsorshipLabel(signal), sponsorshipMeaning(signal)]) {
        const text = wording.toLowerCase();
        expect(text, signal).not.toMatch(/\byou\b|\byour\b/);
        expect(text, signal).not.toContain('eligible');
        expect(text, signal).not.toContain('qualify');
      }
      // The short label is what a card carries, so it has to stay short.
      expect(sponsorshipLabel(signal).length, signal).toBeLessThan(32);
    }
  });

  it('keeps the two absences about the document rather than the business', () => {
    expect(sponsorshipMeaning('NOT_MENTIONED')).toContain('advertisement');
    expect(sponsorshipMeaning('NOT_MENTIONED')).toContain('never sponsors');
    expect(sponsorshipMeaning('INDETERMINATE')).toContain('Only part');
  });
});
