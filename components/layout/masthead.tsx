import Link from 'next/link';
import { brand } from '@/config/brand';

/**
 * The masthead and the section rail.
 *
 * A publication's masthead rather than an application's toolbar: a rule at the
 * head of the page, the name set in the display serif, the tagline beside it,
 * and the current release stated on the right. That dateline is the point. A
 * research tool has to say what it is showing and from when before a reader
 * can trust a single figure on the page, and stating it once at the top is
 * cheaper than repeating it in every paragraph.
 *
 * Each page renders it and names its own section, rather than the root layout
 * rendering it blind. A layout cannot know which page it is wrapping, so
 * marking the current item there would need the pathname, which would need a
 * client component, which would put JavaScript on every page for the sake of
 * one attribute. Marking the current page is an accessibility requirement, so
 * the prop is the cheaper side of that trade.
 *
 * The rail scrolls sideways when it does not fit rather than folding into a
 * menu. A menu needs a script to open; a rail is three links that a narrow
 * screen can already reach.
 *
 * Prefetching is off. The routes are `force-dynamic`, so a prefetch is a real
 * server render and a real database query rather than a cached file. Free-tier
 * rules: do not spend a request on a navigation the reader has not asked for.
 *
 * The wordmark is typographic. `brand.assets.logoPath` is null until a logo
 * exists, and inventing one here is not this component's business (ADR-0007).
 */

export type Section = 'home' | 'map' | 'occupations' | 'jobs';

// Where, what, and the listings themselves. The order is the reading order:
// the map is the product's front door and the occupations are what it is a
// map of.
const sections: readonly { id: Section; href: string; label: string }[] = [
  { id: 'map', href: '/map', label: 'Map' },
  { id: 'occupations', href: '/occupations', label: 'Occupations' },
  { id: 'jobs', href: '/jobs', label: 'Jobs' },
];

export function Masthead({
  current,
  release,
}: {
  /** Omitted where no section is current, such as on the not-found page. */
  current?: Section;
  /**
   * What the page is showing and from when, in the reader's words. Null when
   * the page has no single release behind it, which is not the same as a
   * missing value and is therefore printed as nothing rather than as a dash.
   */
  release?: string | null;
}) {
  return (
    <header className="print-hide">
      {/*
        The rule at the head of the page. A publication signs itself this way,
        and it does the work a logo would otherwise be invented to do.
      */}
      <div className="bg-accent h-1" />

      <div className="border-rule border-b">
        <div className="max-w-plate mx-auto flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-4 sm:px-8">
          <Link
            href="/"
            prefetch={false}
            aria-label={`${brand.productName} home`}
            className="text-ink font-serif text-xl leading-none font-semibold tracking-tight"
          >
            {brand.shortName}
          </Link>

          <p className="text-ink-muted hidden text-sm sm:block">{brand.tagline}</p>

          {release == null ? null : (
            <p className="text-ink-faint text-label ml-auto font-mono uppercase">
              {release}
            </p>
          )}
        </div>
      </div>

      <div className="border-rule border-b">
        <nav aria-label="Sections" className="max-w-plate mx-auto px-5 sm:px-8">
          <ul className="rail flex gap-6 overflow-x-auto">
            {sections.map((section) => {
              const isCurrent = section.id === current;
              return (
                <li key={section.id} className="shrink-0">
                  {/*
                    The current section is marked three ways: aria-current for
                    assistive technology, weight for everyone, and a rule under
                    it for readers who resolve neither weight nor colour well.
                  */}
                  <Link
                    href={section.href}
                    prefetch={false}
                    aria-current={isCurrent ? 'page' : undefined}
                    className={
                      isCurrent
                        ? 'text-ink border-accent -mb-px inline-block border-b-2 py-3 text-sm font-medium'
                        : 'text-ink-muted hover:text-ink -mb-px inline-block border-b-2 border-transparent py-3 text-sm'
                    }
                  >
                    {section.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
