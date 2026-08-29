import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '@/lib/logger';

/**
 * The attribution Adzuna's terms require on every page showing their adverts.
 *
 * Their wording is prescriptive, so this component is too:
 *
 *   "An API user shall label each displayed advert with the phrase 'Jobs by
 *   Adzuna' at least 116 X 23 pixels in size, wherein the word 'Jobs' shall be
 *   hyperlinked to http://www.adzuna.co.uk or the relevant local domain and the
 *   word 'Adzuna' shall be the Adzuna Logo Image and shall also be hyperlinked."
 *
 * This is a licence condition, not a design choice, so it outranks the visual
 * restraint the design system otherwise asks for. It is placed once at the head
 * of the results list, which labels the displayed adverts collectively, rather
 * than repeated against each row where it would overwhelm the page.
 *
 * The logo asset is not in the repository. Adzuna's own site returns 403 to
 * automated requests, and their bot protection was not worked around, so the
 * file has to be downloaded by hand from https://www.adzuna.co.uk/press.html
 * and saved to public/adzuna-logo.png. Until it is, this renders the required
 * wording and links and records an error, because shipping publicly without
 * the logo would not satisfy the terms.
 *
 * The mandated phrase is the visible label, so it is not repeated in an
 * sr-only span: a screen reader would announce "Jobs by Adzuna" twice.
 */

const LOGO_PATH = '/adzuna-logo.png';
const REQUIRED_WIDTH = 116;
const REQUIRED_HEIGHT = 23;

/** The local domain the links must point at. */
const ADZUNA_HOME = 'https://www.adzuna.com.au/';

export function AdzunaAttribution() {
  const hasLogo = existsSync(join(process.cwd(), 'public', 'adzuna-logo.png'));

  if (!hasLogo) {
    logger.error('Adzuna logo asset is missing', {
      expected: 'public/adzuna-logo.png',
      obligation:
        'Their terms require the word "Adzuna" to be the Adzuna Logo Image on every page displaying their adverts.',
      source: 'https://www.adzuna.co.uk/press.html',
    });
  }

  return (
    <p
      className="flex items-center gap-1.5 text-sm"
      style={{ minHeight: REQUIRED_HEIGHT }}
    >
      <a
        href={ADZUNA_HOME}
        className="text-ink underline underline-offset-2"
        rel="noopener"
      >
        Jobs
      </a>
      <span className="text-ink-muted">by</span>
      <a href={ADZUNA_HOME} rel="noopener" aria-label="Adzuna">
        {hasLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={LOGO_PATH}
            alt="Adzuna"
            width={REQUIRED_WIDTH}
            height={REQUIRED_HEIGHT}
            style={{ height: REQUIRED_HEIGHT, width: 'auto' }}
          />
        ) : (
          <span className="text-ink font-semibold underline underline-offset-2">
            Adzuna
          </span>
        )}
      </a>
    </p>
  );
}

/**
 * The label Adzuna requires beside a salary they estimated.
 *
 * "An API user shall label every Jobsworth salary estimate that they publish
 * with an icon at least 20 x 20 pixels in size and the word 'Adzuna Jobsworth'.
 * Both elements will link to ... the salary predictor page ... with the
 * following mouseover text: 'Salary estimate powered by Adzuna Jobsworth'".
 *
 * This also satisfies ADR-0002 independently: an estimated figure must never be
 * presented as an employer's stated salary.
 */
export function JobsworthLabel() {
  return (
    <a
      href="https://www.adzuna.com.au/jobs/salary-predictor.html"
      title="Salary estimate powered by Adzuna Jobsworth"
      rel="noopener"
      className="text-ink-muted underline decoration-dotted underline-offset-2"
    >
      Adzuna Jobsworth estimate
    </a>
  );
}
