import { describe, expect, it } from 'vitest';
import {
  canPublishDerivedAggregates,
  complianceStatuses,
  ineligibilityReason,
  isProductionEligible,
  isUsable,
  sourceActivations,
  sourceKinds,
  type SourceDescriptor,
} from '@/domain/source';
import { findSourceDescriptor, sourceDescriptors } from '@/config/sources';
import * as prismaEnums from '@/db/generated/client/enums';

function descriptor(overrides: Partial<SourceDescriptor> = {}): SourceDescriptor {
  return {
    key: 'test',
    displayName: 'Test',
    kind: 'JOB_LISTING',
    activation: 'ACTIVE',
    complianceStatus: 'VERIFIED',
    attributionRequired: false,
    permitsDerivedAggregates: true,
    ...overrides,
  };
}

describe('domain and persistence enums agree', () => {
  // The domain deliberately does not import Prisma's enums, because that would
  // couple it to the persistence layer (ADR-0001). This test is what stops the
  // duplication drifting.
  const cases: ReadonlyArray<[string, readonly string[], Record<string, string>]> = [
    ['SourceKind', sourceKinds, prismaEnums.SourceKind],
    ['SourceActivation', sourceActivations, prismaEnums.SourceActivation],
    ['ComplianceStatus', complianceStatuses, prismaEnums.ComplianceStatus],
  ];

  for (const [name, domainValues, prismaEnum] of cases) {
    it(`${name} matches the database enum`, () => {
      expect([...domainValues].sort()).toEqual(Object.values(prismaEnum).sort());
    });
  }
});

describe('production eligibility gate (ADR-0009)', () => {
  it('requires both axes', () => {
    expect(isProductionEligible(descriptor())).toBe(true);
    expect(isProductionEligible(descriptor({ activation: 'BLOCKED' }))).toBe(false);
    expect(isProductionEligible(descriptor({ complianceStatus: 'UNVERIFIED' }))).toBe(
      false,
    );
  });

  it('never lets a development source into production', () => {
    const synthetic = descriptor({
      activation: 'DEVELOPMENT_ONLY',
      complianceStatus: 'VERIFIED',
    });
    expect(isProductionEligible(synthetic)).toBe(false);
    expect(isUsable(synthetic, { isProduction: true })).toBe(false);
    expect(isUsable(synthetic, { isProduction: false })).toBe(true);
  });

  it('allows an unverified source outside production only', () => {
    const pending = descriptor({ activation: 'ACTIVE', complianceStatus: 'UNVERIFIED' });
    expect(isUsable(pending, { isProduction: false })).toBe(true);
    expect(isUsable(pending, { isProduction: true })).toBe(false);
  });

  it('explains why a source is not eligible', () => {
    expect(ineligibilityReason(descriptor())).toBeNull();
    expect(ineligibilityReason(descriptor({ activation: 'BLOCKED' }))).toMatch(/BLOCKED/);
    expect(ineligibilityReason(descriptor({ complianceStatus: 'UNVERIFIED' }))).toMatch(
      /verified before production/,
    );
    expect(ineligibilityReason(descriptor({ activation: 'DEVELOPMENT_ONLY' }))).toMatch(
      /Never eligible in production/,
    );
  });
});

