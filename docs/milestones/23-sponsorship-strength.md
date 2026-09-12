# Six labels instead of four

`MENTIONED` said only that an advertisement had raised the subject. An employer
stating sponsorship is available and one who might consider it for the right
person were recorded identically, and that is the difference a reader deciding
whether to move house actually needs.

## The six

| Signal              | Label                         | What it reports                                                      |
| ------------------- | ----------------------------- | -------------------------------------------------------------------- |
| `OFFERED`           | Sponsorship offered           | States sponsorship is available, offered or provided                 |
| `OPEN_TO`           | Open to sponsorship           | States a willingness: "happy to sponsor"                             |
| `MAY_BE_CONSIDERED` | Sponsorship may be considered | Raises it as a possibility, or mentions it without saying how firmly |
| `EXCLUDED`          | Sponsorship not available     | States it is not available                                           |
| `NOT_MENTIONED`     | Not mentioned                 | The whole advertisement was read and says nothing                    |
| `INDETERMINATE`     | Description incomplete        | Only part of the advertisement is held                               |

## How competing wording is resolved

Strength is read per sentence and then across sentences, and the two directions
deliberately disagree.

**Within one sentence the strongest wording wins.** "Visa sponsorship is
available for the right candidate" says available; the qualifier narrows who,
not whether.

**Across sentences the weakest wins.** An advertisement whose benefits list says
"visa sponsorship" and whose body says "sponsorship may be considered case by
case" is making the second claim, and the first is a headline for it.

The asymmetry is not a matter of taste. Telling a reader an employer offers
sponsorship when the advertisement only floated the possibility may send them to
relocate or resign on a false basis. The reverse understates an employer whose
own sentence is printed directly beneath the label, where the reader can see it
and judge. The two errors are not the same size, so the tie breaks towards the
smaller one. A refusal still outranks everything.

A mention with no indication of strength at all, such as a bare "visa
sponsorship" in a list of benefits, takes the weakest affirmative reading for the
same reason. Reading it as an offer would be us supplying a commitment the
employer did not write.

## A refusal that was being dropped

"Sponsorship is not available for this role" has the word "not" sitting between
"sponsorship" and "available", so **no affirmative pattern matched it anywhere**.
The old detector found refusals only by negating an affirmative match, so the
clearest statement an employer can make on the subject was reported as no
statement at all, unless the sentence happened to contain the words "visa
sponsorship" adjacently.

Refusals are now their own patterns, matched first. Five advertisements that
previously read as "not mentioned" turned out to say something.

## The exact sentence, not a window

Evidence carried `context`: ninety characters either side of the phrase. A
window cuts mid-clause and can sever the very qualifier that decides what a
sentence means. "Sponsorship is available" and "sponsorship is available only to
applicants already holding full work rights" differ in exactly the part a fixed
window is most likely to lose.

It now carries `sentence`, bounded by punctuation. Where an advertisement has
none, which is common once a bulleted list has been stripped of its markup, the
quotation is trimmed to a window and marked with ellipses. The repository reads
both field names, because a reclassification run is a separate step from a
deployment and the gap between them is when a reader would otherwise see a label
with its quotation missing.

## "Verified" is gone

The word was doing two jobs on one page. Beside a date it meant "the source
still had this advertisement"; beside a quotation it meant "we found sponsorship
wording"; and a reader had no way to tell which sense was meant, nor that
neither was a statement about the employer or the applicant.

- `Verified 30 Aug 2026` is now `Listing checked 30 Aug 2026`
- `Adzuna verified` in the release strip is now `Adzuna last checked`
- `Quoted from the advertisement` is now `Sponsorship wording found in advertisement`

Every listing also carries an explicit **Read the original advertisement** link.
The title was already one, but a reader who has just read a quoted sentence is
being asked to take our word for it, and the answer to that is a way to go and
check rather than a heading they have to know is clickable.

## Two defects the tests did not catch

**Every row looked changed.** `sponsorshipFieldsFor` returns `Prisma.DbNull` to
write a SQL NULL, which is a sentinel object rather than `null`, so serialising
it and comparing against the `null` the database returns matched nothing. The
dry run reported all 2,713 rows as needing a rewrite, including the 2,698 whose
reading was identical. A pass written to touch only what moved was about to
rewrite the corpus. `updated` went from 2,713 to 15.

**One listing showed the same quotation twice.** Two patterns matched the same
words with different lengths ("sponsorship available" and "sponsorship available
for"). The text was long and unpunctuated, so each match fell back to a window
around itself, the two windows differed by four characters, and grouping by the
window rather than by the sentence treated them as two sentences. Worse than the
duplication: two windows meant two sentences, and "across sentences the weakest
wins" then dragged the listing's own tier down. Fixing the grouping key moved a
third listing into `OFFERED` where it belonged.

Neither showed up in 611 tests. Both showed up in the first page rendered against
the real corpus. Both now have a regression test.

## Applying it

The enum is rebuilt rather than extended, because Postgres cannot drop a value
from one. Old `MENTIONED` rows land on `MAY_BE_CONSIDERED`: the old label did not
record strength, so inventing one for historical rows would assert something the
detector never established. `npm run sponsorship:reclassify` then re-reads every
stored description and assigns the real tiers. It dry-runs by default and prints
the distribution it would produce, which is the cheapest way to notice a pattern
change that has quietly moved a thousand listings into the wrong tier.

Over the 2,713 listings held:

| Signal              | Count |
| ------------------- | ----- |
| `NOT_MENTIONED`     | 2,202 |
| `INDETERMINATE`     | 496   |
| `MAY_BE_CONSIDERED` | 10    |
| `OFFERED`           | 3     |
| `OPEN_TO`           | 2     |
| `EXCLUDED`          | 1     |

Fifteen of 2,713 advertisements say anything about sponsorship. That is worth
stating plainly rather than burying: the sponsorship filter is a thin slice of a
regional job board, not the point of it, which is why requirement 5 keeps every
regional listing whether or not sponsorship is mentioned.

A second run reports zero updates.

## Verified

611 tests, 16 data quality checks, 17 routes structurally accessible, a clean
production build, and each of the four evidenced tiers read as rendered against
the real corpus.
