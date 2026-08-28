# Milestone 01a: Source status revision (Adzuna blocked)

- **Date:** 2026-08-28
- **Trigger:** Constitution and specification update, not a scheduled milestone
- **Outcome:** Complete

## What changed upstream

The product owner reported that Adzuna onboarding is blocked: the available path
requires organization and website details that do not exist yet. Three new
specifications and seven amended files landed in `.claude/`:

| File | Change |
| --- | --- |
| `08_SOURCE_STATUS.md` | New. JSA active, Adzuna pending/blocked, synthetic development-only |
| `09_SYNTHETIC_JOB_SOURCE.md` | New. Fixture rules and prohibited uses |
| `docs/SOURCE_ACTIVATION_RUNBOOK.md` | New. Adzuna activation procedure |
| `CLAUDE.md` | Added a current source state section |
| `00_START_HERE.md` | Added the revised implementation path |
| `prompts/12`, `13`, `17`, `18`, `24` | Rewritten around a pending job provider |

## Why milestone 01 output needed revising

Three assumptions in the accepted architecture no longer held.

1. **ADR-0001** gave each source a compliance status only. Adzuna is now
   unusable for a reason unrelated to compliance, so one axis cannot express its
   state.
2. **ADR-0002** defined two data lineages. A third now exists, and it is the one
   that must never reach a user.
3. **ARCHITECTURE.md** assumed launch included job listings. It does not.

The substantive risk is that the constitution forbids fabricating job listings,
and a synthetic fixture that leaks into production is exactly that. Convention
is not sufficient protection for a failure of that severity.

## Files changed

- `docs/adr/0009-source-activation-and-synthetic-containment.md` (new)
- `docs/adr/README.md` (index entry, amendment semantics)
- `docs/adr/0001-provider-neutral-domain.md` (amendment pointer only)
- `docs/adr/0002-official-vs-derived-metrics.md` (amendment pointer only)
- `docs/compliance/SOURCE_REGISTER.md` (activation axis, four entries revised,
  synthetic entry added)
- `docs/architecture/ARCHITECTURE.md` (three lineages, launch posture, build
  order, source diagram)
- `docs/README.md` (status)
- `docs/milestones/01a-source-status-revision.md` (this record)

ADR-0001 and ADR-0002 keep their original reasoning intact. Accepted records are
not rewritten; ADR-0009 amends them and both stay in force.

## Decisions

- **Two independent gates per source.** Compliance and activation are separate
  fields resolved by one `isProductionEligible` predicate. Adzuna is the case
  that proves they are different questions.
- **Five-layer synthetic containment.** Boot gate failing closed, a non-null
  column defaulting to safe, queries excluding by default, analytics reading a
  filtered view, and a contract test per public surface. Chosen over a single
  flag because the failure mode is publishing invented job advertisements.
- **`SYNTHETIC` added to `MetricBasis`.** Derived figures computed from fixtures
  in development are labelled honestly rather than passing as real metrics.
- **Unavailable is not empty.** Job surfaces report that the product cannot
  answer yet, instead of reporting zero matching vacancies in Australia.
- **Preview deployments may use synthetic data**, labelled and `noindex`.
  Production never can.

## Database changes

None yet. ADR-0009 specifies `JobListing.isSynthetic NOT NULL DEFAULT false`,
`sourceKey = 'synthetic'`, a fixture version column, and a synthetic-excluding
view for analytics. These are implemented at milestone 03.

## API and UI changes

None yet. ADR-0009 specifies an unavailable state for job surfaces and a visible
development label for synthetic records. Implemented at milestones 16 and 17.

## Tests

None run. Still no code; the scaffold arrives at milestone 02. ADR-0009 adds a
required contract test to that future suite.

## Compliance implications

The register now records Adzuna as `BLOCKED` with the specific reason, and adds
two standing prohibitions: never invent organization details to obtain access,
and never present synthetic records as real vacancies.

**JSA licence verification has moved onto the critical path.** It was one source
among several; it is now the only source of public value at launch, so its terms
block production rather than blocking a feature. Verify before milestone 05, not
at milestone 30.

## Open issues

1. **JSA IVI licence unverified**, and now the launch-blocking dependency.
2. **ABS ASGS licence unverified.** Earliest hard blocker, at milestone 04.
3. **Adzuna access blocked.** No timeline. Product does not depend on it for
   launch.
4. **Neon project not created.** Required before milestone 03.
5. **Vercel plan limits unconfirmed.** Re-verify at milestone 34.

## Sign-off

- [x] Implementation complete (document-only revision)
- [x] Tests pass, not applicable, no code
- [x] Typecheck pass, not applicable, no code
- [x] Lint pass, not applicable, no code
- [x] Accessibility considered: unavailable state specified as distinct from
      empty, per ADR-0008
- [x] Provenance preserved: third lineage added with explicit basis
- [x] No unauthorized data handling: onboarding not bypassed, no invented
      organization details, synthetic containment specified
- [x] Documentation updated
- [ ] Ready for next milestone, awaiting product owner review
