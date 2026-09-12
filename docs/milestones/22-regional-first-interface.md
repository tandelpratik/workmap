# The interface reads the classification

Two milestones built a regional classification that no page looked at. This one
puts it in front of readers and makes regional job search the thing the site
does, rather than the thing it says it does.

## Search is the front page

Not a button promising search: the form itself, and the same form the search
page carries. The product exists so that somebody looking for regional work can
type what they do and where, once, instead of opening hundreds of postcodes.
Putting the form anywhere but the top would be describing that rather than doing
it.

It is deliberately not a cut-down hero form. A reduced version teaches a reader
one set of controls and then replaces them with a different set on the next
page, and the second copy has to be maintained every time a filter changes.

The labour market layer, which used to be the whole product, sits below it under
its own heading. It is kept because it answers a question the listings cannot,
and demoted because it is not what anybody came for.

## The area filter, and its default

`Area` sits beside `Location` rather than among the secondary filters, because
it qualifies the place and it is the question the product exists to answer.

| Value       | Meaning                                                         |
| ----------- | --------------------------------------------------------------- |
| `regional`  | In a designated regional area. **The default.**                 |
| `elsewhere` | Not in one, which in practice is Sydney, Melbourne and Brisbane |
| `unplaced`  | Could not be placed                                             |
| `all`       | Everywhere                                                      |

The default is real rather than an empty value that happens to behave like one,
and the page says in words what it has done: _"Showing advertisements in a
designated regional area. Change Area to see the rest."_ A filter that removes
roughly four listings in five has to announce itself rather than be inferred
from a select box a reader may never look at.

"Everywhere" is offered rather than withheld. A reader who wants to see what is
being left out is entitled to, and hiding the rest of the corpus would make the
size of the regional set impossible to judge.

`unplaced` is selectable in its own right. Advertisements the product cannot
place are not failures to be hidden; they are a fifth of the corpus, and a reader
is entitled to look at them knowing what they are.

## Every listing says how it was placed

A label alone would be our assertion about somebody's job advertisement. A label
with the postcode and the rule behind it is a lookup the reader can repeat
against a three-page instrument anyone can open.

> In a designated regional area: designated city or major regional centre
> (by postcode 4305, from coordinates)

> In a designated regional area (by region)

> Location not established

The basis is shown rather than smoothed away, because the three are not equally
strong. A listing placed by its postcode was looked up directly. One placed by
its region rests on every postcode in that region agreeing, which is exact but
is a statement about an area rather than about the job's own address. Flattening
them would tell a reader that two different things are the same.

"From coordinates" marks a postcode the source did not publish, found by
locating the coordinates it did publish inside an ABS postal area. The precedent
is the Jobsworth label on an estimated salary: the reader is told which kind of
figure they are looking at, in as few words as that takes. What that means, and
the ABS's own caveat that postal areas approximate Australia Post postcodes, is
explained once in the key rather than on every row.

## What the labels do not say

Nothing on any of these pages concerns a reader's own position. There is no
eligibility, no visa subclass, no "you would qualify". The labels describe where
a job is and which side of a published postcode table that puts it on. The
instrument is a migration instrument because that is who publishes the
definition of regional, not because anything here is advice.

The disclaimer from `config/legal.ts` now appears on the search page header and
the front page as well as in the footer, and the key names and links the
instrument so a reader can check any listing rather than take our word.
`tests/legal.test.ts` still fails the build on a phrase that crosses the line.

## Two defects found by running it

Neither showed up in tests, and both showed up in the first rendered page.

**The strip said "In the index: 1,466 listings"** over a regional-only result.
That states the size of the whole index and gives the size of part of it.
`hasQuery` counted explicit filters and the area default is not one, so a filter
removing four listings in five was invisible to the thing describing the
results. It now counts, which also fixes the empty state: a reader whose
regional search finds nothing was being told nothing had been ingested.

**Every card shipped its whole advertisement.** The card clamps to two lines in
CSS, so a page of twenty listings was sending twenty full descriptions of which
about 180 characters each were visible. Capped at 400 characters on a word
boundary, which is more than the clamp can ever show and a great deal less than
the source text, on a free tier that meters exactly that.

## Verified by running it

17 routes structurally accessible, 16 data quality checks passing, and the pages
read end to end against the real corpus rather than a fixture: the front page,
`/jobs`, and each of the four area settings.

## Still outstanding

`robots: noindex` stays set. The classification was one of three things gating
it; the legal pages are the others, and they are still blocked on a legal name
and a contact address that do not exist yet. See the
[backlog](../BACKLOG.md).
