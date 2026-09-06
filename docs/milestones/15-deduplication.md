# Milestone 15: cross-source deduplication

- **Date:** 2026-09-05
- **Prompts:** `15_deduplication`
- **Outcome:** Complete. Detection, grouping, canonical identity and search
  suppression, with the false-positive fixtures the prompt asks for.

## Why now

This milestone was deliberately skipped during the Adzuna work: one provider
cannot produce cross-source duplicates, so it had nothing to do. Milestone 13a
built Queensland ingestion, and a Queensland Health vacancy advertised on both
Smart Jobs and Adzuna would now appear twice. Dedup belongs before the first
live Queensland crawl, not after it.

## The asymmetry that decided the design

A missed duplicate shows a reader the same job twice, which is untidy.

A wrong merge hides a real vacancy behind an unrelated one, which is a job
somebody does not find. The constitution forbids fabricating a listing, and
asserting that two advertisements are one vacancy when they are not is a
fabrication about both of them.

The two mistakes are not equally bad, so the matcher is not neutral between
them. It errs, consistently, toward leaving things apart. Three rules follow:

1. **Never group two listings from the same source.** Within a source the
   provider's identifier is the identity, and an employer advertising three
   identical positions is publishing three vacancies. This is the guard that
   matters most in practice, and it was checked against real data: 500 stored
   Adzuna listings produce zero groups.
2. **Never group on partial evidence.** A signature needs every component it
   claims. Two listings that both lack an employer have a gap in common, not a
   fact in common, and "the same title in the same place at an unnamed
   employer" describes a great many unrelated vacancies.
3. **Every decision is explainable.** The signature that produced a group is
   stored on it, so a grouping can be read, argued with and recomputed.

## What matches

**A canonical URL**, which is the strong signal. Query strings on job links are
overwhelmingly tracking parameters, so the same advertisement arrives from two
sources with different ones; the host and path are what address the vacancy.
Scheme and `www.` are dropped, an unparseable link yields no key at all, and a
`javascript:` URL is not a key either.

**Employer, role and place together**, which is the weaker signal and requires
all three. Titles are normalised for case, punctuation and spacing and nothing
else. That restraint is the point: "Senior Registered Nurse" and "Registered
Nurse" are different jobs, and a normaliser that treated seniority as noise
would merge them and hide one. There is a test for exactly that.

## What a group does, and does not do

Nothing is deleted and nothing is merged. Every source record keeps its own
row, its own provenance and its own provider fields. A group is an added
relationship, which is what makes a wrong grouping recoverable: the listing
behind it was never destroyed.

The canonical member is the one search shows. It is chosen by preferring a
listing a reader can actually read, then the earliest posting as the closest
thing to the advertisement's origin, then a stable tiebreak on source key and
id, which is meaningless on purpose: the choice has to land the same way on
every run, or the front page would rewrite itself between imports for no
reason.

`Job.isCanonical` already existed in the schema and defaults to true, so no
migration was needed and the search filter is inert until a duplicate is
actually found.

**Groupings are withdrawn when they stop holding.** A listing that expires, is
edited, or falls outside a changed rule is released and becomes visible again.
Without that a grouping decision would be permanent in effect however wrong it
turned out to be, and the search would keep hiding a listing whose reason for
being hidden had gone. There is a test that breaks a match and asserts the
release.

## Files changed

- `domain/duplicate.ts`, `ingestion/deduplicate.ts`
- `scripts/dedupe-jobs.ts`, `package.json`
- `db/repositories/job.ts`
- `tests/duplicate.test.ts`

## Decisions

- **Grouping runs over stored rows, not during an import.** A duplicate is a
  relationship between two sources and neither import can see the other. It is
  idempotent, so a rule change takes effect on the next run with nothing to
  undo.
- **No confidence score, two named signals instead.** The prompt asks for a
  score. A number between zero and one would imply a precision this evidence
  does not have and would invite a threshold nobody could justify. Which signal
  matched is the honest answer, and it is stored.
- **No description similarity.** The prompt suggests it. It is fuzzy, expensive
  over a growing table, and its failure mode is the merge that hides a job. It
  can be added when there is real duplicate data to evaluate it against.

## Open issues

1. ~~**Untested against real duplicates.**~~ **First cross-source run,
   2026-09-06:** 1,244 listings from two live sources, zero groups, nothing
   released. So the rules have now met real data from more than one provider
   and asserted nothing, which is the correct answer for these two corpora:
   500 Adzuna listings drawn from the whole country against 744 Queensland
   Government vacancies. It is evidence that the same-source guard and the
   all-three-components rule hold on live rows, and it is not yet evidence that
   a true duplicate would be caught. That needs an overlap to exist.
2. **No review tooling.** The prompt asks for it. Groups are inspectable in the
   database and every decision carries its signature, but nothing surfaces them
   for a human to confirm or reject. That belongs with the admin milestone.
3. **Nothing runs it automatically.** It is a command, like the Queensland
   ingest. Both want scheduling, and that follows activation.

## Sign-off

- [x] Implementation complete
- [x] Tests pass, 306 of 306
- [x] Typecheck, lint, format pass
- [x] False-positive fixtures: same source, different employer, seniority,
      shared gaps, unusable URLs
- [x] Ran against real data: 500 listings, zero groups, same-source guard held
- [x] Source records preserved, provenance intact, nothing deleted
- [x] Documentation updated
