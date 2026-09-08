# ADR-0011: Field-level content rights, defaulting closed

- **Status:** Accepted
- **Date:** 2026-09-08
- **Milestone:** 20 (Provenance and rights)
- **Amends:** ADR-0009

## Context

ADR-0009 established two axes per source: may we use it, and is it turned on.
Both are answered once, by one predicate, for the source as a whole.

That granularity is right for a statistical dataset, where the thing licensed
and the thing published are the same object. It is wrong for a job
advertisement, which is not one object but a page carrying several with
different owners:

- the **title, employer, location and salary** are the advertiser's, and are
  what the source licence plainly covers;
- the **employer's logo** is that employer's trade mark, and a job board is
  rarely in a position to sublicense it;
- a **named contact with a direct telephone number** is personal information
  about someone who did not publish it for indexing;
- **application instructions** may belong to the platform rather than the
  advertiser, and go stale the moment the platform changes.

The Queensland licence makes the problem explicit rather than theoretical. It
covers the portal's pages "unless otherwise noted", which leaves an individual
advertisement carrying third-party material outside the grant, and nothing in
the system could express that. The register recorded it in prose and the code
enforced nothing.

The alternative considered was to keep one decision per source and reproduce an
advertisement whole or not at all. That fails in both directions: it either
withholds a listing entirely because one component of it is uncertain, or
publishes the uncertain component because the rest is fine.

## Decision

**A source carries a position per field of an advertisement, and an unstated
field is treated as unestablished and is not published.**

Four positions, and the vocabulary distinguishes two things that reach the same
outcome by different routes:

| Position             | Meaning                                          |
| -------------------- | ------------------------------------------------ |
| `PERMITTED`          | Reproduce as the source published it             |
| `SUMMARY_ONLY`       | Describe in our own words; do not reproduce      |
| `WITHHELD`           | Do not publish, whatever the licence would allow |
| `NEEDS_VERIFICATION` | Nobody has established this; publish nothing     |

`WITHHELD` is a decision someone made. `NEEDS_VERIFICATION` is a decision nobody
has made yet. Collapsing them would lose the only signal that distinguishes a
considered refusal from an outstanding question.

`mayRepublishField()` composes this with the production gate from ADR-0009, and
the job repository is the single place it is applied. No component decides for
itself, for the same reason no call site evaluates production eligibility.

A field the gate refuses is reported to the reader as withheld rather than left
blank, when the source actually supplied one. "The employer wrote no
description" and "we are not satisfied we may reproduce what the employer wrote"
are different facts about the same empty space, and only one of them is about
the employer (ADR-0002).

## Consequences

**Accepted: a source added without a matrix publishes almost nothing.** Its
listings appear as a title and little else, and nothing raises an error, because
the failure is silent by construction. That is the direction that fails safely,
and the visible symptom is preferable to the invisible alternative. A data
quality check now reports a production-eligible listing source that has not
stated a position on the fields a listing is useless without.

**Accepted: the matrix is a claim this project must be able to defend.** Marking
a field `PERMITTED` asserts a right. The evidence sits in the source register
beside the licence it came from, and `/data-and-licensing` renders the matrix
from the same descriptors the software consults, so the page cannot describe a
permission the system does not hold.

**Accepted: withholding is not the same as minimising.** The matrix says what
may be published. It does not remove anything from the database, so a field
marked `WITHHELD` that arrives inside a description is still stored. Personal
information is handled separately and at ingestion, because minimising what is
collected is stronger than minimising what is displayed.

**Rejected: per-field rights on statistical sources.** A published dataset is
licensed as a dataset. The matrix is only meaningful for `JOB_LISTING` sources
and is not carried elsewhere.
