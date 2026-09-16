# Showing what a job asks for, and two filters that were cancelling each other

Skill extraction shipped last milestone with nothing to show for it: 498
attachments across 403 listings, quoted and audited by three quality checks, and
no page that displayed one. This is the half that faces a reader. The listing
lines, the filter, the API parameter and the methodology section were built
together for the reason milestone 25 had to teach `/api/jobs` about `area`: a
filter the page has and the API does not is a product whose public interface
disagrees with its own pages.

The larger thing in the diff is not the skills.

## A search for Brisbane returned Brisbane, under a heading saying it had not

`searchJobs` built its `where` clause by spreading every filter into one object
literal. Two filters reaching for the same key therefore overwrote each other,
last one written winning, with nothing raised anywhere. Two pairs were doing it:

| Filters                          | Shared key | Effect                                    |
| -------------------------------- | ---------- | ----------------------------------------- |
| `regional` and `location`        | `location` | Any place search discarded the area       |
| `regional: 'UNKNOWN'` and `text` | `OR`       | Keyword search widened to the whole index |

The first is the serious one. The jobs page defaults to regional, prints
**"Showing advertisements in a designated regional area"** above its results,
and passes any location term straight through. So this, against the live corpus:

| Search                         | Returned | Of which regional |
| ------------------------------ | -------: | ----------------: |
| `area=regional&where=Brisbane` |      887 |                 0 |
| the same, now                  |        3 |                 3 |

887 listings were shown under a sentence asserting they were regional, each
carrying its own `RegionalNote` directly underneath saying it was not. The
product contradicted itself on the same screen, in the one claim it exists to
make.

The three that survive are real: Richlands and Darra, postcodes 4077 and 4076,
which the instrument does place inside a designated regional area despite having
Brisbane in their names. That is the filter working rather than a leak.

The fix is structural rather than a patch to either filter. Conditions now
accumulate in an array and are passed as `AND`, so no two can occupy the same
key and the class of bug is gone rather than the two known instances of it.
`skill` was going to be the third instance: it collides with nothing today, and
with whatever was added next.

### Why it survived five milestones

Because the collision produces a valid query returning plausible rows. There is
no error, no warning, no empty page and no log line. A reader searching Cairns
got Cairns listings; they were simply not all regional, which is visible only if
you read the label under every row and know it should have been impossible. It
was found by probing the filter combinations before adding a fourth to them, not
by anything failing.

`tests/job-filters.test.ts` holds the line, and was checked the way this
codebase checks things. The collision was reintroduced deliberately, by
replacing `{ AND: conditions }` with `Object.assign({}, ...conditions)`, which
reproduces last-one-wins exactly:

```text
collision reintroduced   5 of 8 failed
reverted                 8 of 8 passed
```

The three passing in both states are the ones exercising filters that never
shared a key. A test that fires on every mutation is not stronger than one that
fires on none.

## What a listing now says

A line under the sponsorship finding, naming what the advertisement's own text
named, with the advertisement's words beside it.

```text
NAMED IN THIS ADVERTISEMENT
Working with Children Check    "blue card"
Driver's licence               "C class driver's licence"
```

Not a row of tags. A skill here is a reading of a document, and a reading is
only checkable beside the words it was made from, which is the settlement the
sponsorship badge reached for the same reason.

**The quotation is printed only where it adds something.** "AHPRA" under "AHPRA
registration" shows a reader the wording that produced the label. "Working with
Children Check" under "Working with Children Check" is the same string twice.
Compared case-insensitively on collapsed whitespace, because a source writing
"FIRST AID" has not said anything different, and the rule earns its place: 340
of the corpus's 498 attachments differ by more than that. Where the words add
nothing the kind is shown instead, which is the one thing the label does not
say. "SAP" alone does not tell a reader it is a tool rather than a card.

The long ones are left long. Microsoft Excel attachments quote up to 70
characters, "Microsoft Dynamics (EOS), Word, PowerPoint, Outlook, SharePoint,
Excel", because that is the phrase-with-context rule visibly working, and
truncating an employer's sentence to tidy a card is not a trade this product
makes. The median is 14 characters and 48 of 498 exceed 40.

## The absence is the part that needed explaining

Six listings in seven carry no skill line, and a reader who sees three Blue Card
lines and then a bare listing will read the fourth as a job that does not need
one. It is far more often a job whose advertisement we hold two sentences of.

| Source                | Listings | Excerpts | Carrying a skill |
| --------------------- | -------: | -------: | ---------------: |
| Queensland Smart Jobs |    2,213 |        0 |      383 (17.3%) |
| Adzuna                |      500 |      500 |        20 (4.0%) |

Whether a listing names a skill is substantially a fact about how much of its
text this product is licensed to hold. So nothing renders where nothing was
found: no "none listed", no empty state, no reassuring absence, because each of
those would be a claim about an employer drawn from an excerpt. The page-level
key says it once, in words, where somebody wondering will look.

## The filter, and two different authorities

