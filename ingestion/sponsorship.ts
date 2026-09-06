import { Prisma } from '@/db/generated/client/client';
import { detectSponsorship } from '@/domain/sponsorship';
import type { SponsorshipSignal } from '@/domain/sponsorship';

/**
 * Sponsorship columns for a job row.
 *
 * One helper shared by every ingestion path, rather than the detection being
 * repeated per provider. A provider decides what text it has and whether that
 * text is the whole advertisement; what the words mean is the same question
 * everywhere, and answering it differently per source is how two listings with
 * identical wording end up labelled differently.
 */
export function sponsorshipFieldsFor(job: {
  readonly description: string | null;
  readonly descriptionIsExcerpt: boolean;
}): {
  readonly sponsorshipSignal: SponsorshipSignal;
  readonly sponsorshipEvidence: Prisma.InputJsonValue | typeof Prisma.DbNull;
} {
  const finding = detectSponsorship({
    text: job.description,
    isExcerpt: job.descriptionIsExcerpt,
  });

  return {
    sponsorshipSignal: finding.signal,
    // Written as SQL NULL when there is nothing to show, so the absence of
    // evidence is never stored as an empty piece of evidence. Copied into
    // plain objects because the domain's readonly arrays are not a JSON input
    // type, and because what is stored should be exactly the two fields the
    // reader is shown.
    sponsorshipEvidence:
      finding.evidence.length > 0
        ? finding.evidence.map((item) => ({
            phrase: item.phrase,
            context: item.context,
          }))
        : Prisma.DbNull,
  };
}
