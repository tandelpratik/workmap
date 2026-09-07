import { Masthead } from '@/components/layout/masthead';
import { Dateline, Lede, PageBody, PageTitle } from '@/components/layout/plate';

/**
 * The not-found page.
 *
 * Next.js ships a serviceable default, and a reader who meets it has left the
 * product: no masthead, no navigation, none of the typography of the pages
 * either side of it. An address that no longer resolves is a normal event in
 * an atlas whose vocabulary changes with each ASGS edition and each monthly
 * release, so it is treated as a page rather than as an error screen.
 *
 * It says what is here rather than apologising, because the useful thing to
 * give someone who followed a stale link is the way back in.
 */

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <>
      <Masthead />

      <PageBody width="column">
        <Dateline>404</Dateline>
        <PageTitle>That page is not here</PageTitle>
        <Lede>
          The address did not resolve to anything this site publishes. It may have
          belonged to an earlier release, or to a code the current one does not carry.
        </Lede>

        <nav aria-label="Sections" className="border-rule-heavy mt-10 border-t-2">
          <ul>
            {[
              {
                href: '/map',
                title: 'The map',
                blurb:
                  'Online job advertisements by region, and by occupation within a region.',
              },
              {
                href: '/occupations',
                title: 'Occupations',
                blurb:
                  'Every occupation group the index reports, ranked by advertisements.',
              },
              {
                href: '/jobs',
                title: 'Job advertisements',
                blurb:
                  'Individual listings from the sources this site is licensed to republish.',
              },
            ].map((item) => (
              <li key={item.href} className="border-rule border-b">
                <a href={item.href} className="group block py-4">
                  <span className="text-ink group-hover:text-accent font-serif text-xl font-semibold underline-offset-4 group-hover:underline">
                    {item.title}
                  </span>
                  <span className="text-ink-muted mt-1 block text-sm leading-relaxed">
                    {item.blurb}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </PageBody>
    </>
  );
}
