import { brand } from '@/config/brand';
import { findSourceDescriptor } from '@/config/sources';
import { AdzunaAttribution } from '@/components/adzuna-attribution';
import { Label } from '@/components/ui/label';
import { link } from '@/components/ui/link';

/**
 * The foot of every page: what the page was made from.
 *
 * Attribution used to be written into each page's footer by hand, and it had
 * already drifted. The jobs page named Adzuna as the origin of its listings
 * after a second licensed source went live, so a reader was told Queensland
 * Government listings came from Adzuna, and the CC BY notice that source's
 * licence requires appeared nowhere at all. Naming the sources a page draws on
 * and letting the registry supply the wording removes the class of mistake:
 * the licence text lives beside the licence status, in one place, verbatim.
 *
 * Adzuna is the exception that stays special-cased. Its terms mandate a
 * specific label with a logo and two links rather than a sentence, so the
 * component that satisfies them renders in place of the stored text.
 */

export function Colophon({
  sources,
  children,
}: {
  /** Registry keys for every source whose data appears on this page. */
  sources: readonly string[];
  /** Anything the page must say for itself, above the attributions. */
  children?: React.ReactNode;
}) {
  const descriptors = sources
    .map((key) => findSourceDescriptor(key))
    .filter((descriptor) => descriptor !== undefined);

  return (
    <footer className="border-rule-strong mt-16 border-t pt-6">
      {children === undefined ? null : (
        <div className="text-ink-muted max-w-measure mb-8 space-y-3 text-xs leading-relaxed">
          {children}
        </div>
      )}

      {descriptors.length === 0 ? null : (
        <>
          <Label as="h2">Sources</Label>
          <dl className="mt-4 space-y-3">
            {descriptors.map((descriptor) => (
              <div
                key={descriptor.key}
                className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-[13rem_minmax(0,1fr)]"
              >
                <dt className="text-ink text-xs font-medium">
                  {descriptor.homepageUrl === undefined ? (
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
                  )}
                </dt>
                <dd className="text-ink-faint text-xs leading-relaxed">
                  {descriptor.key === 'adzuna' ? (
                    <AdzunaAttribution />
                  ) : (
                    (descriptor.attributionText ?? descriptor.displayName)
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}

      <p className="text-ink-faint border-rule mt-8 border-t pt-4 text-xs">
        {brand.productName}. {brand.tagline}
      </p>
    </footer>
  );
}
