import { describe, expect, it } from 'vitest';
import { extractSkills } from '@/skills/extract';
import { skillVocabulary, skillsByNormalizedName } from '@/skills/vocabulary';
import { skillKinds, skillKindLabel, type SkillKind } from '@/domain/skill';
import { SkillKind as PrismaSkillKind } from '@/db/generated/client/client';

/**
 * Skill extraction.
 *
 * The strings marked REAL are advertisement text already held in the database
 * rather than invented examples, and most of them are here because they were
 * extracted wrongly at some point while this was being written. That is the
 * useful kind of test case: every one of them is a mistake the vocabulary made
 * against real listings before it was tightened.
 *
 * The false-positive tests matter more than the positive ones. Whether "AHPRA"
 * finds an AHPRA requirement was never in doubt. Whether "excel" finds a
 * spreadsheet, whether "working with children" finds a Blue Card, and whether
 * ServiceNow's own job advertisement requires ServiceNow are the questions that
 * decide if this feature helps a reader or quietly hides jobs from them.
 */

function namesFound(input: {
  title?: string;
  description?: string | null;
  companyName?: string | null;
}): string[] {
  return extractSkills({
    title: input.title ?? 'Officer',
    description: input.description ?? null,
    companyName: input.companyName ?? null,
  }).map((match) => match.skill.name);
}

