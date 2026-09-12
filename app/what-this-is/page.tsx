import type { Metadata } from 'next';
import Link from 'next/link';
import { brand } from '@/config/brand';
import { legal } from '@/config/legal';
import { regionalAreas } from '@/config/regional-areas';
import { Masthead } from '@/components/layout/masthead';
import { Dateline, Lede, PageBody, PageTitle } from '@/components/layout/plate';
import { Prose, Section } from '@/components/layout/prose';
import { Label } from '@/components/ui/label';
import { link } from '@/components/ui/link';

/**
 * What the product is, and the boundary it does not cross.
 *
 * This page exists because of the name. A service called after sponsorship,
 * carrying a sponsorship filter, invites a reader to believe things this
 * product does not say: that an employer has been checked, that a visa is
 * likely, that somebody here knows their position. The footer disclaimer on
 * every page is the short answer to that. This is the long one, in one place, so
 * the short one has somewhere to point.
 *
 * It is not the privacy policy or the terms of use. Both of those need a legal
 * entity and a contact address, and neither exists yet; writing them around a
 * blank would be worse than not having them. This page makes no promise on
 * behalf of an entity: every sentence is either a description of what the
 * software does or a refusal, and both are true regardless of who operates it.
 *
 * Every legal string is read from config/legal.ts rather than written here, for
 * the reason the licence attribution is read from the source register: a
 * statement each page is free to reword is a statement that will eventually be
 * reworded into something else.
 */

export const metadata: Metadata = {
  title: 'What this is, and what it is not',
  description:
    'Regional job information and the sponsorship wording published in ' +
    'advertisements. Not migration advice, and not an assessment of anyone.',
};

export default function WhatThisIsPage() {
  return (
    <>
      <Masthead />

      <PageBody width="column">
        <header>
          <Dateline>About</Dateline>
          <PageTitle>What this is, and what it is not</PageTitle>
          <Lede>{legal.disclaimer}</Lede>
        </header>

        <Section id="what" kicker="Scope" title="What it does">
          <Prose>
            <p>
              It collects job advertisements from the sources it is licensed to republish,
              places each one against the published definition of a designated regional
              area, and reports what each advertisement says about visa sponsorship,
              quoted from the advertisement itself.
            </p>
            <p>
              The point of it is a single search. Regional work is advertised across
              hundreds of postcodes and a metropolitan-weighted job board buries it, so
              the alternative is searching those postcodes one at a time. Every listing
              links back to the original, because the original is authoritative and this
              is not.
            </p>
            <p>
              Sponsorship is a filter over what advertisements say, not the purpose of the
              site. Most advertisements say nothing about it, and every regional listing
              is kept whether or not sponsorship is mentioned.
            </p>
          </Prose>
        </Section>

        <Section id="not" kicker="Boundary" title="What it does not do">
          <Prose>
            <p>
              This boundary is the product&rsquo;s basis for existing rather than a
              caution attached to it. Reporting what a third party published, and linking
              to it, is a different act from advising somebody about their own migration
              position. The second is regulated and is reserved to registered migration
              agents and legal practitioners. This site does the first and not the second.
            </p>
          </Prose>

          <ul className="mt-6 space-y-3">
            {legal.exclusions.map((exclusion) => (
              <li key={exclusion} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="bg-state-blocked mt-2 inline-block h-1 w-3 shrink-0"
                />
                <span className="text-ink-muted max-w-measure text-sm leading-relaxed">
                  {exclusion}
                </span>
              </li>
            ))}
          </ul>

          <Prose>
            <p className="mt-6">
              For anything in that list, the{' '}
              <a
                href={legal.officialVisaInformation.url}
                target="_blank"
                rel="noopener noreferrer"
                className={link()}
              >
                {legal.officialVisaInformation.label}
              </a>{' '}
              publishes the official information, and a registered migration agent can
              advise on an individual position. This site does neither and will not.
            </p>
          </Prose>
        </Section>

        <Section id="labels" kicker="Method" title="What the labels mean">
          <Prose>
            <p>
              Two labels sit on every listing and both describe a document rather than a
              business or a reader.
            </p>
            <p>
              The area label says which side of a published postcode table the job sits
              on. The definition is the{' '}
              <a
                href={regionalAreas.instrument.url}
                target="_blank"
                rel="noopener noreferrer"
                className={link()}
              >
                {regionalAreas.instrument.title}
              </a>
              , and each listing states the postcode and the rule that placed it so the
              lookup can be repeated. An advertisement that cannot be placed says so
              rather than being guessed at, and is never reported as being outside the
              definition.
            </p>
            <p>
              The sponsorship label reports wording, with the advertisement&rsquo;s own
              sentence printed beneath it. A label without that sentence would be our
              characterisation of an employer; a label beside it is a quotation anyone can
              check against the original. Where wording could be read at more than one
              strength, the weaker reading is published.
            </p>
            <p>
              <Link href="/methodology" prefetch={false} className={link()}>
                The methodology
              </Link>{' '}
              sets out both in full, and{' '}
              <Link href="/data-and-licensing" prefetch={false} className={link()}>
                data and licensing
              </Link>{' '}
              names every source and the terms it is carried under.
            </p>
          </Prose>
        </Section>

        <Section id="independence" kicker="Independence" title="Who this is">
          <Prose>
            <p>{legal.notGovernment}</p>
            <p>{legal.notAffiliatedWithSources}</p>
            <p>
              {brand.productName} is a working name. Where this site carries labour market
              figures they count job advertisements, which are not the same as vacancies,
              and the{' '}
              <Link href="/methodology" prefetch={false} className={link()}>
                methodology
              </Link>{' '}
              says what each figure can and cannot support.
            </p>
          </Prose>
        </Section>

        <footer className="border-rule-strong mt-14 border-t pt-5">
          <Label as="h2">A note on this page</Label>
          <p className="text-ink-faint max-w-measure mt-3 text-sm leading-relaxed">
            {/*
              Said plainly rather than left for a reader to notice. A page about
              what a product is not should not itself overstate what it is.
            */}
            This is not a privacy policy or a set of terms of use. Both require a legal
            entity and a contact address, and neither has been established yet, so neither
            document exists. Nothing on this page is a promise made on behalf of an
            entity: every sentence is a description of what the software does or a
            statement of what it refuses to do.
          </p>
        </footer>
      </PageBody>
    </>
  );
}
