import { describe, expect, it } from 'vitest';
import {
  containsPersonalInformation,
  redactPersonalInformation,
  withoutPersonalInformation,
} from '@/domain/personal-information';
import type { NormalizedJob } from '@/domain/job';

/**
 * The false-positive cases matter as much as the true ones.
 *
 * A filter that eats a salary band, a job reference or an ABN has done more
 * damage to an advertisement than the contact detail it removed, and the damage
 * is silent: nobody reports a missing figure they never saw. Half of what
 * follows exists to hold that line.
 */

function job(description: string | null): NormalizedJob {
  return {
    sourceKey: 'smartjobs-qld',
    sourceId: 'QLD/1',
    title: 'Registered Nurse',
    description,
    descriptionFormat: description === null ? null : 'TEXT',
    descriptionIsExcerpt: false,
    company: { name: 'Queensland Health' },
    location: null,
    employmentType: 'FULL_TIME',
    sourceContractType: null,
    remoteType: null,
    salary: null,
    applyUrl: 'https://smartjobs.qld.gov.au/jobs/QLD-1',
    sourceUrl: null,
    postedAt: null,
    category: null,
  };
}

describe('email removal', () => {
  it('removes an address and leaves the sentence readable', () => {
    const result = redactPersonalInformation(
      'For a confidential discussion contact jane.smith@health.qld.gov.au today.',
    );
    expect(result.text).toBe(
      'For a confidential discussion contact [email removed] today.',
    );
    expect(result.redactions).toHaveLength(1);
    expect(result.redactions[0]?.kind).toBe('EMAIL');
  });

  it('removes several addresses in one description', () => {
    const result = redactPersonalInformation('a@b.com and c.d@e.gov.au');
    expect(result.text).toBe('[email removed] and [email removed]');
    expect(result.redactions).toHaveLength(2);
  });

  it('never keeps the removed text in the record of the removal', () => {
    const result = redactPersonalInformation('write to jane@example.com');
    expect(JSON.stringify(result.redactions)).not.toContain('jane');
  });
});

describe('telephone removal', () => {
  const numbers = [
    '+61 7 3234 5678',
    '+61732345678',
    '(07) 3234 5678',
    '(07)32345678',
    '07 3234 5678',
    '0732345678',
    '0412 345 678',
    '0412-345-678',
    '1300 123 456',
    '1800123456',
    '13 12 34',
  ];

  for (const number of numbers) {
    it(`removes ${number}`, () => {
      const result = redactPersonalInformation(`Call ${number} for details.`);
      expect(result.text).toBe('Call [phone number removed] for details.');
      expect(result.redactions[0]?.kind).toBe('PHONE');
    });
  }

  it('treats an international number as one match rather than two', () => {
    const result = redactPersonalInformation('+61 7 3234 5678');
    expect(result.redactions).toHaveLength(1);
  });

  /*
   * Descriptions arrive as stripped HTML, so a number frequently runs straight
   * into whatever followed the closing tag. A live sweep found exactly this
   * shape surviving a word-boundary anchor, which is why the anchors are digit
   * boundaries now.
   */
  it('removes a number that runs into the following word', () => {
    const result = redactPersonalInformation(
      'Email: x@y.gov.au: 07 4885 7716Join a team',
    );
    expect(result.text).toContain('[phone number removed]Join a team');
  });

  it('removes a number that runs out of the preceding word', () => {
    const result = redactPersonalInformation('Phone0412 345 678 for details');
    expect(result.text).toBe('Phone[phone number removed] for details');
  });

  it('still refuses to take a fragment of a longer digit run', () => {
    // The boundary loosened for letters, not for digits. This is the case the
    // old anchor existed to prevent and it must keep working.
    for (const text of ['991300123456789', '00412345678', '0412345678901']) {
      expect(redactPersonalInformation(text).text).toBe(text);
    }
  });
});

describe('what the filter must not touch', () => {
  const untouched = [
    'Salary $95,000 to $105,000 a year',
    'Job ad reference QLD/164089/26',
    'ABN 12 345 678 901',
    'Closing date 30 September 2026',
    'Applications close 5pm on 12 10 2026',
    'Grade 7, level 4, 38 hours a fortnight',
    'The role supports 1,200 students across 15 campuses',
    'Position number 00123456 within the department',
  ];

  for (const text of untouched) {
    it(`leaves "${text}" alone`, () => {
      expect(redactPersonalInformation(text).text).toBe(text);
    });
  }

  it('leaves a description with nothing to remove strictly identical', () => {
    const text = 'An excellent opportunity for a registered nurse in Townsville.';
    const result = redactPersonalInformation(text);
    expect(result.text).toBe(text);
    expect(result.redactions).toEqual([]);
  });
});

describe('offsets survive multiple replacements', () => {
  it('replaces every match when the placeholders differ in length', () => {
    const result = redactPersonalInformation(
      'Call 0412 345 678 or email a@b.com, then call (07) 3234 5678.',
    );
    expect(result.text).toBe(
      'Call [phone number removed] or email [email removed], then call [phone number removed].',
    );
    expect(result.redactions).toHaveLength(3);
  });

  it('reports redactions in the order they appeared', () => {
    const result = redactPersonalInformation('a@b.com then 0412 345 678');
    expect(result.redactions.map((item) => item.kind)).toEqual(['EMAIL', 'PHONE']);
  });
});

describe('the module-level patterns hold no state between calls', () => {
  it('gives the same answer on a repeated call', () => {
    const text = 'Call 0412 345 678.';
    const first = redactPersonalInformation(text);
    const second = redactPersonalInformation(text);
    expect(second).toEqual(first);
  });
});

describe('containsPersonalInformation', () => {
  it('agrees with the redactor', () => {
    expect(containsPersonalInformation('call 1300 123 456')).toBe(true);
    expect(containsPersonalInformation('no contact details here')).toBe(false);
  });
});

describe('withoutPersonalInformation', () => {
  it('returns the same object when there is nothing to remove', () => {
    const original = job('A role in Cairns.');
    const result = withoutPersonalInformation(original);
    // Identity, not equality: an untouched listing must not be copied, because
    // the ingestion path uses the copy to decide whether anything happened.
    expect(result.job).toBe(original);
    expect(result.redactions).toEqual([]);
  });

  it('returns the same object when there is no description', () => {
    const original = job(null);
    expect(withoutPersonalInformation(original).job).toBe(original);
  });

  it('replaces only the description and leaves every other field intact', () => {
    const original = job('Contact Jane on 0412 345 678.');
    const result = withoutPersonalInformation(original);

    expect(result.job.description).toBe('Contact Jane on [phone number removed].');
    expect(result.job.title).toBe(original.title);
    expect(result.job.sourceId).toBe(original.sourceId);
    expect(result.job.applyUrl).toBe(original.applyUrl);
    expect(result.redactions).toHaveLength(1);
  });

  it('does not remove the contact person by name, and says so by behaviour', () => {
    // Names are out of scope and this asserts it deliberately, so that a later
    // change to the filter has to change this test and consider the question.
    const result = withoutPersonalInformation(job('Contact Jane Smith on 07 3234 5678.'));
    expect(result.job.description).toContain('Jane Smith');
  });
});
