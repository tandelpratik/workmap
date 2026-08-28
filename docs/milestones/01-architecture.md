# Milestone 01: Product & Architecture

- **Date:** 2026-08-28
- **Prompt:** `.claude/prompts/01_product_architecture.md`
- **Outcome:** Complete

## Repository state at start

Documentation only. `.claude/` contained the constitution, seven specification
documents, thirty-five milestone prompts and three checklists. No application
code, no `package.json`, no version control.

Toolchain present: Node 24.11.0, npm 11.6.1, git 2.53.0.
Not present: pnpm, local PostgreSQL, Docker, which forced the hosted-database
decision recorded in ADR-0006.

## Decisions taken by the product owner

| Question | Decision |
| --- | --- |
| Hosting | Vercel |
| Database | Neon serverless PostgreSQL |
| Version control | Initialise git locally, no remote |

## Files changed

Version control:
- `.gitignore`: Node/Next output, environment files, reproducible data artefacts
- `.gitattributes`: line-ending normalisation, binary and generated-file handling

Documentation:
- `docs/README.md`
- `docs/architecture/ARCHITECTURE.md`
- `docs/adr/README.md`
- `docs/adr/0001-provider-neutral-domain.md`
- `docs/adr/0002-official-vs-derived-metrics.md`
- `docs/adr/0003-geospatial-pipeline.md`
- `docs/adr/0004-postgresql-first.md`
- `docs/adr/0005-idempotent-ingestion.md`
- `docs/adr/0006-deployment-vercel-neon.md`
- `docs/adr/0007-brand-configuration.md`
- `docs/adr/0008-validation-errors-observability.md`
- `docs/compliance/SOURCE_REGISTER.md`
- `docs/milestones/01-architecture.md`

## Database changes

None. No schema exists yet.

## API changes

None.

## UI changes

None.

## Tests

None run. No test infrastructure exists; it is established in milestone 02.
The prompt for this milestone is explicitly document-only ("Do not implement
yet"), so there is no code to lint, typecheck or test.

## Performance observations

Not applicable.

## Compliance implications

`docs/compliance/SOURCE_REGISTER.md` was created and **every source is recorded
as `UNVERIFIED`**. Adzuna, JSA IVI, ABS ASGS and ANZSCO must each be verified
before the milestone that integrates them. No source may be used in production
while unverified.

ADR-0001 makes `complianceStatus` part of the source descriptor contract, so an
unverified source is refusable in code rather than by memory.

## Open issues

1. **All source licensing unverified.** Blocks production use of every dataset.
   Earliest hard blocker: milestone 04 (ABS boundaries).
2. **Adzuna credentials not obtained.** Required by milestone 12.
3. **Vercel plan limits not confirmed.** Function duration and cron frequency
   are assumed constraints in ADR-0006 and must be re-verified at milestone 34.
4. **Neon project not created.** Required before milestone 03.

## Decision notes

- A source compliance register was created at this milestone although the
  compliance milestone is 30. Rationale: the constitution forbids production use
  of an undocumented source, and several earlier milestones integrate sources.
  Recording every source as unverified now prevents an accidental assumption of
  permission later. This is a deliberate, small scope addition.
- PostGIS was deferred rather than adopted (ADR-0003) because the MVP performs no
  spatial queries. Recorded as a decision so it is revisited deliberately.
- Nothing was implemented. The prompt forbids it and the next milestone owns the
  scaffold.

## Sign-off

- [x] Implementation complete (document-only milestone)
- [x] Tests pass: not applicable, no code
- [x] Typecheck pass: not applicable, no code
- [x] Lint pass: not applicable, no code
- [x] Accessibility considered: structural requirements recorded in
      ARCHITECTURE.md and ADR-0003
- [x] Provenance preserved: provenance contract defined in ADR-0002
- [x] No unauthorized data handling: no data accessed; register created
- [x] Documentation updated
- [ ] Ready for next milestone: **awaiting product owner review**
