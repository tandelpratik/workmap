# Methodology, licensing and a way to reach them

Three things: a page explaining how every figure is made, a page saying where
each one came from and what the licence permits, and a site footer so both can
be found.

The product's claim is that a reader can get from a number to its source, its
reference period, the arithmetic applied to it and its licence without
ambiguity. Until now that chain existed in the code and in `docs/`, and a reader
had a one-line attribution in a footer. These are the pages where it is written
down for the person it was built for.

Neither is blocked on brand identity, which is why they come before privacy and
terms. Explaining a dataset needs no legal entity; explaining who is collecting
your data does.

## Licensing is generated, not written

`/data-and-licensing` is rendered from the source registry. That is the whole
design of the page.

A hand-written licensing page is a second copy of the registry, and a second
copy is a thing that drifts. The moment a licence is re-read, a source changes
state, or a permission is corrected, the page and the truth part company, and
the page is the half a reader sees. Here they cannot differ, because there is
only one of them: the page consults the same descriptors the software consults
before it displays anything, so it is structurally unable to describe a
permission the system does not hold.

Making the licence structured in milestone 20 was what made this possible. Prose
in a `notes` field could not have rendered a table.

It includes the sources this product **does not** use. A register listing only
the permissions granted reads as a sales document; the refusals are what make
the grants credible. "We read Western Australia's terms and they do not permit
this use" is a more useful sentence than any assurance, and it is on the page.

The field matrix renders straight from `jobContentRights`:

```text
Field                     Adzuna           Smart Jobs and Careers
Job title                 Reproduced       Reproduced
Salary                    Reproduced       Reproduced
Closing date              Not established  Reproduced
Advertisement text        Reproduced       Reproduced
Contact details           Withheld         Withheld
Employer logo             Withheld         Withheld
Application instructions  Withheld         Withheld
```

## Methodology reads the live release

`/methodology` states the current reference period, the number of regions and
occupation groups, and the freshness thresholds by reading them rather than
having them typed in. A methodology page stating a figure the system no longer
holds is worse than one stating none, because it is checkable and wrong.

Ten sections, and the ones that matter most are the negative ones. What the site
does **not** measure gets as much room as what it does, because the failure mode
of a labour-market product is a reader treating an advertisement count as a
vacancy count, and the only defence is saying so plainly and repeatedly:

> An advertisement is the unit. Not a vacancy, not a hire, not a person.

Limitations are a section rather than a footnote, and they include the ones that
are least flattering: coverage is partial by construction, listings are not
representative, state totals are ours rather than the publisher's, there are no
trends yet, occupation mapping is incomplete, and the publisher offers no
warranty.

The sponsorship section explains the four labels including "Not known", which
carries most of the weight because it sits on the majority of listings. Absence
of evidence is not evidence of absence, and the label exists so the two are not
confused.

## A footer, at last

`Colophon` credits the sources a particular page drew on and belongs to that
page. Nothing did the other thing a footer does, which is say what else is here,
so the two new pages would have been unreachable.

`SiteFooter` renders from the root layout, since it has no per-page state,
unlike the masthead which has to know its current section. Two columns, Explore
and Data, plus the independence statement.

There is no Legal column. There are no legal pages yet, and a heading over a
"coming soon" is worse than no heading.

## A new deploy gate

`rights.listing-content-described` joins the quality checks: every
production-eligible listing source must state a position on the fields a listing
is useless without.

The field gate already fails closed, so an undescribed source publishes nothing
rather than something it should not. This is the other half. A source reaching
production with no rights matrix has silently become a source whose listings
appear as a title and nothing else, and the licensing page would describe it as
establishing nothing. Both are bugs, and neither raises an error.

16 checks now, all passing.

## Files

| Path                                | Change                           |
| ----------------------------------- | -------------------------------- |
| `app/data-and-licensing/page.tsx`   | New. Generated from the registry |
| `app/methodology/page.tsx`          | New. Reads the live release      |
| `components/layout/prose.tsx`       | New. Long-form primitives        |
| `components/layout/site-footer.tsx` | New. Rendered by the root layout |
| `app/layout.tsx`                    | Flex column, footer at the foot  |
| `analytics/quality.ts`              | The listing-content gate         |

## Checks

`npm run check` clean: Prettier, ESLint, TypeScript, 488 tests. `npm run build`
succeeds, with `/data-and-licensing` prerendered since it is pure registry data.
`npm run data:check` passes 16 of 16. Every table-of-contents anchor on both
pages verified to resolve, and the footer verified present on all seven routes.

## Not done here

- Privacy, terms, disclaimer, report and contact. Still blocked on brand
  identity; see [BACKLOG.md](../BACKLOG.md).
- `/methodology#corrections` says a reporting route is not yet published rather
  than inventing one. It names the route the moment one exists.
- Indexation stays off. These pages were a precondition for turning it on, not
  the whole of it: canonical URLs still need a domain.
