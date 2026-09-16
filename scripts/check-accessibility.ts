/**
 * Structural accessibility checks against a running server.
 *
 *   npm run a11y:check                      against http://localhost:3000
 *   npm run a11y:check -- --base=http://…   against anything else
 *
 * These are the properties that can be decided by reading the markup, which is
 * a real subset and not the whole of accessibility. It cannot tell you whether
 * a heading is a good heading, whether an alternative conveys what the graphic
 * conveys, or whether the page is usable with a screen reader. It can tell you
 * that a page jumped from h1 to h3, which is the defect it was written to catch
 * and which had been sitting on the jobs page unnoticed.
 *
 * Run against a built server rather than the dev one. Both should pass, and the
 * built output is the thing readers get.
 *
 * Exits non-zero on any finding, so it belongs in the same gate as the data
 * quality checks.
 */

const DEFAULT_BASE = 'http://localhost:3000';

/**
 * Every route a reader can reach, plus one that does not exist.
 *
 * The 404 is checked deliberately: it is a page like any other, it is the one a
 * reader meets when a link goes stale, and it is the page most likely to be
 * forgotten by an audit that lists the routes it knows about.
 */
const ROUTES = [
  '/',
  '/map',
  '/map?state=3',
  '/locations',
  '/locations/queensland',
  '/occupations',
  '/occupations/24',
  '/jobs',
  '/jobs?where=QLD&type=FULL_TIME',
  // A search that returns listings carrying skill lines, so the markup those
  // produce is audited rather than only the markup of a listing without any.
  '/jobs?skill=ahpra-registration&area=all',
  '/insights',
  '/compare',
  '/compare?placeA=queensland&placeB=victoria',
  '/explore',
  '/explore?occupation=26',
  '/methodology',
  '/data-and-licensing',
  '/what-this-is',
  '/this-route-does-not-exist',
] as const;

interface Finding {
  readonly route: string;
  readonly problem: string;
}

/** Comments hold markup that is never rendered, so they are removed first. */
function withoutComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

function textOf(html: string): string {
  return html.replace(/<[^>]+>/g, '').trim();
}

function check(route: string, raw: string): Finding[] {
  const findings: Finding[] = [];
  const html = withoutComments(raw);
  const add = (problem: string): void => {
    findings.push({ route, problem });
  };

  const headings = [...html.matchAll(/<h([1-6])[\s>]/g)].map((m) => Number(m[1]));

  const h1s = headings.filter((level) => level === 1).length;
  if (h1s !== 1) add(`${String(h1s)} h1 elements; a page needs exactly one`);

  let previous = 0;
  for (const level of headings) {
    if (previous !== 0 && level > previous + 1) {
      add(`heading level jumps from h${String(previous)} to h${String(level)}`);
      break;
    }
    previous = level;
  }

  // A table without a caption is a grid of numbers with no stated subject.
  const tables = [...html.matchAll(/<table\b[\s\S]*?<\/table>/g)];
  tables.forEach((match, index) => {
    if (!match[0].includes('<caption')) {
      add(`table ${String(index + 1)} has no caption`);
    }
  });

  const labelled = new Set(
    [...html.matchAll(/<label[^>]*\bfor="([^"]+)"/g)].map((m) => m[1]),
  );
  for (const match of html.matchAll(/<(input|select|textarea)\b([^>]*)>/g)) {
    const attrs = match[2] ?? '';
    if (attrs.includes('type="hidden"')) continue;
    const id = /\bid="([^"]+)"/.exec(attrs)?.[1];
    const described = attrs.includes('aria-label') || attrs.includes('aria-labelledby');
    if (!described && (id === undefined || !labelled.has(id))) {
      add(`${match[1] ?? 'control'} has no label: ${attrs.trim().slice(0, 60)}`);
    }
  }

  for (const match of html.matchAll(/<img\b([^>]*)>/g)) {
    if (!(match[1] ?? '').includes('alt=')) add('img without alt');
  }

  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
    const attrs = match[1] ?? '';
    if (textOf(match[2] ?? '') === '' && !attrs.includes('aria-label')) {
      add(`link with no accessible name: ${attrs.trim().slice(0, 60)}`);
    }
  }

  /*
   * A page that appears in the section rail marks itself there.
   *
   * `aria-current="page"` is how a screen reader user learns where they are in
   * a navigation they cannot see at a glance, and it is a prop each page passes
   * for itself, so forgetting it is silent. The explore page shipped without it
   * and nothing noticed until someone read the rail markup.
   *
   * Only the path is compared. A route with query state is the same section as
   * the route without it.
   */
  const path = route.split('?')[0] ?? route;

  /*
   * Scoped to the rail itself, not to the page.
   *
   * The first version looked for any link to this path anywhere in the
   * document, which flagged the methodology and licensing pages because they
   * appear in the footer. The footer is a different navigation and marking the
   * current page there is not the same obligation.
   */
  const rail = /<nav[^>]*aria-label="Sections"[\s\S]*?<\/nav>/.exec(html)?.[0];
  if (rail !== undefined && path !== '/') {
    const railLinks = [...rail.matchAll(/<a\s([^>]*href="([^"]+)"[^>]*)>/g)];
    const selfLinks = railLinks.filter((match) => match[2] === path);
    if (
      selfLinks.length > 0 &&
      !selfLinks.some((match) => (match[1] ?? '').includes('aria-current'))
    ) {
      add('is in the section rail and does not mark itself aria-current');
    }
  }

  const htmlTag = /<html([^>]*)>/.exec(html)?.[1] ?? '';
  if (!htmlTag.includes('lang=')) add('html element has no lang');

  if (!html.includes('Skip to content')) add('no skip link');

  return findings;
}

async function main(): Promise<void> {
  const baseArg = process.argv.find((arg) => arg.startsWith('--base='));
  const base = (baseArg?.slice('--base='.length) ?? DEFAULT_BASE).replace(/\/$/, '');

  const findings: Finding[] = [];
  let checked = 0;

  for (const route of ROUTES) {
    let response: Response;
    try {
      response = await fetch(base + route);
    } catch (error) {
      findings.push({
        route,
        problem: `could not be fetched: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    // A 404 is the expected status for the missing route and an error for every
    // other one. Both are checked, because the not-found page is a page.
    const expected = route === '/this-route-does-not-exist' ? 404 : 200;
    if (response.status !== expected) {
      findings.push({
        route,
        problem: `responded ${String(response.status)}, expected ${String(expected)}`,
      });
    }

    findings.push(...check(route, await response.text()));
    checked += 1;
  }

  /* eslint-disable no-console */
  console.log('');
  if (findings.length === 0) {
    console.log(`  no structural problems across ${String(checked)} routes`);
  } else {
    for (const finding of findings) {
      console.log(`  FAIL  ${finding.route}`);
      console.log(`        ${finding.problem}`);
    }
    console.log('');
    console.log(
      `  ${String(findings.length)} finding${findings.length === 1 ? '' : 's'} across ${String(checked)} routes`,
    );
  }
  console.log('');
  /* eslint-enable no-console */

  process.exit(findings.length === 0 ? 0 : 1);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
