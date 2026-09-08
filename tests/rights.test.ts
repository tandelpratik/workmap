import { describe, expect, it } from 'vitest';
import {
  contentRightFor,
  isProductionEligible,
  jobContentFields,
  mayRepublishField,
  withheldFields,
  type SourceDescriptor,
} from '@/domain/source';
import { findSourceDescriptor, sourceDescriptors } from '@/config/sources';

/**
 * The rights layer, asserted rather than reviewed.
 *
 * Everything here was previously recorded in a prose `notes` string, which is a
 * fine place to record why and a hopeless place to record what. These tests are
 * what stop a later edit from quietly opening a source the terms do not open.
 */

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

describe('the field gate fails closed', () => {
  it('treats a source with no rights matrix as permitting nothing', () => {
    const bare = descriptor();
    for (const field of jobContentFields) {
      expect(contentRightFor(bare, field)).toBe('NEEDS_VERIFICATION');
      expect(mayRepublishField(bare, field)).toBe(false);
    }
  });

  it('treats an unstated field as unverified even when others are stated', () => {
    const partial = descriptor({ jobContentRights: { title: 'PERMITTED' } });
    expect(mayRepublishField(partial, 'title')).toBe(true);
    expect(mayRepublishField(partial, 'description')).toBe(false);
    expect(contentRightFor(partial, 'description')).toBe('NEEDS_VERIFICATION');
  });

  it('publishes nothing for a permitted field on an ineligible source', () => {
    // The field-level grant is real and the source is still blocked. Both gates
    // apply, in that order, for the same reason the aggregate gate does.
    const blocked = descriptor({
      activation: 'BLOCKED',
      jobContentRights: { description: 'PERMITTED' },
    });
    expect(contentRightFor(blocked, 'description')).toBe('PERMITTED');
    expect(isProductionEligible(blocked)).toBe(false);
    expect(mayRepublishField(blocked, 'description')).toBe(false);
  });

  it('refuses a summary-only or withheld field', () => {
    const mixed = descriptor({
      jobContentRights: { description: 'SUMMARY_ONLY', contactDetails: 'WITHHELD' },
    });
    expect(mayRepublishField(mixed, 'description')).toBe(false);
    expect(mayRepublishField(mixed, 'contactDetails')).toBe(false);
  });

  it('lists every field it will not reproduce', () => {
    const one = descriptor({ jobContentRights: { title: 'PERMITTED' } });
    expect(withheldFields(one)).not.toContain('title');
    expect(withheldFields(one)).toContain('description');
    expect(withheldFields(one)).toHaveLength(jobContentFields.length - 1);
  });
});

describe('the live listing sources', () => {
  const live = ['adzuna', 'smartjobs-qld'] as const;

  for (const key of live) {
    describe(key, () => {
      const source = findSourceDescriptor(key);

      it('exists and is production eligible', () => {
        expect(source).toBeDefined();
        expect(isProductionEligible(source as SourceDescriptor)).toBe(true);
      });

      it('permits the factual metadata the product displays', () => {
        for (const field of [
          'title',
          'employer',
          'location',
          'salary',
          'employmentType',
          'postedAt',
        ] as const) {
          expect(mayRepublishField(source as SourceDescriptor, field)).toBe(true);
        }
      });

      it('never republishes contact details, logos or application instructions', () => {
        for (const field of [
          'contactDetails',
          'logo',
          'applicationInstructions',
        ] as const) {
          expect(contentRightFor(source as SourceDescriptor, field)).toBe('WITHHELD');
          expect(mayRepublishField(source as SourceDescriptor, field)).toBe(false);
        }
      });
    });
  }
});

describe('every source states its rights position', () => {
  for (const source of sourceDescriptors) {
    describe(source.key, () => {
      it('records a rights block', () => {
        expect(source.rights, `${source.key} has no rights block`).toBeDefined();
      });

      it('records how and how often the material is retrieved', () => {
        expect(source.retrieval).toBeDefined();
      });

      it('only claims established rights when the terms were read', () => {
        const rights = source.rights;
        if (rights === undefined) return;
        if (rights.status === 'ESTABLISHED') {
          // The synthetic source is the exception and is deliberately excluded:
          // this project generated the fixtures, so there are no terms to read.
          if (source.key !== 'synthetic') {
            expect(
              rights.lastVerified,
              `${source.key} claims established rights`,
            ).not.toBeNull();
          }
        } else {
          // Nothing unestablished may claim a permission.
          expect([
            rights.commercialUse,
            rights.redistribution,
            rights.adaptation,
          ]).not.toContain('PERMITTED');
        }
      });

      it('names a licence whenever rights are established', () => {
        if (source.rights?.status !== 'ESTABLISHED' || source.key === 'synthetic') return;
        expect(
          source.licence,
          `${source.key} claims rights with no licence`,
        ).toBeDefined();
        expect(source.licence?.url).toMatch(/^https:\/\//);
        expect(source.licence?.name.length).toBeGreaterThan(0);
        expect(source.licence?.holder.length).toBeGreaterThan(0);
      });

      it('publishes no derived aggregates unless adaptation is permitted', () => {
        if (!source.permitsDerivedAggregates) return;
        expect(
          source.rights?.adaptation,
          `${source.key} publishes aggregates without an adaptation right`,
        ).toBe('PERMITTED');
      });
    });
  }
});

describe('the sources the register records as refused', () => {
  it('keeps WA closed on every axis', () => {
    const wa = findSourceDescriptor('jobs-wa');
    expect(wa?.rights?.status).toBe('REFUSED');
    expect(wa?.rights?.commercialUse).toBe('PROHIBITED');
    expect(wa?.rights?.redistribution).toBe('PROHIBITED');
    expect(isProductionEligible(wa as SourceDescriptor)).toBe(false);
  });

  it('gives no blocked source a job content matrix', () => {
    for (const source of sourceDescriptors) {
      if (source.activation === 'ACTIVE' || source.activation === 'DEVELOPMENT_ONLY') {
        continue;
      }
      expect(
        source.jobContentRights,
        `${source.key} is not active but declares content rights`,
      ).toBeUndefined();
    }
  });
});

describe('Adzuna aggregates stay barred at the rights layer too', () => {
  it('records adaptation as prohibited, matching the aggregate gate', () => {
    const adzuna = findSourceDescriptor('adzuna');
    expect(adzuna?.permitsDerivedAggregates).toBe(false);
    expect(adzuna?.rights?.adaptation).toBe('PROHIBITED');
  });
});