The control offers only skills some live advertisement actually names, read by
`listSkillsInUse`. The parameter is bounded against the vocabulary instead.

The two do different jobs, deliberately. **The vocabulary decides what a skill
is**, so an unrecognised value is dropped by the page and is a 400 from the API
naming the field. **The corpus decides what the control offers**, so a reader is
never shown a setting that cannot return anything. A hand-typed key the
vocabulary knows but no regional listing carries therefore reaches the search
and produces the ordinary empty state, which already names the area filter as
the likely cause. Six of the 22 entries are in exactly that position: Python has
six listings and none of them regional.

`listSkillsInUse` returns **no counts**, exactly as `listIndexedSources` returns
none, and for the same reason. A list of skills is a filter vocabulary; a list
of skills with a number beside each is a statistic about what employers are
asking for, drawn from a corpus that includes Adzuna listings, and their terms
reserve aggregation for a written licence. Even were it permitted the figure
would be worth little: 383 of the 403 skill-carrying listings are Queensland
Government vacancies, so any count would describe one state's public service
rather than a labour market.

One comparator, `compareSkills`, orders the listing lines, the control and the
API response. Credentials, then tools, then technical practice, each most
observed first, which is the vocabulary's own order. A key the vocabulary no
longer holds sorts last rather than first: retired entries keep their
attachments on purpose, and defaulting a lookup miss to -1 would have promoted
exactly the rows the product can no longer explain to the top of every list.

## An empty state describing a search nobody had run

`/jobs?skill=python` produced:

> Nothing in the index matches . Try a broader term, or clear the location.

A stray full stop, and advice to clear a location that had never been set. The
paragraph was assembled from the keyword and the location alone, so any search
narrowed by anything else fell through it. Reachable before this milestone by
filtering on employment type; made ordinary by a skill filter, which is a filter
people use on its own.

It now names the narrowings a reader phrased themselves, and gives advice about
something they actually set. Filters chosen from a control are not recited back,
because the control is still on screen showing what it is set to.

## Where the code went

`skills/kind.ts` became `domain/skill.ts`, and took `SkillAttachment` with it.

That move was forced by the first line of the feature rather than chosen. A
listing carries skill attachments, so `domain/job.ts` has to name a kind, and
the kind vocabulary was in `skills/` while `skills/extract.ts` imports
`domain/job.ts` for `normalizeCompanyName`. Importing it back would have left
the centre of the dependency graph reading from a module that reads from it, and
the architecture document's dependency table saying otherwise. Nothing would
have broken: `skills/kind.ts` imports nothing, so there was no runtime cycle,
and the lint boundary permits `domain/` to import `skills/`. It would simply
have made a documented rule false, which is how a documented rule stops being
followed.

The layout now matches the two features it is modelled on exactly. The
vocabulary, its reader-facing wording and the shape a listing carries are
`domain/skill.ts`, as they are `domain/sponsorship.ts` and `domain/regional.ts`.
What stays in `skills/` is the reading: the patterns, the evidence they produce,
and the rule that nothing is attached to a listing that does not mention it.

`JobSkill.method` is deliberately not selected into the attachment. Whether a human or the
batch pass attached a skill is an operational fact about this product rather
than a fact about the job, and publishing it would invite a reader to weigh two
attachments differently when the evidence for both is the same sentence.

One unrelated repair came with the new control. The search bar's grid draws its
dividers as its own background showing through a one pixel gap, which makes an
unoccupied cell a visible panel of rule colour rather than empty space. A single
hand-placed filler covered one arrangement of controls and had stopped being
right when a seventh was added; the padding is now counted per breakpoint.

## Verified

666 tests across 32 files, 24 data quality checks, no structural accessibility
findings across 19 routes including a new one that renders skill lines, and a
clean production build over 18 routes.

| Measure                                    | Result                              |
| ------------------------------------------ | ----------------------------------- |
| Filter collisions, reintroduced on purpose | 5 of 8 tests fired                  |
| Skills offered by the control              | 22                                  |
| `area=regional&where=Brisbane`             | 887 listings before, 3 after        |
| `area=unplaced&q=nurse`                    | 472 before, 114 after, all unplaced |
| Attachments quoting words worth showing    | 340 of 498                          |
| API rejects an unknown skill               | 400, `fields: ["skill"]`            |

## Still outstanding

**The sentence is not stored.** The extractor computes the whole sentence a
match sits in and `ingestion/extract-skills.ts` discards it, keeping only the
matched words. The milestone 26 write-up says "the attachment carries the
sentence", which describes the extractor rather than the column. Displaying the
sentence would be a stronger quotation than the phrase, and needs a migration
and a re-run; it is recorded in the backlog rather than done here, because an
interface milestone quietly changing the stored shape of 498 rows is how a data
change reaches production without anybody reviewing it as one.

**Aggregate skill analytics remain constrained** rather than merely unbuilt, and
unchanged from last milestone: the licence bars the aggregate, and what is left
would describe one state's public service.
