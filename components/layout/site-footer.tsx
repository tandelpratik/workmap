import Link from 'next/link';
import { brand } from '@/config/brand';
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
 * over a "coming soon" is worse than no heading.
 */

interface FooterLink {
  readonly href: string;
  readonly label: string;
}

const explore: readonly FooterLink[] = [
  { href: '/map', label: 'Map' },
  { href: '/locations', label: 'Locations' },
  { href: '/occupations', label: 'Occupations' },
  { href: '/jobs', label: 'Jobs' },
  { href: '/insights', label: 'Insights' },
];

const data: readonly FooterLink[] = [
  { href: '/methodology', label: 'Methodology' },
  { href: '/data-and-licensing', label: 'Data and licensing' },
];

function Column({ title, links }: { title: string; links: readonly FooterLink[] }) {
  return (
    <div>
      <Label as="h3">{title}</Label>
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

        <div className="border-rule mt-10 border-t pt-5">
          <p className="text-ink-faint max-w-measure text-xs leading-relaxed">
            {brand.productName} is an independent project. It is not affiliated with,
            endorsed by, or sponsored by Jobs and Skills Australia, the Australian Bureau
            of Statistics, the State of Queensland, or any other organisation whose data
            it draws on. Figures count job advertisements, which are not the same as
            vacancies.
          </p>
        </div>
      </div>
    </footer>
  );
}
