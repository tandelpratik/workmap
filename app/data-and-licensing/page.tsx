import type { Metadata } from 'next';
import Link from 'next/link';
import { brand } from '@/config/brand';
import { sourceDescriptors } from '@/config/sources';
import {
  contentRightFor,
  isProductionEligible,
  jobContentFields,
  type ContentRight,
  type JobContentField,
  type Permission,
  type SourceDescriptor,
} from '@/domain/source';
import { Masthead } from '@/components/layout/masthead';
import { Dateline, Lede, PageBody, PageTitle } from '@/components/layout/plate';
import {
  Contents,
  Definition,
  Definitions,
  Prose,
  Section,
} from '@/components/layout/prose';
import { Label } from '@/components/ui/label';
import { link } from '@/components/ui/link';

/**
 * Where every figure came from, and what we are allowed to do with it.
 *
 * Generated from the source registry rather than written out. That is the whole
 * design. A hand-written licensing page is a second copy of the registry, and a
 * second copy is a thing that drifts: the moment a licence is re-read or a
 * source changes state, the page and the truth part company, and the page is
 * the half a reader sees. Here they cannot differ, because there is only one of
 * them.
 *
 * It includes the sources this product does not use. A register that lists only
 * the permissions granted reads as a sales document; the refusals are what make
 * the grants credible, and "we read Western Australia's terms and they say no"
 * is a more useful sentence than any assurance.
 */

const SECTIONS = [
  { id: 'sources', title: 'Sources behind the figures' },
  { id: 'job-content', title: 'What is reproduced from an advertisement' },
  { id: 'calculations', title: 'Figures this site calculates itself' },
  { id: 'not-used', title: 'Sources this site does not use' },
  { id: 'reuse', title: 'Reusing what is published here' },
] as const;

export const metadata: Metadata = {
  title: 'Data and licensing',
  description:
    'Every dataset behind this site: its publisher, licence, what the licence permits, what it excludes, and when the terms were last read.',
};

const verifiedFormat = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

function formatVerified(iso: string | null): string | null {
  if (iso === null) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : verifiedFormat.format(date);
}

const permissionWords: Record<Permission, string> = {
  PERMITTED: 'Permitted',
  PROHIBITED: 'Not permitted',
  UNVERIFIED: 'Not established',
};

const contentRightWords: Record<ContentRight, string> = {
  PERMITTED: 'Reproduced',
  SUMMARY_ONLY: 'Summarised only',
  WITHHELD: 'Withheld',
  NEEDS_VERIFICATION: 'Not established',
};

const fieldWords: Record<JobContentField, string> = {
  title: 'Job title',
  employer: 'Employer',
  location: 'Location',
  salary: 'Salary',
  employmentType: 'Employment type',
  postedAt: 'Posting date',
  closingDate: 'Closing date',
  description: 'Advertisement text',
  benefits: 'Benefits',
  contactDetails: 'Contact details',
  logo: 'Employer logo',
  applicationInstructions: 'Application instructions',
};

const kindWords = {
  MARKET_INDICATOR: 'Labour market statistics',
  GEOGRAPHY: 'Boundaries',
  JOB_LISTING: 'Job advertisements',
  CLASSIFICATION: 'Classification',
} as const;

