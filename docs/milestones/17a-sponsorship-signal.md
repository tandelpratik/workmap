# Milestone 17a: what the advertisement says about sponsorship

- **Date:** 2026-09-06
- **Prompts:** none. A product requirement raised outside the sequence, sitting
  on top of `17_job_search_ui`.
- **Outcome:** Complete. Every stored listing carries a sponsorship finding and
  the words that produced it, search filters on it, and the listing page shows
  the quotation beside the label.

## Why this is a data integrity feature, not a filter

Visa sponsorship is the first thing a large share of this product's likely
readers want to know, and it is the field a job board is most tempted to get
wrong. A tag saying "sponsorship available" is cheap to render and expensive to
be wrong about: somebody may apply, decline other work, or move country on the
strength of it.

Two rules from the governing documents meet here.
`.claude/01_PRODUCT_SPEC.md` puts "guaranteed visa sponsorship claims" on the
explicit non-goals list, and `.claude/07_COMMERCIAL_READINESS.md` forbids
claiming sponsorship "without reliable source evidence". The constitution's own
rule against fabrication covers the rest.

So the feature is defined as narrowly as it can be and still be useful:

> **We report what an advertisement says. We never assess whether anyone is
> eligible for anything.**

Everything else follows from that sentence, and both halves of it are enforced
by the types rather than by care.

## Four values, and why the fourth exists

| Signal          | Means                                                             |
| --------------- | ----------------------------------------------------------------- |
| `MENTIONED`     | The advertisement says sponsorship is offered or available        |
| `EXCLUDED`      | The advertisement says sponsorship is not available               |
| `NOT_MENTIONED` | The whole advertisement was read and says nothing either way      |
| `INDETERMINATE` | Only part of the advertisement is held, so silence proves nothing |

The fourth is the one that makes the other three honest. Adzuna returns a
snippet rather than the full text of an advertisement, so on those listings the
absence of a phrase is a gap in our data, not a statement by an employer.
Collapsing that into `NOT_MENTIONED` would turn our incompleteness into a claim
about somebody's advertisement, and it is the majority case: 496 of the 1,244
listings currently stored.

`detectSponsorship` therefore takes `isExcerpt` as a required argument. It is
not optional because getting it wrong is exactly the failure that matters: the
difference between "this advertisement does not mention sponsorship" and "we
have not read this advertisement".

## Evidence is part of the finding, not a nicety

`SponsorshipFinding` carries the phrase that matched and the words around it. A
label on its own is our characterisation of an employer. A label beside the
employer's own sentence is a quotation the reader can check, and every listing
links to the original so they can.

The component renders the quotation in a `figure` and `blockquote` captioned
"Quoted from the advertisement", never a paraphrase. The repository validates
the stored JSON on the way out and yields no evidence at all if the shape is
unexpected, because showing a mangled excerpt as an employer's words is worse
than showing none.

## Phrases, not keywords

The detector matches phrases. "Visa" as a keyword would have mislabelled real
advertisements already in the database:

- `HR Advisor (Visa and JEMS)`, where the word is part of a system name in a
  job title.
- `Skilled Regional Visa Holders are welcome to apply`, which describes who may
  apply and is not an offer to sponsor anyone.

Both are in the test fixtures. Two more rules keep it conservative:

- **A refusal outranks an offer** when an advertisement contains both. The two
  errors are not symmetrical. Telling a reader an employer sponsors when it does
  not may send them to apply or relocate on a false basis; the reverse costs
  them an opportunity that is still one click away at the source.
- **Negation is read within the clause**, not across the advertisement. "Visa
  sponsorship is not available" is a refusal. "Visa sponsorship available.
  Applicants without AHPRA registration need not apply" is not, and a
  document-wide negation check would have read it as one.

Markup is stripped by turning tags into spaces rather than deleting them, so a
phrase split across `visa<b> sponsorship</b>` still matches and words either
side of a tag are not fused into one.

## Where it is computed

In `ingestion/sponsorship.ts`, one helper shared by both ingestion paths, called
in the row builder beside the description it reads. A provider decides what text
it has and whether that text is complete; what the words mean is the same
question everywhere, and answering it per provider is how two listings with
identical wording end up labelled differently.

