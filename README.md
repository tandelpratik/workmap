# Job Market Intelligence Platform

An atlas of Australian labour market demand: where work is concentrated, which
occupations are sought, which skills are asked for, and how that changes.

The product name is configuration, not identity. See
[ADR-0007](docs/adr/0007-brand-configuration.md).

## Status

Australian geography loaded (ASGS Edition 4). No product features yet and no
labour market data. Milestone 04 of 35.

JSA is the designated market intelligence source. No authorized job listing
provider is active, so the product ships without job listings until one is.
See the [source register](docs/compliance/SOURCE_REGISTER.md).

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

## Commands

| Command               | Purpose                                                        |
| --------------------- | -------------------------------------------------------------- |
| `npm run dev`         | Development server                                             |
| `npm run build`       | Production build                                               |
| `npm run start`       | Serve the production build                                     |
| `npm run check`       | Format check, lint, typecheck and tests. Run before committing |
| `npm run test`        | Tests once                                                     |
| `npm run test:watch`  | Tests in watch mode                                            |
| `npm run lint`        | ESLint, including architectural import boundaries              |
| `npm run typecheck`   | TypeScript, no emit                                            |
| `npm run format`      | Rewrite with Prettier                                          |
| `npm run db:generate` | Regenerate the Prisma client                                   |
| `npm run db:migrate`  | Create and apply a migration locally                           |
| `npm run db:deploy`   | Apply migrations in a deployed environment                     |

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
config/        brand, environment
domain/        entities, ports, rules
db/            Prisma schema and repositories
integrations/  one directory per external provider
ingestion/     import orchestration
analytics/     aggregation and summary refresh
geography/     geography registry
search/        query building and ranking
skills/        extraction and matching
salary/        normalisation and distribution
lib/           framework-neutral utilities
tests/         unit and contract tests
scripts/       offline build tasks
```

Each directory has a README stating its boundary.

## Documentation

- [Architecture](docs/architecture/ARCHITECTURE.md), the consolidated view
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
