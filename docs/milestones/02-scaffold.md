# Milestone 02: Production Scaffold

- **Date:** 2026-08-28
- **Prompt:** `.claude/prompts/02_scaffold.md`
- **Outcome:** Complete

## Repository state at start

Documentation only: the constitution, specifications, nine decision records and
two milestone records. No application code, no `package.json`.

## What was built

The foundation described in ADR-0001 through ADR-0009. No product features.

**Framework.** Next.js 16 App Router, React 19, TypeScript 5.9 in strict mode
with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Security
headers set in `next.config.ts`; `X-Powered-By` suppressed.

**Environment (`config/env.ts`).** Zod validation of every variable, evaluated
once. `APP_ENV` is deliberately separate from `NODE_ENV`, which cannot
distinguish a preview deployment from production. `DATABASE_URL` is required in
deployed environments and optional locally, so the app runs without a database
while reporting that honestly.

**Boot gate (ADR-0009).** A production process with `ALLOW_SYNTHETIC_SOURCES`
enabled refuses to start. Validation runs from `instrumentation.ts`, which Next
executes once at server startup, so the failure happens before any request is
handled rather than per request. Verified end to end, both paths.

**Brand (`config/brand.ts`).** Validated configuration holding every
user-visible brand value. Unassigned values are `null` rather than invented; a
placeholder domain would be fabricated data. A test asserts the brand string
appears nowhere in source outside this file, and not in the package name.

**Errors (`lib/`).** `Result` for expected failures, thrown `InvariantError` for
broken invariants. Eleven failure codes mapped to HTTP status. `NO_RESULTS` and
`NOT_AVAILABLE` are separate codes returning 200 and 503, which is the
distinction ADR-0009 requires between an empty answer and an absent one.

**Logging (`lib/logger.ts`).** Structured JSON with redaction enforced inside
the logger rather than at call sites. Redacts by field name and by value shape,
recurses into nested objects, reduces errors to name and message, and caps depth
and array length.

**Database (`db/`).** Prisma 7 with the node-postgres driver adapter, lazy
client creation, and a `checkDatabase` probe returning a `Result`. No models
yet; those arrive at milestone 03.

**Import boundaries (`eslint.config.mjs`).** Four boundary rules make ADR-0001
enforceable. `domain/` cannot import `integrations/`, `db/`, `app/` or
`components/`; `components/` cannot import `db/` or `integrations/`; and so on.
Each rule carries a message explaining why and pointing at the record.

**Design tokens (`app/globals.css`).** Warm paper surfaces, near-black ink, warm
neutral rules, one rust accent. IBM Plex Sans and Source Serif 4, self-hosted
through `next/font`. No gradients, no glass, no glow. Deliberately light-only;
tokens are structured so a dark scheme can be added in one place.

**Health endpoint (`/api/health`).** Build id, environment, database
reachability with latency, and the synthetic gate state. No secrets, no internal
error detail, never cached.

## Files changed

Configuration: `package.json`, `tsconfig.json`, `next.config.ts`,
`postcss.config.mjs`, `eslint.config.mjs`, `.prettierrc.json`,
`.prettierignore`, `.editorconfig`, `vitest.config.mts`, `prisma.config.ts`,
`.env.example`, `.gitignore`

Application: `instrumentation.ts`, `config/env.ts`, `config/brand.ts`,
`lib/result.ts`, `lib/errors.ts`, `lib/logger.ts`, `db/client.ts`,
`db/schema.prisma`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`,
`app/api/health/route.ts`

Tests: `tests/env.test.ts`, `tests/brand.test.ts`, `tests/logger.test.ts`,
`tests/errors.test.ts`

Structure: README boundary files in `domain/`, `integrations/`, `ingestion/`,
`analytics/`, `geography/`, `search/`, `skills/`, `salary/`, `components/`,
`types/`, `scripts/`

Documentation: `README.md`, `docs/README.md`, `docs/milestones/02-scaffold.md`

## Verification

| Check                       | Result                                  |
| --------------------------- | --------------------------------------- |
| `prettier --check`          | Pass                                    |
| `eslint`                    | Pass, no errors or warnings             |
| `tsc --noEmit`              | Pass                                    |
| `vitest run`                | 34 tests, 4 files, all pass             |
| `next build`                | Pass, 3 routes                          |
| `/api/health` live          | 200, correct payload, `no-store`        |
| Security headers live       | All four present, `X-Powered-By` absent |
| Boot gate, forbidden config | Startup fails, no route served          |
| Boot gate, valid config     | Starts, logs validation                 |

## Decisions

- **Prisma pinned to 7.10.0.** The `latest` dist-tag currently points at
  `8.0.0-rc.12`, a release candidate, which npm installed by default and which
  pulled in a dev-server toolchain with vulnerable transitive dependencies. A
  release candidate is not a production dependency.
- **ESLint pinned to 9.** ESLint 10 installed by default, and
  `eslint-plugin-react`, bundled by `eslint-config-next`, crashes on its rule
  context API. `eslint-config-next` declares a peer range of ESLint 9.
- **Prisma driver adapter.** Prisma 7 requires one. `@prisma/adapter-pg` was
  chosen over the Neon-specific adapter because it keeps the database portable
  to any managed PostgreSQL, which is the exit path in ADR-0006. Revisit if
  serverless connection latency proves it wrong.
- **Validation moved into `instrumentation.ts`.** Route handlers evaluate
  lazily, so configuration was first touched inside a request, making a
  misconfigured deployment start successfully and fail per request. ADR-0009
  states the process refuses to start, and this makes that literal.
- **Package name is `job-market-intelligence`.** Neutral, so a rename does not
  touch dependency metadata or lockfiles.
- **`.claude/` excluded from Prettier.** Reformatting the specifications is not
  this milestone's business.
- **Dark mode deferred.** Paper and ink is a light metaphor, and a half-built
  dark theme is worse than none. Tokens are structured to allow it later.
- **`robots: noindex` on the placeholder.** The product is not ready to be
  indexed. Removed at milestone 27.

## Issues

**Three high-severity advisories remain, all in `deepmerge-ts` reached through
`@prisma/config`.** Accepted for now, with reasons: it is a development
dependency in the Prisma CLI, not in the request path; the advisory is stack
exhaustion when merging recursive object graphs, and the only input is our own
config file; and the offered fix downgrades Prisma to 6.12.0, a larger
regression than the risk. Re-check when Prisma 8 reaches stable.

**No database has been exercised.** `checkDatabase` is written and typechecked
but has never opened a connection, because no Neon project exists yet. First
real exercise is milestone 03.

## Open issues

1. **Neon project not created.** Blocks milestone 03.
2. **JSA IVI licence unverified**, and on the critical path for launch.
3. **ABS ASGS licence unverified.** Earliest hard blocker, milestone 04.
4. **Adzuna access blocked.** No timeline. Does not block launch.
5. **Vercel plan limits unconfirmed.** Re-verify at milestone 34.

## Sign-off

- [x] Implementation complete
- [x] Tests pass, 34 of 34
- [x] Typecheck pass
- [x] Lint pass
- [x] Accessibility considered: skip link, visible focus, semantic headings,
      reduced-motion honoured, `lang` set from configuration
- [x] Provenance preserved: no data handled yet; contracts defined in ADR-0002
- [x] No unauthorized data handling: no source contacted, no credentials present
- [x] Documentation updated
- [ ] Ready for next milestone, awaiting product owner review
