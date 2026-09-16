# Regional Job Search

One search across current job advertisements in regional Australia, reporting
what each advertisement says about visa sponsorship, quoted from the
advertisement itself. Labour market maps and statistics sit behind it as
supporting context.

The product name is configuration, not identity. See
[ADR-0007](docs/adr/0007-brand-configuration.md); the published name lives only
in `config/brand.ts` and a test enforces that.

## What this is not

It reports wording published by third parties and links to the original. It does
not advise anyone about their own migration position, does not assess
eligibility or prospects, does not recommend a visa subclass, and never
describes an employer as a sponsor. That boundary is the product's basis for
existing, it is stated verbatim in `config/legal.ts`, and `tests/legal.test.ts`
fails the build on a phrase that crosses it.

## Status

Mid-pivot. The product was built as a national labour market atlas and is being
turned into a regional job discovery platform. The identity, the legal footing
and the navigation have moved.

The regional classification is live and verified against the instrument that
defines a designated regional area (LIN 22/022, CC BY 4.0). Listings are placed
by postcode where a source publishes coordinates, by region where it publishes
only a region and every postcode in that region agrees, and by state where the
instrument leaves no postcode in that state unlisted. **2,076 of 2,713 listings
are settled, 76.5%**; the rest are advertisements with no single place, and are
labelled as such rather than guessed.

The interface reads it. Search is the front page rather than a link to one, the
area filter defaults to a designated regional area and says so in words above
the results, and every listing states the postcode and the rule that placed it.
Advertisements that cannot be placed are a selectable category rather than a
hidden one.

`robots: noindex` stays set. The classification was one of three things gating
it; the legal pages are the others, and they are blocked on a legal name and a
contact address that do not exist yet.

Two surfaces are live. Job search reads listings from Adzuna and Queensland
Smart Jobs; the vacancy map reads the Jobs and Skills Australia Internet Vacancy
Index over ASGS Edition 4 geography. Both render on the server and ship neither
a map library nor a search runtime to the browser.

Four sources are verified and active, and one is verified as prohibited. Adzuna
is licensed to supply listings and barred from supplying aggregates, which is a
structural division rather than a note: every published figure comes from JSA,
and no corpus-wide listing count is published anywhere. See the
[source register](docs/compliance/SOURCE_REGISTER.md).

The site is not indexed. `robots: { index: false, follow: false }` stays set
until the remaining legal pages exist, because a site that cannot answer for
itself should not be inviting readers. The regional classification and the
canonical URLs were the other two conditions and both have landed, so a privacy
policy and terms of use are the last thing behind it, and those wait on a legal
name and a contact address. See [BACKLOG.md](docs/BACKLOG.md).

## Requirements

- Node 20 or later (developed on 24)
- npm 10 or later
- PostgreSQL 14 or later, hosted. No local database is required to run the app,
  which reports its database as `not_configured` rather than failing.

## Getting started

```bash
npm install          # also generates the Prisma client
cp .env.example .env # then fill in what you need
npm run dev
```

The app runs at http://localhost:3000. Health is at `/api/health`.

That is enough to see the site. It will have no data in it, because no listing
in this product is ever fabricated and there is no fixture loader to pretend
otherwise. [docs/SETUP.md](docs/SETUP.md) is the full walkthrough: a database of
your own, real advertisements fetched from a source that needs no credentials,
and the four passes that turn them into what the product shows. It assumes no
prior knowledge of the stack.

## Commands

| Command                          | Purpose                                                                     |
| -------------------------------- | --------------------------------------------------------------------------- |
| `npm run dev`                    | Development server                                                          |
| `npm run build`                  | Production build                                                            |
| `npm run start`                  | Serve the production build                                                  |
| `npm run check`                  | Format check, lint, typecheck and tests. Run before committing              |
| `npm run test`                   | Tests once                                                                  |
| `npm run test:watch`             | Tests in watch mode                                                         |
| `npm run lint`                   | ESLint, including architectural import boundaries                           |
| `npm run typecheck`              | TypeScript, no emit                                                         |
| `npm run format`                 | Rewrite with Prettier                                                       |
| `npm run db:generate`            | Regenerate the Prisma client                                                |
| `npm run db:migrate`             | Create and apply a migration locally                                        |
| `npm run db:deploy`              | Apply migrations in a deployed environment                                  |
| `npm run postcodes:resolve`      | Places published coordinates in an ABS postal area. Dry run by default      |
| `npm run regional:classify`      | Places stored locations against the regional instrument. Dry run by default |
| `npm run regional:build-regions` | Rebuilds the statistical-area postcode artefact from ABS allocation files   |
| `npm run data:check`             | Data quality checks. Read only, and exits non-zero on failure               |
| `npm run jobs:redact`            | Sweep stored listings for contact details. Add `-- --apply`                 |
| `npm run sponsorship:reclassify` | Re-read stored ads for sponsorship wording. Add `-- --apply`                |
| `npm run skills:extract`         | Attach the skills each advertisement names. Add `-- --apply`                |
| `npm run source:health`          | Whether each live source is still running                                   |
| `npm run a11y:check`             | Structural accessibility, against a running server                          |

## Environment

Every variable is validated at startup by `config/env.ts`. A missing or
malformed value stops the server rather than failing later. See `.env.example`
for the full list.

Two rules matter more than the rest:

- **Secrets are server-side only.** Nothing sensitive is ever prefixed
  `NEXT_PUBLIC_`. The browser talks to this application; this application talks
  to providers.
- **`ALLOW_SYNTHETIC_SOURCES` must be false in production.** A production
  process with it enabled refuses to start, because synthetic job records are
  development fixtures and must never reach a user
  ([ADR-0009](docs/adr/0009-source-activation-and-synthetic-containment.md)).

## Layout

Dependencies point inward. `domain/` is the centre and imports no outer module,
enforced by lint rather than convention.

```text
app/           routes, pages, API handlers
components/    presentation
config/        brand, legal position, environment
domain/        entities, ports, rules
db/            Prisma schema and repositories
integrations/  one directory per external provider
ingestion/     import orchestration
analytics/     aggregation and summary refresh
geography/     geography registry
skills/        deterministic skill extraction from advertisement text
lib/           framework-neutral utilities
tests/         unit and contract tests
scripts/       offline build tasks
```

Each directory has a README stating its boundary. Search lives in
`db/repositories/job.ts` rather than a module of its own.

## Documentation

- [Setup](docs/SETUP.md), the full local walkthrough for a new developer
- [Deployment](docs/DEPLOYMENT.md), and the data passes a deploy does not run
- [Architecture](docs/architecture/ARCHITECTURE.md), the consolidated view
- [Design system](docs/architecture/DESIGN_SYSTEM.md), the house style and its rules
- [Decision records](docs/adr/README.md), and why the system is shaped this way
- [Source register](docs/compliance/SOURCE_REGISTER.md), what may and may not be
  done with each data source
- [Milestones](docs/milestones/), one record per completed step

The binding rules live in `.claude/CLAUDE.md` and override everything here.

## Conventions

- External data and user input are validated with Zod at every trust boundary.
- Expected failures are `Result` values; broken invariants are thrown.
- Logs are structured JSON with redaction enforced inside the logger.
- Data is never fabricated. A value that does not exist is reported as
  unavailable, suppressed or not covered, never as zero.
