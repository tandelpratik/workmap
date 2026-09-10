# Regional classification: the reference

The definition of "regional", established from the instrument that defines it,
and turned into something the product can ask a question of.

This milestone builds the classifier and proves it. It does not yet classify
most of the corpus, and the measurement below says exactly why.

## The authority

**Migration (Designated regional areas for certain skilled and temporary
graduate visas) Instrument (LIN 22/022) 2022**, register identifier
`F2022L00231`. Three pages. Expressed entirely in postcodes.

Checked on 2026-09-10 against the Federal Register of Legislation: one version,
in force since 5 March 2022, unamended, with no amendments pending. It repealed
its own predecessor LIN 20/292 (`F2021L00044`), which is recorded so that the
superseded instrument is not picked up by mistake.

Licensed **CC BY 4.0**, commercial use expressly permitted, with the register
mandating one of two attribution sentences and stating which applies. The
product parses the ranges into a lookup table, which is a modification, so the
"Based on content from the Federal Register of Legislation at [date]" form is
the one that applies. Full evidence is in the
[source register](../compliance/SOURCE_REGISTER.md).

`immi.homeaffairs.gov.au` publishes a summary of the same list and returns HTTP
403 to automated requests. That is an access control and was not circumvented.
It is also not the authority, and the authority is openly licensed and
machine-readable, so nothing was lost by going to it instead.

## The finding that shaped the build

The instrument has two tables. Section 3(1) lists the cities and major regional
centres; section 3(2) lists the regional centres and other regional areas. A
postcode in either is within a designated regional area. A postcode in neither
is not, and the instrument never names those places: Sydney, Melbourne and
Brisbane are what is left over.

Reading the two tables together produces a result that is not obvious from the
outside:

> Between them, the tables list **every postcode** in Western Australia, South
> Australia, Tasmania, the Australian Capital Territory, the Northern Territory,
> Norfolk Island and the other territories.

Western Australia, South Australia and Tasmania are covered by s3(1) for their
capital and by "all postcodes not mentioned in subsection (1)" for the rest. The
territories are each covered in full by a single line. So **only New South
Wales, Victoria and Queensland contain postcodes that are not regional**, and a
listing anywhere else is in a designated regional area whether or not a postcode
was ever recorded for it.

The classifier derives that from the tables rather than carrying a list of
states, so an amended instrument changes the behaviour instead of contradicting
it.

## What was built

| File                                                       | Purpose                                                                                                              |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `domain/regional.ts`                                       | Pure classification. Takes the reference as an argument, the way `lifecycleOf` takes its thresholds                  |
| `config/regional-areas.ts`                                 | The two tables, transcribed, with the register identifier, document URL, download date and a SHA-256 of the document |
| `config/sources.ts`                                        | `legislation-regional-areas`, ACTIVE and VERIFIED                                                                    |
| `db/schema.prisma`                                         | `RegionalStatus`, `RegionalCategory`, `RegionalBasis`, and five columns on `Location`                                |
| `db/migrations/20260910225500_add_regional_classification` | The migration. **Not applied**; see below                                                                            |
| `ingestion/regional.ts`                                    | Classifies stored locations, idempotently                                                                            |
| `scripts/classify-regional.ts`                             | `npm run regional:classify`, dry run by default                                                                      |
| `tests/regional.test.ts`                                   | 35 tests                                                                                                             |

Three answers, not two. `REGIONAL`, `NOT_REGIONAL` and `UNKNOWN` are distinct
everywhere: in the domain, in the enum, in the column. "This place is not in a
designated regional area" is a statement about the place; "we could not place
this advertisement" is a statement about our data. Collapsing the second into the
first would drop real regional listings out of a regional search with nothing to
show that it had happened.

The basis is published alongside the answer. A place settled by its postcode was
looked up in the instrument; a place settled by its state was decided by the
fact that the instrument leaves no postcode in that state unlisted. Both are
exact, and a reader is entitled to know which they are reading. A state-settled
answer cannot name a category, because Western Australia holds both.

## Testing the transcription rather than the logic

The classifier is a dozen lines and fails loudly. The transcription is two
hand-typed statutory tables, and a mistyped digit there fails silently and
forever, mislabelling real jobs in real towns. So the tests go at the
transcription:

- every range ascending, and no range overlapping its neighbour;
- every postcode inside its own jurisdiction's thousand-block, which catches a
  wrong leading digit moving a whole range into another state;
- an exhaustive sweep of all 7,000 postcodes across every block, asserting that
  none appears in both tables;
- the boundary postcode either side of each place the instrument changes
  category. `4305` is s3(1) and `4306` begins s3(2). `2526`, `2527` and `2528`
  are three consecutive postcodes across two categories.

