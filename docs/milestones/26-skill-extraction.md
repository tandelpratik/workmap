# Reading what a job actually asks for

`skills/` had been a directory with a README and no code since the scaffold: a
boundary held open so that when extraction was built it would have a place with
a stated rule, and so nobody would put it in `ingestion/` by default. The rule
was written down before the code existed. This milestone builds the code and
keeps the rule.

**A skill is never attached to a listing that does not mention it.** Nothing is
inferred from a job title, expanded from an occupation, or filled in because
roles of this kind usually want it.

That is stricter than the sponsorship detector's equivalent rule, and
deliberately so. A wrong sponsorship label misrepresents an employer, which is
bad and is visible: the quotation sits underneath it. A wrong skill quietly
removes a real job from a real person's search, or puts one in front of them
they cannot do, and nobody ever sees it happen.

## The vocabulary was measured, not imagined

Every entry was counted against the stored corpus before it was written, and
each carries its observed frequency in the file. The counts go stale and nothing
reads them; they are evidence of how the list was arrived at.

The corpus decided the shape. This is Queensland public-sector health, care and
trades work, so the vocabulary is credentials and licences first:

| Skill                       | Listings |
| --------------------------- | -------: |
| AHPRA registration          |      142 |
| Driver's licence            |       99 |
| Working with Children Check |       67 |
| Microsoft Office            |       39 |
| Criminal history check      |       29 |
| Microsoft Excel             |       25 |

403 of 2,713 listings carry at least one skill, 498 attachments across 22
recognised skills. A generic technology taxonomy would have been the obvious
thing to write and would have produced a facet that is empty on almost every
search this product serves: Python appears in six listings, AWS in one,
JavaScript in none.

## Four things the real corpus caught

None of these would have been found by testing against invented examples, and
three of them were shipping-quality bugs.

**"Excel" is a verb.** 47 listings contain the word and 21 mean the spreadsheet.
"Professionals who excel at critical thinking" is not a Microsoft Office
requirement. The pattern now needs a neighbouring word (Word, Outlook,
spreadsheet, Office) before a bare "Excel" counts, which is the same
phrase-with-context doctrine `domain/sponsorship.ts` arrived at for "visa".

**"Working with children" describes the work.** The bare phrase attached a Blue
Card requirement to an early-childhood advertisement asking whether you are
"passionate about working with children". The phrase is now only a credential
when followed by check, card, clearance or screening.

**An advertiser does not require itself.** Twelve listings mention ServiceNow.
Eleven are Queensland Health roles wanting the platform; the twelfth is
ServiceNow, Inc. describing itself as "the AI control tower for business
reinvention". `extract.ts` suppresses a skill for an employer whose own name
contains it, compared through the same normalisation the deduplicator uses so
that "ServiceNow, Inc." and "ServiceNow" are one name. It fires exactly once on
the corpus and leaves the other eleven alone.

**A pattern that looked right and matched nothing.** `/\bclass C \(car\)\b/i`
cannot match "Class C (car) motor vehicle", because a word boundary after ")"
demands a word character next and the text has a space. It went unnoticed
because the single listing containing that phrase also says "Driver Licence"
earlier, so the skill attached anyway and the corpus count looked correct. A
unit test on the sentence alone found it.

## A fix that reaches further than this milestone

`plainText` decoded `&nbsp;` and five named entities and left numeric ones
alone. **1,811 of the 2,713 stored listings carry at least one numeric entity**,
`&#160;` appearing 11,067 times and `&#8226;` 1,394 times.

Those were not cosmetic. `plainText` produces the text that sponsorship
quotations are cut from, so listings on the live site have been showing readers
sentences with literal `&#160;` in them. It now decodes decimal and hexadecimal
entities, after tags are stripped, which is also what makes it safe: a decoded
`&lt;` cannot reopen a tag that has already been removed. Out-of-range and
surrogate code points are left as written rather than replaced with a
substitution character, because text a source wrote badly is still the source's
text.

This was outside the milestone as scoped. It is in it because skill extraction
quotes the same sentences, and fixing it for the new feature while leaving the
old one broken would have been a strange thing to choose.

## Where the code went

`plainText` and `sentenceAt` moved from `domain/sponsorship.ts` to a new
`domain/text.ts`, re-exported from their old home so the existing tests and
callers are untouched. Skill extraction needs both, and what a sentence is has
nothing to do with visas: the alternative was `skills/` importing the
sponsorship module to find out where a full stop is.

`skills/` now has a lint boundary like `domain/`, `components/`, `integrations/`
and `lib/` before it.

(`skills/kind.ts` later moved to `domain/skill.ts`, in
[milestone 27](27-skill-surface.md), so that a listing could carry a skill
attachment without the domain importing the module that imports it. The
patterns and the reading stayed here.) It may not import from `db/`, `ingestion/`,
`integrations/`, `app/` or `components/`. It reads text and returns what it
found; `ingestion/extract-skills.ts` is the half that knows where text is stored.

## The pass

`npm run skills:extract`, dry by default, `--apply` to write. Idempotent, and
the second run reports `changed: 0` rather than rewriting 498 rows.

Two decisions in it are worth naming:

