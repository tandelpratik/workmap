import { brand } from '@/config/brand';

/**
 * Development placeholder.
 *
 * The product has no data yet, so this page states what is being built and
 * where each source stands. It shows no figures, because there are none to
 * show and inventing them is forbidden.
 *
 * Replaced by the real homepage at milestone 09, when the map exists.
 */

interface SourcePosition {
  readonly label: string;
  readonly source: string;
  readonly state: 'available' | 'pending' | 'blocked';
  readonly note: string;
}

const positions: readonly SourcePosition[] = [
  {
    label: 'Market intelligence',
    source: 'Jobs and Skills Australia, Internet Vacancy Index',
    state: 'pending',
    note: 'Designated the active source. Licence terms not yet verified.',
  },
  {
    label: 'Geography',
    source: 'ABS Australian Statistical Geography Standard',
    state: 'pending',
    note: 'State and SA4 boundaries. Licence terms not yet verified.',
  },
  {
    label: 'Job advertisements',
    source: 'No authorized provider',
    state: 'blocked',
    note: 'Onboarding is unavailable. No listings are shown until access is granted.',
  },
];

const stateLabel: Record<SourcePosition['state'], string> = {
  available: 'Active',
  pending: 'Pending verification',
  blocked: 'Unavailable',
};

const stateClass: Record<SourcePosition['state'], string> = {
  available: 'text-state-available',
  pending: 'text-state-pending',
  blocked: 'text-state-blocked',
};

export default function HomePage() {
  return (
    <main id="main" className="mx-auto max-w-3xl px-6 py-16 sm:py-24">
      <header>
        <p className="text-ink-faint font-mono text-xs tracking-widest uppercase">
          In development
        </p>
        <h1 className="text-ink mt-6 font-serif text-5xl leading-tight font-semibold sm:text-6xl">
          {brand.productName}
        </h1>
        <p className="text-ink-muted mt-3 font-serif text-2xl italic">{brand.tagline}</p>
      </header>

      <hr className="border-rule mt-10 border-0 border-t" />

      <section className="max-w-measure mt-10">
        <h2 className="sr-only">About</h2>
        <p className="text-ink text-base leading-relaxed">
          An atlas of Australian labour market demand. Where work is concentrated, which
          occupations are sought, which skills are asked for, and how that changes over
          time.
        </p>
        <p className="text-ink-muted mt-4 text-base leading-relaxed">
          Every figure will name its source, its reference period and its geographic
          level. Nothing is estimated into existence, and measurements of advertised
          demand are never presented as counts of all vacancies.
        </p>
      </section>

      <section className="mt-14">
        <h2 className="text-ink-faint font-mono text-xs tracking-widest uppercase">
          Current position
        </h2>

        <dl className="border-rule mt-6 border-t">
          {positions.map((position) => (
            <div
              key={position.label}
              className="border-rule grid grid-cols-1 gap-1 border-b py-5 sm:grid-cols-[11rem_1fr] sm:gap-6"
            >
              <dt className="text-ink text-sm font-medium">{position.label}</dt>
              <dd>
                <p className="text-ink text-sm">
                  {position.source}
                  <span className="text-ink-faint"> &middot; </span>
                  <span className={`text-sm font-medium ${stateClass[position.state]}`}>
                    {stateLabel[position.state]}
                  </span>
                </p>
                <p className="text-ink-muted mt-1 text-sm leading-relaxed">
                  {position.note}
                </p>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="max-w-measure mt-14">
        <p className="text-ink-faint text-sm leading-relaxed">
          The Internet Vacancy Index measures job advertisements published online on a
          defined set of job boards. It is an indicator of advertised demand, not a count
          of all Australian vacancies.
        </p>
      </footer>
    </main>
  );
}
