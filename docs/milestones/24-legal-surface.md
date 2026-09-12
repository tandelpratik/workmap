# The legal surface, in one place

The product's name invites a reader to believe things it does not say: that an
employer has been checked, that a visa is likely, that somebody here knows their
position. The footer disclaimer on every page is the short answer. This
milestone gives it somewhere to point, and removes the last places where the
same statement was being written out by hand.

## A page for the boundary

`/what-this-is` sets out what the product does, what it refuses to do, what the
two labels mean, and who it is not. Every legal string is read from
`config/legal.ts` rather than written into the page, for the reason the licence
attribution is read from the source register: a statement each page is free to
reword is a statement that will eventually be reworded into something else.

It is deliberately not a privacy policy or a set of terms, and it says so at the
foot. Both need a legal entity and a contact address, neither of which has been
established, and writing them around a blank would be worse than not having
them. Nothing on the page is a promise on behalf of an entity: every sentence is
a description of what the software does or a statement of what it refuses to do,
and both are true regardless of who operates it.

## A sentence that had already fallen behind

Three hand-written copies of the independence statement sat in the colophon, the
methodology page and the licensing page. All three enumerated Jobs and Skills
Australia, the Australian Bureau of Statistics and the State of Queensland.

Then the Federal Register of Legislation became a source, and all three were
silently incomplete: they named three publishers and implied there were no
others. Nobody would have noticed, because the sentence still reads perfectly
well.

So the wording no longer enumerates. It disclaims any organisation whose
material the product carries, and the colophon beside it names the ones that
particular page drew on. A generic sentence next to a specific list is both
complete and incapable of falling behind the register. One string, four call
sites.

## A methodology page describing labels that no longer existed

The sponsorship section wrote out four label definitions by hand: "Sponsorship
mentioned", "Sponsorship excluded", "Not mentioned", "Not known". The signal had
been split six ways the milestone before, so the page was describing an
interface the product no longer had.

A methodology page stating something the system no longer does is worse than one
stating nothing, because it is checkable and wrong. Both label sets are now
rendered from the domain's own lists and the domain's own wording, so a new
signal cannot reach the product without reaching its explanation:

- the six sponsorship signals, from `sponsorshipSignals` and
  `sponsorshipMeaning`
- the three placements and the three bases, from `regionalStatuses`,
  `classificationBases` and `regionalBasisExplanation`

A new **Where a job is** section covers the instrument, the three placement
rules and the ABS postal area caveat, which had no methodology entry at all
despite being the classification the whole product turns on.

## Verified

611 tests, 16 data quality checks, 18 routes structurally accessible, a clean
production build, and `/what-this-is` and `/methodology` read end to end as
rendered.

## Still outstanding

`robots: noindex` stays set, and now has exactly one thing left behind it: a
legal entity and a contact address, which would let the privacy policy and terms
of use be written. Everything else that gated indexation has landed.