It is recomputed on every write, so an edited advertisement cannot keep an old
verdict.

## What the reader sees

- A label on each listing, with a dot for shape and the wording beside it.
  Meaning is never carried by colour alone, per the accessibility rules.
- The quotation underneath, where there is one.
- A key below the results, shown once rather than repeated on every row.
  "Not known" gets the longest explanation, because it is the most common and
  the easiest to misread as something the employer said.
- A note that these labels report advertisement wording and are not advice about
  anyone's visa position, linking to the Department of Home Affairs for
  anything further.
- A filter in the search form. It filters advertisements by what they say, not
  people by who may apply. The value is bounded against the vocabulary rather
  than passed through to the database, an unrecognised value shows everything
  rather than erroring, and it is carried through paging so page two cannot
  quietly widen the result set.

## What the current corpus says

Of 1,244 stored listings:

| Signal          | Count | Where from                                   |
| --------------- | ----: | -------------------------------------------- |
| `MENTIONED`     |     8 | 3 Adzuna, 5 Queensland                       |
| `EXCLUDED`      |     1 | Adzuna                                       |
| `NOT_MENTIONED` |   739 | Queensland, whose detail pages are full text |
| `INDETERMINATE` |   496 | Adzuna, which sends excerpts                 |

Nine listings in twelve hundred say anything at all about sponsorship. That is
the honest answer for this corpus, and it is worth reporting plainly rather
than making the feature look more productive than it is.

## Files changed

- `domain/sponsorship.ts`, `ingestion/sponsorship.ts`
- `db/schema.prisma`, `db/migrations/20260905153312_add_sponsorship_signal/`
- `db/repositories/job.ts`, `domain/job.ts`
- `ingestion/adzuna.ts`, `ingestion/smartjobs-qld.ts`
- `components/sponsorship-badge.tsx`, `components/job-list.tsx`,
  `components/job-search-form.tsx`, `app/page.tsx`
- `tests/sponsorship.test.ts`, `tests/adzuna.test.ts`,
  `tests/smartjobs-qld.test.ts`

## Decisions

- **Deterministic patterns, no model.** The constitution bars an LLM dependency
  for core features, and this is a case where a deterministic rule is also the
  better answer: a reader can be shown exactly why a listing was labelled, which
  a classifier score cannot do.
- **Stored as a column, not computed at read time.** It is derived from text we
  already hold, so it could be recomputed on every request. Storing it makes the
  filter an indexed query instead of a scan, and the evidence stored beside the
  label is what makes the decision auditable later.
- **No aggregation by employer.** "This employer sponsors" is a claim about a
  business, and nothing in a set of advertisements supports it. Adzuna's terms
  bar aggregate use in any case, but this would stay out even if they did not.
- **No eligibility language anywhere.** No visa subclass suggestions, no "you
  may qualify", no likelihood. Passing on what a third party published is a
  different act from advising someone on their own migration position, and the
  product stays on the first side of that line.

## Open issues

1. **A rule change does not reach stored rows on its own.** Findings are
   recomputed when a row is written, and an unchanged advertisement is skipped
   by the content hash, so improving a pattern needs either a re-ingest or a
   backfill command. Nothing exists for that yet. It is not urgent while the
   corpus is small and the rules are new.
2. **Excerpts dominate.** Two in five stored listings can never be better than
   `INDETERMINATE` while Adzuna is the source, since the full text is on the
   employer's own page. Nothing here should be read as a measure of how much of
   the Australian market sponsors.
3. **English wording only**, and phrase-based, so an unusual formulation is
   missed. A missed offer shows as "not mentioned" beside a link to the
   advertisement, which is the safe direction for this to fail in.
4. **No review surface.** Nothing lets a person inspect or correct a finding.
   That belongs with the admin milestone.

## Sign-off

- [x] Implementation complete
- [x] Tests pass, 331 of 331, of which 20 cover this
- [x] Typecheck, lint, format pass
- [x] Every label describes the advertisement, never the employer or the reader
- [x] Evidence stored and displayed with every positive finding
- [x] Meaning not carried by colour alone
- [x] No fabrication: absence of text is never reported as absence of wording