/** One source, in full. */
function SourceEntry({ descriptor }: { descriptor: SourceDescriptor }) {
  const rights = descriptor.rights;
  const verified = formatVerified(rights?.lastVerified ?? null);

  return (
    <div className="border-rule-heavy mt-10 border-t-2 pt-5">
      <h3 className="text-ink font-serif text-xl font-semibold">
        {descriptor.homepageUrl === undefined ? (
          descriptor.displayName
        ) : (
          <a
            href={descriptor.homepageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={link({ underline: 'hover' })}
          >
            {descriptor.displayName}
          </a>
        )}
      </h3>
      <p className="text-ink-faint text-label mt-1 font-mono uppercase">
        {kindWords[descriptor.kind]}
      </p>

      {descriptor.attributionText === undefined ? null : (
        <p className="text-ink-muted max-w-measure border-accent mt-4 border-l-2 py-1 pl-4 text-sm leading-relaxed">
          {descriptor.attributionText}
        </p>
      )}

      <Definitions>
        {descriptor.licence === undefined ? null : (
          <Definition term="Licence">
            <a
              href={descriptor.licence.url}
              target="_blank"
              rel="noopener noreferrer"
              className={link()}
            >
              {descriptor.licence.name}
            </a>
            . {descriptor.licence.holder}.
          </Definition>
        )}

        {rights === undefined ? null : (
          <>
            <Definition term="Commercial use">
              {permissionWords[rights.commercialUse]}
            </Definition>
            <Definition term="Redistribution">
              {permissionWords[rights.redistribution]}
            </Definition>
            <Definition term="Adaptation and aggregation">
              {permissionWords[rights.adaptation]}
              {rights.adaptation === 'PROHIBITED'
                ? '. No count, average or trend on this site is drawn from this source.'
                : ''}
            </Definition>
            {rights.exclusions.length === 0 ? null : (
              <Definition term="Outside the licence">
                {rights.exclusions.join('; ')}. None of this material is used.
              </Definition>
            )}
          </>
        )}

        {descriptor.retrieval === undefined ? null : (
          <Definition term="How it is retrieved">
            {
              {
                API: 'Through the publisher’s API',
                FILE_DOWNLOAD: 'Downloaded as a published file',
                CRAWL: 'Read from the publisher’s own website',
                MANUAL: 'Entered by hand',
                NONE: 'Not retrieved',
              }[descriptor.retrieval.method]
            }
            . {descriptor.retrieval.frequency}.
          </Definition>
        )}

        {verified === null ? null : (
          <Definition term="Terms last read">{verified}</Definition>
        )}

        {descriptor.termsUrl === undefined ? null : (
          <Definition term="Terms">
            <a
              href={descriptor.termsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={link()}
            >
              {descriptor.termsUrl}
            </a>
          </Definition>
        )}
      </Definitions>
    </div>
  );
}

export default function DataAndLicensingPage() {
  const inUse = sourceDescriptors.filter((descriptor) =>
    isProductionEligible(descriptor),
  );
  const notUsed = sourceDescriptors.filter(
    (descriptor) =>
      !isProductionEligible(descriptor) && descriptor.activation !== 'DEVELOPMENT_ONLY',
  );
  const listingSources = inUse.filter((descriptor) => descriptor.kind === 'JOB_LISTING');

  return (
    <>
      <Masthead />

      <PageBody width="column">
        <header>
          <Dateline>Data and licensing</Dateline>
          <PageTitle>Where these figures come from</PageTitle>
          <Lede>
            Every dataset behind this site, its licence, what that licence permits, what
            it excludes, and when the terms were last read.
          </Lede>
          <Contents items={SECTIONS} />
        </header>

        <Section id="sources" kicker="In use" title="Sources behind the figures">
          <Prose>
            <p>
              Four sources are in use. Each was checked against its published terms before
              anything from it was shown, and each entry below is generated from the same
              registry the software itself consults, so this page cannot describe a
              permission the code does not hold.
            </p>
            <p>
              A licence permitting reuse is not the same as a source permitting every kind
              of reuse. One of the four permits publishing individual advertisements and
              reserves aggregate figures, which is why no count on this site is drawn from
              it.
            </p>
          </Prose>

          {inUse.map((descriptor) => (
            <SourceEntry key={descriptor.key} descriptor={descriptor} />
          ))}
        </Section>

        <Section
          id="job-content"
          kicker="Advertisements"
          title="What is reproduced from an advertisement"
        >
          <Prose>
            <p>
              A licence covering a page does not cover every component printed on it. An
              employer&rsquo;s logo is that employer&rsquo;s trade mark rather than the
              job board&rsquo;s to pass on, a named contact with a direct line is personal
              information, and application instructions belong with the original
              advertisement, where they stay current.
            </p>
            <p>
              So the position is recorded field by field. Anything not established is not
              published: a source added without this matrix reproduces nothing rather than
              everything.
            </p>
          </Prose>

          <div className="scroll-x mt-6">
            <table className="w-full min-w-[26rem] border-collapse text-sm">
              <caption className="sr-only">
                What is reproduced from an advertisement, by source and field.
              </caption>
              <thead>
                <tr className="border-rule-heavy border-b-2">
                  <th
                    scope="col"
                    className="text-ink-faint text-label py-2 text-left font-normal uppercase"
                  >
                    Field
                  </th>
                  {listingSources.map((descriptor) => (
                    <th
                      key={descriptor.key}
                      scope="col"
                      className="text-ink-faint text-label py-2 pl-4 text-left font-normal uppercase"
                    >
                      {descriptor.displayName}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobContentFields.map((field) => {
                  const positions = listingSources.map((descriptor) =>
                    contentRightFor(descriptor, field),
                  );
                  // A field no live source has a position on is left out. It is
                  // not a gap in the table; it is a field nobody publishes.
                  if (positions.every((right) => right === 'NEEDS_VERIFICATION')) {
                    return null;
                  }
                  return (
                    <tr key={field} className="border-rule border-b">
                      <th scope="row" className="text-ink py-2.5 text-left font-normal">
                        {fieldWords[field]}
                      </th>
                      {positions.map((right, index) => (
                        <td
                          key={listingSources[index]?.key ?? index}
                          className={`py-2.5 pl-4 ${
                            right === 'PERMITTED'
                              ? 'text-ink-muted'
                              : 'text-ink font-medium'
                          }`}
                        >
                          {contentRightWords[right]}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Prose>
            <p className="mt-6">
              Contact details are removed before an advertisement is stored, not hidden
              when it is displayed. Minimising what is collected is stronger than
              minimising what is shown: a later export cannot reintroduce what a display
              filter would only have been covering up.
            </p>
            <p>
              That filter recognises email addresses and Australian telephone numbers. It
              does not attempt names or postal addresses, because a contact
              officer&rsquo;s name cannot be told apart by pattern from an
              employer&rsquo;s name or a suburb, and a workplace address is the location
              of the job. If an advertisement here carries something it should not,{' '}
              <Link href="/methodology#corrections" className={link()}>
                it can be corrected
              </Link>
              .
            </p>
          </Prose>
        </Section>

        <Section
          id="calculations"
          kicker="Ours"
          title="Figures this site calculates itself"
        >
          <Prose>
            <p>
              Some figures here were published by a source and reproduced unaltered.
              Others were calculated from them. The two are never presented as the same
              thing, and which is which is stated wherever a figure appears.
            </p>
          </Prose>

          <Definitions>
            <Definition term="Published, unaltered">
              Every regional figure. Jobs and Skills Australia publishes the Internet
              Vacancy Index by region, and those numbers are shown exactly as released.
            </Definition>
            <Definition term="Summed by this site">
              State and territory totals, national totals, and occupation figures within a
              state. These are sums over the regions the publisher reports on. Those
              regions cover Australia exactly once, so the sum is well defined, but it is
              arithmetic done here rather than a figure the publisher released.
            </Definition>
            <Definition term="Derived by this site">
              Change on the previous month, percentage change, share of the national
              total, and rank. All calculated from the two reference periods held.
            </Definition>
            <Definition term="Never calculated">
              Counts of job advertisements. The listing corpus mixes sources, and one of
              them reserves aggregate figures for a written licence, so listings are shown
              and never counted.
            </Definition>
          </Definitions>

          <Prose>
            <p className="mt-6">
              <Link href="/methodology" className={link()}>
                The methodology page
              </Link>{' '}
              sets out how each of these is worked out, and what the index does and does
              not measure.
            </p>
          </Prose>
        </Section>

        <Section
          id="not-used"
          kicker="Checked and refused"
          title="Sources this site does not use"
        >
          <Prose>
            <p>
              These were investigated and are not in use. They are listed because a
              register showing only the permissions granted reads as a sales document, and
              the refusals are what make the grants credible.
            </p>
            <p>
              A refusal here is a completed check, not an outstanding task. Where a source
              is marked as not established, the terms could not be reached or read at all,
              which is treated the same way as a refusal: nothing is taken from it.
            </p>
          </Prose>

          <Definitions>
            {notUsed.map((descriptor) => (
              <Definition
                key={descriptor.key}
                term={
                  descriptor.homepageUrl === undefined ? (
                    descriptor.displayName
                  ) : (
                    <a
                      href={descriptor.homepageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={link()}
                    >
                      {descriptor.displayName}
                    </a>
                  )
                }
              >
                {descriptor.rights?.status === 'REFUSED'
                  ? 'Terms read, and they do not permit this use.'
                  : 'Rights not established. Nothing is taken from it.'}{' '}
                {descriptor.rights === undefined
                  ? null
                  : `Commercial use: ${permissionWords[
                      descriptor.rights.commercialUse
                    ].toLowerCase()}. Redistribution: ${permissionWords[
                      descriptor.rights.redistribution
                    ].toLowerCase()}.`}
              </Definition>
            ))}
          </Definitions>
        </Section>

        <Section id="reuse" kicker="Downstream" title="Reusing what is published here">
          <Prose>
            <p>
              Figures on this site carry the obligations of the licence they came from.
              The two government datasets are Creative Commons licensed and may be reused
              with attribution, and the attribution wording each requires is reproduced
              above and in the footer of every page that draws on them.
            </p>
            <p>
              Where a figure was calculated here rather than published by a source, saying
              so is part of attributing it correctly. A state total presented as a Jobs
              and Skills Australia figure would misattribute arithmetic done on this site
              to a government agency that never published it.
            </p>
            <p>
              {brand.productName} is an independent project. It is not affiliated with,
              endorsed by, or sponsored by Jobs and Skills Australia, the Australian
              Bureau of Statistics, the State of Queensland, or any other organisation
              whose data it draws on.
            </p>
          </Prose>
        </Section>

        <footer className="border-rule-strong mt-14 border-t pt-5">
          <Label as="h2">A note on this page</Label>
          <p className="text-ink-faint max-w-measure mt-3 text-xs leading-relaxed">
            This page is generated from the same source registry the software consults
            before it displays anything, so it cannot describe a permission the system
            does not hold. The evidence behind each status, including what was read and
            when, is kept with the code.
          </p>
        </footer>
      </PageBody>
    </>
  );
}
