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
    expect(eligible).toEqual(['jsa-ivi', 'abs-asgs', 'adzuna']);
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
    expect(aggregable).toEqual(['jsa-ivi', 'abs-asgs']);
  });

  it('returns undefined for an unknown key', () => {
    expect(findSourceDescriptor('does-not-exist')).toBeUndefined();
  });
});