**It owns `DETERMINISTIC` attachments only.** A `MANUAL` row is never removed,
however sure the extractor is that it does not belong. Somebody put it there on
purpose, and a batch job silently reversing a human decision is how people stop
trusting the batch job.

**`Skill` rows mirror the vocabulary, including entries nothing mentions.**
Creating a row the first time something matches would make the taxonomy a
function of whatever has been ingested, so the same vocabulary would build
different tables on two machines and "no listings have this" would be
indistinguishable from "this is not recognised". Rows whose vocabulary entry has
been withdrawn are reported rather than deleted, because they still hold
attachments and cascading those away on an unrelated run destroys evidence
quietly.

## Three checks, each broken on purpose

`analytics/quality.ts` goes from 21 checks to 24.

| Check                         | Asserts                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| `skills.attachment-evidenced` | Every attachment quotes the words that produced it                 |
| `skills.vocabulary-in-step`   | The table matches the vocabulary in name and kind, both directions |
| `skills.matches-vocabulary`   | Every stored attachment is one the vocabulary still reads          |

`skills.matches-vocabulary` is the one that earns its keep, and it is the skills
equivalent of `regional.matches-instrument`. The unit tests assert the
vocabulary behaves correctly on text written to exercise it. This asserts the
corpus was read by the vocabulary the code currently holds, which is a different
claim and the one that goes stale: tightening a pattern without re-running the
pass, the redaction sweep rewriting a description out from under an attachment
derived from it, or a re-import replacing a description.

The last milestone shipped the lesson that a check passing the moment it is
written is a check nobody has tested, so each was broken against the real
database and reverted in a `finally` block. The mutations were put on different
rows on purpose, so that each failure is attributable to its own cause rather
than to whichever break happened to come first:

```text
phase 1 (B + name)   attachment-evidenced=PASS  matches-vocabulary=FAIL  vocabulary-in-step=FAIL
phase 2 (A null)     attachment-evidenced=FAIL  matches-vocabulary=FAIL  vocabulary-in-step=PASS
reverted             attachment-evidenced=PASS  matches-vocabulary=PASS  vocabulary-in-step=PASS
```

The `PASS` entries carry as much weight as the `FAIL` ones. A check that fires
on every mutation is not narrower than one that fires on none.
`matches-vocabulary` failing in both phases is correct rather than sloppy: a
missing quotation is also not a quotation the vocabulary would produce.

## Deliberately not extracted

Four categories, each with a reason rather than an omission.

**Soft skills.** "Leadership" is in 776 of 2,713 listings and "communication
skills" in 212, and the matches are the furniture of job advertisements rather
than requirements: "your next leadership opportunity", "a hands-on leadership
team", "this is an incredible leadership position". A filter matching 29 per
cent of the corpus separates nothing from nothing.

**Occupations.** "Registered nurse" is in 216 listings and is the job rather
than a skill. Occupation classification is blocked on an open ANZSCO/OSCA
licence question, and growing an occupation taxonomy inside a skills vocabulary
would route around that rather than resolve it.

**Qualification levels.** "Bachelor", "certificate III" say how much study a
role wants, not what the holder can do. Their own field one day.

**Vaccination status.** The single most common requirement in the corpus at 269
listings, and health information about a person rather than a skill.

**Required against desirable** is not distinguished either, and cannot honestly
be: the corpus has mandatory requirements under a heading reading "Highly
Desirable" and desirable ones under "Your mandatory requirements". The
attachment carries the sentence and lets a reader judge, which is the settlement
the sponsorship module reached for the same reason.

## Verified

649 tests across 30 files, 24 data quality checks, a clean production build over
18 routes, and the extraction run end to end against the real corpus:

| Measure                          | Result                                      |
| -------------------------------- | ------------------------------------------- |
| Listings examined                | 2,713                                       |
| Listings carrying a skill        | 403                                         |
| Attachments written              | 498, all `DETERMINISTIC`, none without text |
| Skills recognised                | 22                                          |
| Second run                       | `changed: 0`                                |
| Quality checks broken on purpose | 3 of 3 fired, 0 false alarms                |

The sponsorship reclassification was re-run afterwards, because the entity fix
changes the text quotations are cut from. Two stored rows moved and a second
dry run reports none left, which is the expected size: evidence is only stored
for the 15 listings whose wording was actually found, not for the 2,698 that say
nothing either way.

## Still outstanding

**Nothing reader-facing.** No page shows a skill and no filter uses one. That is
the same order the regional classification was built in: the data first, the
interface once the data can be trusted. It is the obvious next milestone, and
`/api/jobs` should learn the filter at the same time, for the reason the last
milestone had to teach it `area`.

**Aggregate skill analytics are constrained rather than merely unbuilt.**
Adzuna's terms bar publishing aggregate figures derived from their listings, so
a "skills in demand" count could only be drawn from Queensland Smart Jobs, which
is Queensland Government vacancies and not a picture of any labour market.
Per-listing display and filtering are unaffected: showing what one advertisement
says, and selecting listings by it, is not an aggregate.

**The vocabulary covers this corpus.** It will need extending as sources grow,
and the honest way to extend it is the way it was built: measure first.
