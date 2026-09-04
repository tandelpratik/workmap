import Link from 'next/link';
import { brand } from '@/config/brand';

/**
 * The masthead, and the only navigation the product has.
 *
 * Each page renders it and names its own section, rather than the root layout
 * rendering it blind. A layout cannot know which page it is wrapping, so
 * marking the current item there would need the pathname, which would need a
 * client component, which would put JavaScript on every page for the sake of
 * one attribute. Marking the current page is an accessibility requirement, so
 * the prop is the cheaper side of that trade.
 *
 * Prefetching is off. Both routes are `force-dynamic`, so a prefetch is a real
 * server render and a real database query rather than a cached file, and with
 * two pages there is little for it to hide. Free-tier rules: do not spend a
 * request on a navigation the reader has not asked for.
 *
 * The wordmark is typographic. `brand.assets.logoPath` is null until a logo
 * exists, and inventing one here is not this component's business (ADR-0007).
 */

export type Section = 'jobs' | 'map' | 'occupations';

// Where, what, and the listings themselves. The order is the reading order:
// the map is the product's front door and the occupations are what it is a
// map of.
const sections: readonly { id: Section; href: string; label: string }[] = [
  { id: 'jobs', href: '/', label: 'Jobs' },
  { id: 'map', href: '/map', label: 'Map' },
  { id: 'occupations', href: '/occupations', label: 'Occupations' },
];

export function SiteHeader({ current }: { current: Section }) {
  return (
    <header className="border-rule border-b">
      <div className="mx-auto flex max-w-5xl items-baseline justify-between gap-6 px-6 py-4">
        <Link
          href="/"
          prefetch={false}
          className="text-ink font-mono text-xs tracking-widest uppercase"
          aria-label={`${brand.productName} home`}
        >
          {brand.shortName}
        </Link>

        <nav aria-label="Sections">
          <ul className="flex gap-6 text-sm">
            {sections.map((section) => (
              <li key={section.id}>
                {/*
                  The current section is marked three ways: aria-current for
                  assistive technology, weight for everyone, and an underline
                  for readers who resolve neither weight nor colour well.
                */}
                <Link
                  href={section.href}
                  prefetch={false}
                  aria-current={section.id === current ? 'page' : undefined}
                  className={
                    section.id === current
                      ? 'text-ink font-medium underline underline-offset-4'
                      : 'text-ink-muted hover:text-ink underline-offset-4 hover:underline'
                  }
                >
                  {section.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