describe('source registry', () => {
  it('has unique keys', () => {
    const keys = sourceDescriptors.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('uses only valid enum members', () => {
    for (const d of sourceDescriptors) {
      expect(sourceKinds).toContain(d.kind);
      expect(sourceActivations).toContain(d.activation);
      expect(complianceStatuses).toContain(d.complianceStatus);
    }
  });

  it('marks exactly the sources whose licence has been verified as eligible', () => {
    // Deliberately an exact list rather than a count or a predicate. A source
    // becoming production eligible is a compliance decision, and must never
    // happen as a side effect of an unrelated edit. Adding a key here requires
    // a matching entry in docs/compliance/SOURCE_REGISTER.md with evidence.
    const eligible = sourceDescriptors.filter(isProductionEligible).map((d) => d.key);
    // smartjobs-qld joined on 2026-09-01. Its licence was verified first, its
    // adapter and ingestion were built and tested first, and activation was a
    // separate decision taken afterwards. That order is the point of the two
    // axes existing.
    expect(eligible).toEqual(['jsa-ivi', 'abs-asgs', 'adzuna', 'smartjobs-qld']);
  });

  it('gives every verified source that requires attribution its exact wording', () => {
    // A licence that requires attribution is only satisfied if the wording is
    // actually available to render.
    for (const d of sourceDescriptors) {
      if (d.complianceStatus === 'VERIFIED' && d.attributionRequired) {
        expect(
          d.attributionText,
          `"${d.key}" is verified and requires attribution, so it must carry the wording`,
        ).toBeTruthy();
      }
    }
  });

  it('keeps the synthetic source development only', () => {
    const synthetic = findSourceDescriptor('synthetic');
    expect(synthetic?.activation).toBe('DEVELOPMENT_ONLY');
    expect(isUsable(synthetic!, { isProduction: true })).toBe(false);
  });

  it('records Adzuna as verified for listings and barred from aggregation', () => {
    // Access was obtained and the API terms were read on 2026-08-29. The two
    // axes now say different things, which is the point of having two: it is
    // fully usable for publishing advertisements, and its licence reserves
    // aggregate figures for a written agreement.
    const adzuna = findSourceDescriptor('adzuna');
    expect(adzuna?.activation).toBe('ACTIVE');
    expect(adzuna?.complianceStatus).toBe('VERIFIED');
    expect(adzuna?.permitsDerivedAggregates).toBe(false);
    // Their mandated wording, not a paraphrase of it.
    expect(adzuna?.attributionText).toBe('Jobs by Adzuna');
  });

  it('permits aggregation only where a licence actually allows it', () => {
    // Another exact list. A source becoming a permitted basis for published
    // statistics is a compliance decision, never an incidental edit.
    const aggregable = sourceDescriptors
      .filter(canPublishDerivedAggregates)
      .map((d) => d.key);
    // smartjobs-qld is CC BY, so counts derived from it may be published. What
    // the licence permits and what a figure means are still different
    // questions: these are Queensland Government vacancies, never the
    // Queensland labour market, and anything published from them has to say so.
    expect(aggregable).toEqual(['jsa-ivi', 'abs-asgs', 'smartjobs-qld']);
  });

  it('records Queensland as CC BY, live, and permitted for aggregation', () => {
    // The only live listing source whose licence permits both republication
    // and published statistics. Verified 2026-08-31 against the pages' own
    // AGLS metadata (DCTERMS.license, CC BY 3.0 AU) and
    // qld.gov.au/legal/copyright, then activated 2026-09-01 once the adapter
    // and ingestion had been built and tested.
    const qld = findSourceDescriptor('smartjobs-qld');
    expect(qld?.complianceStatus).toBe('VERIFIED');
    expect(qld?.activation).toBe('ACTIVE');
    expect(qld?.permitsDerivedAggregates).toBe(true);
    expect(isProductionEligible(qld!)).toBe(true);
    expect(canPublishDerivedAggregates(qld!)).toBe(true);
    // CC BY is satisfied only if the wording is actually there to render, and
    // the version has to be the one the pages declare, not the one the
    // whole-of-government policy page states by default.
    expect(qld?.attributionText).toContain('CC BY 3.0 AU');
    expect(qld?.attributionText).toContain('The State of Queensland');
  });

  it('records WA as prohibited, however good its data is', () => {
    // Its terms permit non-commercial use only. This product is commercial.
    // Pinned because WA is the most tempting source found by some distance:
    // 963 listings in a permitted sitemap and the cleanest geography anywhere.
    // A future edit must not quietly promote it on technical merit.
    const wa = findSourceDescriptor('jobs-wa');
    expect(wa?.complianceStatus).toBe('PROHIBITED');
    expect(wa?.activation).toBe('BLOCKED');
    expect(isProductionEligible(wa!)).toBe(false);
    expect(isUsable(wa!, { isProduction: true })).toBe(false);

    // Documents a gap rather than blessing it. Outside production isUsable
    // admits anything that is not DEVELOPMENT_ONLY, so a PROHIBITED source is
    // currently "usable" in development. Prohibited means do not integrate, in
    // any environment, so this is arguably wrong. Left as-is because changing
    // isUsable changes behaviour for every existing call site, which is a
    // decision to take deliberately rather than as a side effect of adding a
    // registry entry.
    expect(isUsable(wa!, { isProduction: false })).toBe(true);
  });

  it('keeps Workday restricted until an employer grants permission', () => {
    // The platform is open and every employer's terms read so far forbid
    // republication, so this may only ever move per employer, on written
    // consent. Restricted rather than prohibited records that difference.
    const workday = findSourceDescriptor('workday');
    expect(workday?.complianceStatus).toBe('RESTRICTED');
    expect(workday?.activation).toBe('BLOCKED');
    expect(workday?.permitsDerivedAggregates).toBe(false);
    expect(isProductionEligible(workday!)).toBe(false);
  });

  it('leaves every unproven candidate out of production', () => {
    // A blanket assertion over the candidates from the feasibility study, so
    // that adding one cannot make it eligible by accident. Promotion requires
    // an evidence entry in the register and a deliberate edit here.
    for (const key of ['pageup', 'iworkfor-nsw', 'careers-vic', 'jobs-wa', 'workday']) {
      const descriptor = findSourceDescriptor(key);
      expect(descriptor, `"${key}" should exist in the registry`).toBeDefined();
      expect(
        isProductionEligible(descriptor!),
        `"${key}" must not be production eligible`,
      ).toBe(false);
      expect(
        canPublishDerivedAggregates(descriptor!),
        `"${key}" must not be a basis for published statistics`,
      ).toBe(false);
    }
  });

  it('returns undefined for an unknown key', () => {
    expect(findSourceDescriptor('does-not-exist')).toBeUndefined();
  });
});
