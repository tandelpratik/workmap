# Milestone 04a: JSA IVI licence verification

- **Date:** 2026-08-28
- **Trigger:** Launch-blocking compliance item, unresolved since milestone 01a
- **Outcome:** Verified. JSA IVI is production eligible on the licence question.

## How it was obtained

The JSA site is unreachable from the development environment: the connection and
TLS handshake complete, then no HTTP response arrives. That is an
application-layer block and was not worked around. The product owner supplied
the contents of `jobsandskills.gov.au/copyright-and-disclaimer` directly.

The access block itself is unchanged. Any future JSA page this project needs has
to be supplied the same way, or fetched from somewhere that can reach it. That
matters for milestone 05, which needs the IVI data files themselves.

## Finding

**Creative Commons Attribution 4.0 International**, stated plainly:

> All content on the Jobs and Skills Australia website is provided under a
> Creative Commons Attribution 4.0 International Licence with the exception of:
> content supplied by third parties, the Commonwealth Coat of Arms, material
> protected by a trade mark, any images and/or photographs.

Commercial use, redistribution and adaptation are permitted with attribution.
Required wording is "© Commonwealth of Australia"; CC BY 4.0 adds a licence
notice, a link, and an indication of changes, which applies because the product
aggregates and reformats.

Note the exclusion of **all images and photographs**, which is broader than the
ABS exclusion list. Nothing visual from the JSA site may be reused.

## One clause that needed a judgement

Under an "Attribution" heading the page also says:

> You may link to this website at your full expense and responsibility. In doing
> so you must not alter any of the website's contents, frame or reformat the
> files, pages, images, information and materials from this website on any other
> website.

Read in isolation, "reformat the ... information and materials ... on any other
website" would forbid exactly what this product does. Read in context it is
scoped by "In doing so", meaning while linking, and concerns framing and
mirroring their pages rather than reuse of CC BY licensed data. The readings are
not compatible, and the CC BY grant above it explicitly permits adaptation and
is irrevocable once given.

I have taken the contextual reading and recorded operating rules that satisfy
either one: never frame, iframe or mirror JSA pages; reuse the data rather than
their presentation of it; always attribute and state that figures were adapted.

**Recommended before monetisation:** a one-line written confirmation from
`copyright@dewr.gov.au`. `07_COMMERCIAL_READINESS.md` requires commercial rights
to be verified before monetisation, and this is the only ambiguity left in the
entry. It does not block development.

## Also recorded

**No warranty.** JSA makes no representation about accuracy, reliability,
currency or completeness. The product must not present IVI figures as guaranteed
accurate, and must show reference periods so a reader can judge currency. This
reinforces the labelling rules already in ADR-0002.

## Changes made

- `docs/compliance/SOURCE_REGISTER.md`: `jsa-ivi` moved to `VERIFIED` with the
  twelve answers, attribution wording, exclusions, the linking clause and the
  operating rules. The earlier failed-attempt record was left in place and its
  conclusion corrected, so the history of how this was resolved stays readable.
- `config/sources.ts`: `jsa-ivi` set to `VERIFIED` with attribution stored
  verbatim.
- `tests/source.test.ts`: the exact eligibility list is now
  `['jsa-ivi', 'abs-asgs']`.

## Verification

| Check                                        | Result                                   |
| -------------------------------------------- | ---------------------------------------- |
| `npm run db:seed`                            | 5 sources updated, database matches code |
| `vitest run`                                 | 93 tests, all pass                       |
| `eslint`, `tsc --noEmit`, `prettier --check` | Pass                                     |

The eligibility test failed on the way through, as intended, and required a
deliberate edit naming the newly eligible source.

## What remains

1. **Which ASGS edition the IVI SA4 series uses.** Not a licence question. It
   lives in the IVI methodology page, which was not supplied. This determines
   whether milestone 05 joins to Edition 4 or must also load Edition 3, and
   joining to the wrong one would mislabel geography.
2. **How milestone 05 obtains the IVI data files**, given the site is
   unreachable from here.
3. **ANZSCO against OSCA**, at milestone 11.
4. **Adzuna access.** Unchanged, no timeline, does not block launch.