One test exists purely to document why the jurisdiction is not optional: `2611`
resolves to a different statutory category depending on whether it is read as
Australian Capital Territory or New South Wales. Both answers are "regional", so
the error would never surface as a wrong status, only as the wrong statute
quoted beside it, which is the kind of mistake that survives for years.

## The postcode bridge

The instrument is written in postcodes and no job source publishes one, so the
classifier needed a bridge before it could do anything.

**ABS Postal Areas**, joined against the coordinates the source itself
published. Postal areas are not released for ASGS Edition 4 yet, so the 2021
edition is used, and that is the one place in this product where an Edition 3
boundary is consulted. It is confined to this lookup and never reaches the
geography registry, because a postal area is not stored as a geography: it
yields a postcode and is then out of the picture.

The join is done by mapshaper against the unmodified shapefile rather than in
JavaScript against a simplified copy. The full-precision GeoJSON is 109 MB,
which is a great deal of memory to hold in order to test a few hundred points,
and the alternative was to simplify the boundaries so they fit. That is the
wrong trade here: simplification moves boundaries, and a moved boundary is
exactly what changes the answer for a point sitting near one. mapshaper reads
the shapefile in its own compact form and answers in about 250 milliseconds.

Verified end to end against known points before it was pointed at the corpus:

| Point                | Postal area | Under the instrument                      |
| -------------------- | ----------- | ----------------------------------------- |
| Brisbane CBD         | 4000        | Not regional                              |
| Sydney CBD           | 2000        | Not regional                              |
| Melbourne CBD        | 3000        | Not regional                              |
| Ipswich              | 4305        | Regional, s3(1)                           |
| Cairns               | 4870        | Regional, s3(2)                           |
| Kalgoorlie           | 6430        | Regional, s3(2), via the remainder clause |
| Darwin               | 0800        | Regional, s3(2)                           |
| A point in the ocean | none        | Unknown, and no postcode invented         |

**Two limitations travel with every postcode this produces**, and both are
stored on the row rather than left in a comment. ABS postal areas approximate
Australia Post postcodes rather than reproducing them, and the vintage is 2021.
`postcodeSource` records that a postcode was derived from coordinates rather
than published by the source, for the same reason `salaryBasis` distinguishes a
quoted salary from an estimated one: same column, different standing.

## Measured against the real corpus

2,713 active listings, after resolving postcodes and classifying:

| Answer                      | Listings | Share |
| --------------------------- | -------: | ----: |
| `UNKNOWN`                   |    2,234 | 82.3% |
| `REGIONAL`, by postcode     |      288 | 10.6% |
| `NOT_REGIONAL`, by postcode |      190 |  7.0% |
| `REGIONAL`, by state        |        1 | 0.04% |

Split by source, that single number hides two completely different situations:

| Source                | Regional | Not regional | Unknown |
| --------------------- | -------: | -----------: | ------: |
| Adzuna                |      289 |          190 |      21 |
| Smart Jobs Queensland |        0 |            0 |   2,213 |

**Adzuna is solved.** 479 of 500 listings placed by postcode, 96%. The 21 that
are not are listings the provider gave no coordinates for.

One of them is worth recording because it shows the design working. A listing at
"West End, Geraldton" carries coordinates that fall in no postal area, presumably
just offshore of the boundary. No postcode was invented for it. The classifier
then fell back to the state rule, and because the instrument leaves no postcode
in Western Australia unlisted, it is still correctly `REGIONAL`, decided by
state. Degrading to a weaker basis rather than to a wrong answer is the whole
point of carrying the basis.

## Queensland was a different problem, and not a postcode one

Smart Jobs Queensland publishes no coordinates and no postcode. It publishes a
closed vocabulary of regions, and a listing can name **several of them at once**:
one row in the corpus names 23. That is a real statewide role, not bad data. It
has no single place, so it can have no single postcode, and no amount of
geocoding would give it one.

Of the 2,213 Queensland listings, 1,621 name exactly one region and 592 name
several.

### The threshold that was not needed

The obvious way to place a region is to intersect its boundary with the postcode
boundaries and see what overlaps. That needs a minimum-overlap threshold, or a
postal area clipping the edge of a statistical area by a few hectares makes an
entirely uniform region look mixed. Any threshold is a judgement about how much
error is acceptable in a statutory classification and would have to be published
wherever a listing rested on it.

No threshold was needed, because the ABS builds both structures out of the same
atoms. A mesh block is the smallest unit of the standard; every postal area is a
set of mesh blocks and every statistical area is a set of mesh blocks, and the
ABS publishes both allocations. Joining them on the mesh block gives the exact
relationship as the ABS allocated it, with nothing inferred and nothing to
threshold.

`npm run regional:build-regions` reads the two allocation spreadsheets, 368,286
mesh blocks, **none unmatched**, and writes one row per statistical area:

| Verdict                                  | Areas |
| ---------------------------------------- | ----: |
| `REGIONAL`, every postcode inside agrees |    63 |
| `NOT_REGIONAL`, none of them is          |    22 |
| `MIXED`, postcodes on both sides         |    23 |

### The mixed regions are the point

Queensland's eight mixed areas are exactly the ones a threshold would have
swept up, and two of them show why that would have been wrong:

- **Moreton Bay - North** is mixed on the strength of **one mesh block** out of
  3,339.
- **Darling Downs - Maranoa** is mixed on **five** out of 2,567.

Both look like rounding error and neither is. A threshold would have declared
them uniform and told a reader something the instrument does not say. They are
reported as mixed, and listings placed only by them stay unknown.

Brisbane behaves as the instrument does rather than as intuition does.
**Brisbane - North and Brisbane Inner City are uniformly not regional**, so
their listings are settled. Brisbane - East, South and West are mixed, because
the instrument lists outer suburbs such as 4019 to 4022 and 4076 to 4078 while
leaving the inner city out.

### Unanimity, applied twice

A region settles a listing only if every postcode inside it agrees, and a
listing naming several regions is settled only if every region agrees. The
second rule turned out to be a bonus rather than a restriction: multi-region
advertisements across a set of regional centres are unanimously regional and are
settled, which is why the result beat the 1,621 single-region estimate.

## Where the corpus stands

2,713 active listings:

| Answer         | Basis    | Listings | Share |
| -------------- | -------- | -------: | ----: |
| `REGIONAL`     | region   |    1,177 | 43.4% |
| `NOT_REGIONAL` | region   |      420 | 15.5% |
| `REGIONAL`     | postcode |      288 | 10.6% |
| `NOT_REGIONAL` | postcode |      190 |  7.0% |
| `REGIONAL`     | state    |        1 | 0.04% |
| `UNKNOWN`      | none     |      637 | 23.5% |

**2,076 of 2,713 settled, 76.5%**, up from 17.7% before the region rule and 5%
before postcodes. 1,466 listings are in a designated regional area, 610 are not,
and 637 cannot be placed and say so.

By source: Adzuna 479 of 500 (96%), Queensland 1,597 of 2,213 (72%). What
remains unsettled is almost entirely Queensland advertisements whose regions
disagree or are individually mixed, which is the honest answer for them.

## The order of the rules

Strongest first, and never overriding a stronger answer already given:

1. **Postcode.** The instrument's own unit.
2. **Region.** Unanimity among the postcodes in the areas named.
3. **State.** The instrument leaves no postcode in that state unlisted.
4. **Nothing.** `UNKNOWN`, which is an answer.

The basis is stored and will be published beside the answer. A listing settled
by region rests on unanimity across an area rather than on the postcode the job
is actually in, and a reader is entitled to know that.

One case shows the ordering working. A listing at "West End, Geraldton" carries
coordinates falling in no postal area, presumably just offshore. No postcode was
invented; it fell through to the state rule, and because the instrument leaves no
Western Australian postcode unlisted it is still correctly regional, decided by
state. Degrading to a weaker basis instead of a wrong answer is the whole reason
the basis exists.

## What changed

| File                                                         | Change                                            |
| ------------------------------------------------------------ | ------------------------------------------------- |
| `domain/regional.ts`                                         | Pure classification and the basis vocabulary      |
| `config/regional-areas.ts`                                   | The instrument's two tables, transcribed          |
| `config/sources.ts`                                          | `legislation-regional-areas`, ACTIVE and VERIFIED |
| `db/schema.prisma`                                           | Five enums, seven columns on `Location`           |
| `db/migrations/2026091022*`, `2026091023*`, `2026091100*`    | Three migrations, applied                         |
| `ingestion/regional.ts`                                      | Classifies stored locations, idempotently         |
| `ingestion/postcodes.ts`                                     | Places coordinates in postal areas                |
| `ingestion/region-inheritance.ts`                            | The region rule and its artefact                  |
| `scripts/build-region-postcodes.ts`                          | `npm run regional:build-regions`                  |
| `scripts/resolve-postcodes.ts`                               | `npm run postcodes:resolve`                       |
| `scripts/classify-regional.ts`                               | `npm run regional:classify`                       |
| `data/regional/statistical-area-postcodes-2021.json`         | The artefact, 32 KB, committed                    |
| `tests/regional.test.ts`, `tests/region-inheritance.test.ts` | 50 tests                                          |

Every script is dry run by default and idempotent. A location that already
carries a postcode is never overwritten, because a postcode the source published
outranks one derived from its coordinates.

## Still true

Nothing in the interface is labelled regional. The classification lives in the
database and no page reads it yet. `robots: noindex` stays set. Wiring it into
search and the front page is the next milestone, and it can now be built over a
corpus that is three quarters classified rather than one twentieth.