describe('the vocabulary itself', () => {
  it('has a unique stable key for every entry', () => {
    const keys = skillVocabulary.map((skill) => skill.normalizedName);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('has a unique display name for every entry', () => {
    const names = skillVocabulary.map((skill) => skill.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('gives every entry at least one pattern', () => {
    for (const skill of skillVocabulary) {
      expect(skill.patterns.length, skill.normalizedName).toBeGreaterThan(0);
    }
  });

  it('authors every pattern without the global flag', () => {
    // The extractor recompiles each pattern with `g` rather than mutating a
    // shared lastIndex. A pattern authored with it would make extraction
    // depend on how many times it had already run.
    for (const skill of skillVocabulary) {
      for (const pattern of skill.patterns) {
        expect(pattern.flags, `${skill.normalizedName}: ${pattern.source}`).not.toContain(
          'g',
        );
      }
    }
  });

  it('uses only kinds the schema declares', () => {
    for (const skill of skillVocabulary) {
      expect(skillKinds).toContain(skill.kind);
    }
  });

  it('is indexed by its own keys', () => {
    for (const skill of skillVocabulary) {
      expect(skillsByNormalizedName.get(skill.normalizedName)).toBe(skill);
    }
    expect(skillsByNormalizedName.size).toBe(skillVocabulary.length);
  });
});

describe('kinds', () => {
  it('agrees with the database enum, both ways', () => {
    // The vocabulary declares its own kinds so that skills/ need not import
    // from db/. That freedom is only safe while the two lists agree.
    expect([...skillKinds].sort()).toEqual(Object.values(PrismaSkillKind).sort());
  });

  it('words every kind for a reader', () => {
    for (const kind of skillKinds) {
      expect(skillKindLabel(kind as SkillKind)).not.toBe('');
    }
  });
});

describe('certifications', () => {
  it('finds an AHPRA requirement', () => {
    // REAL
    expect(
      namesFound({
        description: 'Must have current AHPRA registration as a medical practitioner.',
      }),
    ).toContain('AHPRA registration');
  });

  it('finds AHPRA written out in full', () => {
    expect(
      namesFound({
        description:
          'Registration with the Australian Health Practitioner Regulation Agency.',
      }),
    ).toContain('AHPRA registration');
  });

  it('reads a Blue Card and a Working with Children Check as one credential', () => {
    // REAL, both of them. Queensland uses the two names interchangeably and a
    // reader filtering on either must get both.
    const blueCard = namesFound({
      description:
        'It is mandatory to hold a Blue Card administered by the Queensland Public Safety Business Agency',
    });
    const check = namesFound({
      description:
        'Evidence that you hold a current Queensland Working with children check (Blue Card)',
    });
    expect(blueCard).toContain('Working with Children Check');
    expect(check).toContain('Working with Children Check');
  });

  it('does not read a description of the work as a credential', () => {
    // REAL, and the false positive that forced the bare phrase out of the
    // vocabulary. This advertisement never mentions the card.
    expect(
      namesFound({
        title: 'Casual Educators Wanted!',
        description:
          'Are you passionate about working with children and looking for flexible work in early childhood education?',
      }),
    ).not.toContain('Working with Children Check');
  });

  it('still finds the card when the source has fused the words around it', () => {
    // REAL. The source ran a list item into the next word, leaving
    // "Blue Cardare", which defeats a word-boundary match on "card".
    expect(
      namesFound({
        description:
          'hold a valid QLD Working with Children Blue Cardare a person who resides in Australia',
      }),
    ).toContain('Working with Children Check');
  });

  it("finds a driver's licence however it is spelled", () => {
    // REAL, all three.
    for (const text of [
      "A current C class driver's licence and a commitment to safe service delivery.",
      'Drivers licence required for trolley collection',
      'This position requires the applicant to possess an appropriate license to operate a Class C (car) motor vehicle.',
    ]) {
      expect(namesFound({ description: text }), text).toContain("Driver's licence");
    }
  });

  it('keeps the Yellow Card separate from the Blue Card', () => {
    // Different screening, different regime. Merging them would tell a reader
    // they hold a credential they do not.
    const found = namesFound({ description: 'A current Yellow Card is required.' });
    expect(found).toContain('Yellow Card');
    expect(found).not.toContain('Working with Children Check');
  });
});

describe('tools', () => {
  it('finds Excel named in full', () => {
    // REAL
    expect(
      namesFound({
        description:
          'Use systems such as SAP, 3PCM and Microsoft Excel to support financial and procurement management activities.',
      }),
    ).toContain('Microsoft Excel');
  });

  it('finds a bare Excel beside another Office program', () => {
    // REAL. Without the neighbouring word this is indistinguishable from the
    // verb, so the context is what makes the match safe.
    expect(
      namesFound({
        description:
          'Confidently navigate databases, MS Word and Excel, with an eye for accurate data.',
      }),
    ).toContain('Microsoft Excel');
  });

  it('does not read the verb "excel" as the spreadsheet', () => {
    // REAL, and the reason the bare word is not a pattern. 47 listings contain
    // the word and only 21 mean the program.
    expect(
      namesFound({
        description:
          "We're looking for professionals who excel at critical thinking, are proactive and thrive in environments where no two days are the same.",
      }),
    ).not.toContain('Microsoft Excel');
  });

  it('does not require lower-case "sap"', () => {
    // A corpus with outdoor and agricultural work in it. SAP is matched
    // case-sensitively for this reason.
    expect(
      namesFound({ description: 'Removing sap and debris from harvested timber.' }),
    ).not.toContain('SAP');
  });

  it('finds ServiceNow required by an employer that is not ServiceNow', () => {
    // REAL. Eleven of the twelve listings mentioning it are like this one.
    expect(
      namesFound({
        companyName: 'Queensland Health',
        description:
          'Experience optimising and improving ITSM platforms such as ServiceNow or similar solutions.',
      }),
    ).toContain('ServiceNow');
  });

  it('does not attach a tool to the advertiser that is named after it', () => {
    // REAL, and the twelfth listing. ServiceNow, Inc. describing itself is not
    // a role requiring ServiceNow.
    expect(
      namesFound({
        companyName: 'ServiceNow, Inc.',
        title: 'Advisory Solution Consultant',
        description:
          'Today, ServiceNow is the AI control tower for business reinvention.',
      }),
    ).not.toContain('ServiceNow');
  });

  it('suppresses the employer name only for that employer', () => {
    const theirs = namesFound({
      companyName: 'Salesforce',
      description: 'About Salesforce.',
    });
    const somebodyElses = namesFound({
      companyName: 'Queensland Health',
      description: 'Experience administering Salesforce.',
    });
    expect(theirs).not.toContain('Salesforce');
    expect(somebodyElses).toContain('Salesforce');
  });

  it('does not suppress a tool because the employer name merely contains the word', () => {
    // Word-sequence containment, not substring. An employer called
    // "Microsoft Partner Recruitment" is not Microsoft.
    expect(
      namesFound({
        companyName: 'Azure Recruitment Partners',
        description: 'Experience with Microsoft Azure.',
      }),
    ).toContain('Microsoft Azure');
  });
});

describe('reading an advertisement', () => {
  it('attaches nothing to text that names no skill', () => {
    expect(
      namesFound({
        title: 'Retail Assistant',
        description: 'Greet customers, keep the floor tidy and process sales.',
      }),
    ).toEqual([]);
  });

  it('handles an absent description', () => {
    expect(() => namesFound({ description: null })).not.toThrow();
  });

  it('reads the title as well as the body', () => {
    expect(
      namesFound({ title: 'Forklift Operator', description: 'Warehouse work.' }),
    ).toContain('Forklift licence');
  });

  it('does not let the title run into the first sentence of the body', () => {
    // Title and body are joined with a full stop so a quotation cannot span
    // both and present two unrelated fragments as one sentence.
    const [match] = extractSkills({
      title: 'Registered Nurse',
      description: 'Current AHPRA registration is essential.',
      companyName: null,
    });
    expect(match?.sentence).not.toContain('Registered Nurse');
  });

  it('attaches a skill once however often it is mentioned', () => {
    const matches = extractSkills({
      title: 'Analyst',
      description: 'SQL is required. Strong SQL skills. Did we mention SQL?',
      companyName: null,
    });
    expect(matches.filter((match) => match.skill.name === 'SQL')).toHaveLength(1);
  });

  it('quotes the earliest occurrence, not the first pattern to match', () => {
    // "Blue Card" appears before "working with children check", and the
    // quotation a reader sees must follow the text rather than the order the
    // aliases happen to be listed in.
    const [match] = extractSkills({
      title: 'Support Worker',
      description: 'A Blue Card is required. A working with children check is required.',
      companyName: null,
    });
    expect(match?.matchedText).toBe('Blue Card');
  });

  it('carries the sentence the words sit in', () => {
    const [match] = extractSkills({
      title: 'Nurse',
      description: 'We work hard. Current AHPRA registration is essential. Apply now.',
      companyName: null,
    });
    expect(match?.sentence).toBe('Current AHPRA registration is essential.');
  });

  it('reads through markup and entities', () => {
    // Both are how the sources actually deliver text.
    expect(
      namesFound({ description: '<li>Current <b>AHPRA</b>&#160;registration</li>' }),
    ).toContain('AHPRA registration');
  });

  it('never invents a skill the text does not mention', () => {
    // The rule the module exists to enforce. A nursing title alone is not
    // evidence of an AHPRA requirement, however likely it is in practice.
    expect(
      namesFound({
        title: 'Registered Nurse - Emergency Department',
        description: 'Join our friendly team on a permanent full-time basis.',
      }),
    ).toEqual([]);
  });

  it('reports the matched words exactly as the advertisement wrote them', () => {
    const [match] = extractSkills({
      title: 'Driver',
      description: 'A current DRIVERS LICENCE is required.',
      companyName: null,
    });
    expect(match?.matchedText).toBe('DRIVERS LICENCE');
  });
});
