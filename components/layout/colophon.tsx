import { brand } from '@/config/brand';
import { legal } from '@/config/legal';
import { findSourceDescriptor } from '@/config/sources';
import { DataAttribution, type SourceCitation } from '@/components/data/data-attribution';
import { Label } from '@/components/ui/label';

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
 * Each entry is rendered by `DataAttribution`, which owns the licence link and
 * the Adzuna special case. This component's remaining job is the frame around
 * them and the independence statement, which belongs on every page rather than
 * on one page a reader has to find.
 */

/**
 * Independence, stated wherever the data appears.
 *
 * This site draws on Commonwealth and Queensland Government material and says
 * so on every page. Saying whose material it is without saying that they had no
 * part in this leaves the reader to assume the obvious wrong thing, and the
 * assumption gets more plausible the more official the figures look.
 */
/*
 * Taken from config/legal.ts rather than written here.
 *
 * There were three hand-written copies of this sentence, in the colophon, the
 * methodology page and the licensing page, and every one of them enumerated
 * Jobs and Skills Australia, the Australian Bureau of Statistics and the State
 * of Queensland. Then the Federal Register of Legislation became a source and
 * all three sentences were silently incomplete: they named three publishers and
 * implied there were no others.
 *
 * So the wording no longer enumerates. It disclaims any organisation whose
 * material the product carries, and the colophon immediately below names the
 * ones this particular page drew on. A generic sentence beside a specific list
 * is both complete and incapable of falling behind the register.
 */
const INDEPENDENCE = legal.notAffiliatedWithSources;

export function Colophon({
  sources,
  children,
}: {
  /**
   * Every source whose data appears on this page, as a registry key or as a
   * citation naming the dataset and period the page is actually showing.
   */
  sources: readonly (string | SourceCitation)[];
  /** Anything the page must say for itself, above the attributions. */
  children?: React.ReactNode;
}) {
  const citations = sources
    .map((source): SourceCitation =>
      typeof source === 'string' ? { key: source } : source,
    )
    .filter((citation) => findSourceDescriptor(citation.key) !== undefined);

  return (
    <footer className="border-rule-strong mt-16 border-t pt-6">
      {children === undefined ? null : (
        <div className="text-ink-muted max-w-measure mb-8 space-y-3 text-xs leading-relaxed">
          {children}
        </div>
      )}

      {citations.length === 0 ? null : (
        <>
          <Label as="h2">Sources</Label>
          <dl className="mt-4 space-y-4">
            {citations.map((citation) => (
              <DataAttribution key={citation.key} citation={citation} />
            ))}
          </dl>
        </>
      )}

      <p className="text-ink-faint border-rule max-w-measure mt-8 border-t pt-4 text-xs leading-relaxed">
        {INDEPENDENCE}
      </p>

      <p className="text-ink-faint mt-3 text-xs">
        {brand.productName}. {brand.tagline}
      </p>
    </footer>
  );
}
