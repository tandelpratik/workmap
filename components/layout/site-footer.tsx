import Link from 'next/link';
import { brand } from '@/config/brand';
import { legal } from '@/config/legal';
import { Label } from '@/components/ui/label';

/**
 * The foot of the site, as distinct from the foot of a page.
 *
 * `Colophon` credits the sources a particular page drew on, and belongs to that
 * page. This is the other thing a footer does: it says what else is here. Until
 * now nothing did, so the methodology and the licensing position were pages
 * with no way in, and a reader who wanted to know where a number came from had
 * only the attribution line to go on.
 *
 * Rendered by the root layout rather than by each page. It has no per-page
 * state, unlike the masthead, which has to know which section is current and
 * therefore cannot live there.
 *
 * Columns that would be empty are absent rather than present and stubbed. There
 * is no Legal column yet because there are no legal pages yet, and a heading
 * over a "coming soon" is worse than no heading. The legal position itself does
 * not wait for that page: it is set out below the columns, on every page,
 * because the product's name makes it something a reader has to meet rather
 * than go looking for.
 */

interface FooterLink {
  readonly href: string;
  readonly label: string;
}

// Job search leads, because it is the product. The rest is the supporting
// labour market layer, in the order it is read: the map, then the two axes it
// is a map of, then the tools that compare them.
const explore: readonly FooterLink[] = [
  { href: '/jobs', label: 'Jobs' },
  { href: '/map', label: 'Map' },
  { href: '/locations', label: 'Locations' },
  { href: '/occupations', label: 'Occupations' },
  { href: '/insights', label: 'Insights' },
  { href: '/compare', label: 'Compare' },
  { href: '/explore', label: 'Where should I look' },
];

const data: readonly FooterLink[] = [
  { href: '/what-this-is', label: 'What this is, and is not' },
  { href: '/methodology', label: 'Methodology' },
  { href: '/data-and-licensing', label: 'Data and licensing' },
];

function Column({ title, links }: { title: string; links: readonly FooterLink[] }) {
  return (
    <div>
      {/*
        h2, not h3. The footer is a top-level region of every page, so its
        column headings sit directly under the page's h1. As h3 they made any
        page whose content had no h2 jump a level, which the not-found page did:
        h1 straight to h3, on the page a reader most often arrives at lost.
      */}
      <Label as="h2">{title}</Label>
      <ul className="mt-3 space-y-2">
        {links.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              prefetch={false}
              className="text-ink-muted hover:text-ink text-sm underline-offset-4 hover:underline"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-rule-strong print-hide mt-auto border-t">
      <div className="max-w-plate mx-auto px-5 py-12 sm:px-8">
        <div className="grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))]">
          <div>
            <p className="text-ink font-serif text-xl leading-none font-semibold tracking-tight">
              {brand.shortName}
            </p>
            <p className="text-ink-muted max-w-measure mt-3 text-sm leading-relaxed">
              {brand.description}
            </p>
          </div>

          <Column title="Explore" links={explore} />
          <Column title="Data" links={data} />
        </div>

        {/*
          The legal position, on every page because the root layout renders this
          footer on every page.

          The first paragraph is set a step stronger than the rest of the fine
          print. It is the statement the product is required to carry, and fine
          print that recedes into the ground is fine print nobody reads. The
          strings themselves come from config/legal.ts verbatim: this component
          decides where they sit, never how they are worded.
        */}
        <div className="border-rule mt-10 space-y-3 border-t pt-5">
          <p className="text-ink-muted max-w-measure text-sm leading-relaxed">
            {legal.disclaimer}{' '}
            <Link
              href="/what-this-is"
              prefetch={false}
              className="underline underline-offset-4"
            >
              What this is, and what it is not
            </Link>{' '}
            sets out the boundary in full, and the{' '}
            <a
              href={legal.officialVisaInformation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              {legal.officialVisaInformation.label}
            </a>{' '}
            publishes the official information on visas and sponsorship.
          </p>
          <p className="text-ink-faint max-w-measure text-xs leading-relaxed">
            {legal.notGovernment}
          </p>
          <p className="text-ink-faint max-w-measure text-xs leading-relaxed">
            {legal.notAffiliatedWithSources} Where this site carries labour market
            figures, they count job advertisements, which are not the same as vacancies.
          </p>
        </div>
      </div>
    </footer>
  );
}
