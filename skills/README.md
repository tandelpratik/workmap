# Skills

Reading an advertisement for the skills it names.

Deterministic phrase matching against a controlled vocabulary. **A skill is
never attached to a listing that does not mention it**: nothing is inferred from
a job title, expanded from an occupation, or filled in because roles of this
kind usually want it. Every attachment carries the words that produced it
(`JobSkill.matchedText`) and how it was made (`JobSkill.method`), so a derived
figure can always be qualified by both.

That rule is stricter than it sounds. A wrongly attached sponsorship label
misrepresents an employer; a wrongly attached skill quietly removes a real job
from a real person's search results, or puts one in front of them they cannot
do. Both failures are silent, and the second is invisible even to us.

## Layout

| File            | What it holds                                                           |
| --------------- | ----------------------------------------------------------------------- |
| `kind.ts`       | The six kinds, mirroring the schema enum. A test asserts they agree     |
| `vocabulary.ts` | Every skill recognised, with its patterns and its measured corpus count |
| `extract.ts`    | The extractor, and the rule that an advertiser does not require itself  |

Nothing here imports from `db/`, `ingestion/`, `integrations/`, `app/` or
`components/`, and lint enforces it. This module reads text and returns what it
found; `ingestion/extract-skills.ts` is the part that knows where text is stored
and writes the results.

## The vocabulary is evidence, not imagination

Every entry was measured against the stored corpus before it was written, and
each carries the number of listings that mentioned it. This is a corpus of
Queensland public-sector health, care and trades advertisements, so the
vocabulary is credentials and licences first: AHPRA registration, a Blue Card, a
C class licence. A generic technology taxonomy would produce a facet that is
empty on almost every search this product serves.

**Phrases with context, never bare words.** The reasoning is the same as
`domain/sponsorship.ts` and it was not theoretical here either:

- `excel` matches 47 listings and only 21 mean the spreadsheet. The rest are
  "professionals who excel at critical thinking".
- `working with children` matched an early-childhood advertisement asking if you
  are "passionate about working with children", attaching a Blue Card
  requirement to a listing that never mentioned one.
- `ServiceNow` matches twelve listings, eleven of which want the platform and
  one of which is ServiceNow, Inc. describing itself.
- `R` as a language is one letter, and no context makes it safe. Measured at
  three listings and left out.

## What is deliberately not extracted

| Not extracted         | Why                                                                                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Soft skills           | "Leadership" appears in 776 of 2,713 listings, nearly all describing the role rather than asking anything. A filter matching 29 per cent of the corpus separates nothing                        |
| Occupations           | "Registered nurse" is the job, not a skill. Occupation classification is blocked on an open ANZSCO/OSCA licence question and must not be grown in here under another name                       |
| Qualification levels  | "Bachelor", "certificate III" say how much study, not what the holder can do. Worth extracting one day as their own field                                                                       |
| Vaccination status    | The most common requirement in the corpus at 269 listings, and health information about a person rather than a skill                                                                            |
| Required vs desirable | Advertisements are not consistent enough to support it. The corpus has mandatory requirements under a heading reading "Highly Desirable" and desirable ones under "Your mandatory requirements" |

## Running it

```bash
npm run skills:extract              # counts, writes nothing
npm run skills:extract -- --apply   # writes the attachments
```

Idempotent: a second run reports zero changes. The pass owns `DETERMINISTIC`
attachments only and never removes a `MANUAL` one.

Ingestion deliberately does not call the extractor. A listing arrives before
anyone has decided the vocabulary is right for it, and a pattern that turns out
to be wrong is far cheaper to fix in one pass than in a hook that has already
run on every import.

## What is not built yet

Nothing reader-facing. The attachments exist and no page shows them and no
filter uses them, which is the same order the regional classification was built
in: the data first, the interface once the data can be trusted.

**Aggregate skill analytics are constrained, not merely unbuilt.** Adzuna's
terms bar publishing aggregate figures derived from their listings, so any
"skills in demand" count would have to be drawn from Queensland Smart Jobs
alone, and Smart Jobs is Queensland Government vacancies rather than a picture
of any labour market. Per-listing display and filtering are unaffected: showing
what one advertisement says, and selecting listings by it, is not an aggregate.
See the [source register](../docs/compliance/SOURCE_REGISTER.md).

## Matching, not understanding

Two skills spelled differently are one row (`Skill.normalizedName`), which is
how a Blue Card and a Working with Children Check resolve together. Beyond that
there is no similarity, no embedding and no relatedness: "SQL" does not imply
"databases" and the extractor will never say it does. If matching a candidate to
a role is built later, it belongs here and it inherits this rule.
