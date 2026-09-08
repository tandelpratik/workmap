# Baseline audit

A survey of what exists before the product upgrade begins. Nothing was changed
in the making of it. Its purpose is to stop the upgrade from rebuilding work
that is already done, and to name precisely what is not.

The short version: the data layer is in better shape than the product layer.
Provenance, licensing and lineage were built first and built well. What is
missing is almost entirely above them: the pages that explain the product to a
reader, the routes a search engine could index, and the last mile between a
correctly-modelled fact and a reader who can see it.

## 1. Current architecture

Next.js 16 (App Router) on Vercel, Postgres on Neon through Prisma 7, React 19,
Tailwind 4. Every page is a server component; the browser receives neither a map
library nor a search runtime.

Dependencies point inward, enforced by ESLint rather than convention (ADR-0001).
`domain/` is the centre and imports nothing outward. Provider vocabulary stops
at `integrations/`. This holds in practice, not just on paper.

Three data lineages are kept structurally separate and never combined into one
value: official (JSA IVI), derived (our own corpus), synthetic (fixtures, held
out of production by five independent mechanisms).

## 2. Existing routes

| Route                 | Kind  | Notes                                       |
| --------------------- | ----- | ------------------------------------------- |
| `/`                   | Page  | State choropleth, occupation ranking, links |
| `/map`                | Page  | 50-region SA4/GCCSA map with drilldown      |
| `/occupations`        | Page  | All 57 groups, ranked, with bars            |
| `/occupations/[code]` | Page  | One group across every region               |
| `/jobs`               | Page  | Server-rendered search, shareable URL       |
| `/api/jobs`           | Route | Validated query, attribution in the payload |
| `/api/health`         | Route | Configuration and database state            |
| `/api/ingest/adzuna`  | Route | Bearer-authenticated, fails closed          |
| `not-found`           | Page  | In-product, with a way back in              |

Absent: every legal route, `/methodology`, `/data-and-licensing`, `/report`,
`/contact`, `/locations/*`, `/compare`, `/insights`, `sitemap.xml`, `robots.txt`.

## 3. Existing data sources

| Source          | Compliance | Activation       | Aggregates | Role                      |
| --------------- | ---------- | ---------------- | ---------- | ------------------------- |
| `jsa-ivi`       | VERIFIED   | ACTIVE           | Permitted  | Every published figure    |
| `abs-asgs`      | VERIFIED   | ACTIVE           | Permitted  | Boundaries                |
| `smartjobs-qld` | VERIFIED   | ACTIVE           | Permitted  | Listings and aggregates   |
| `adzuna`        | VERIFIED   | ACTIVE           | **Barred** | Listings only             |
| `anzsco`        | UNVERIFIED | PENDING          | No         | Classification, unsettled |
| `jobs-wa`       | PROHIBITED | BLOCKED          | No         | Verified as refused       |
| `workday`       | RESTRICTED | BLOCKED          | No         | Per-employer terms        |
| `pageup`        | UNVERIFIED | BLOCKED          | No         | Challenge at the edge     |
| `iworkfor-nsw`  | UNVERIFIED | BLOCKED          | No         | Licence unestablished     |
| `careers-vic`   | UNVERIFIED | PENDING          | No         | Unmapped                  |
| `synthetic`     | UNVERIFIED | DEVELOPMENT_ONLY | No         | Fixtures                  |

The Adzuna aggregate bar is a real architectural constraint, not a note: their
terms permit publishing listings and reserve counts, averages and trends for a
written licence. `canPublishDerivedAggregates()` decides it once and the region
query refuses any source that fails it.

## 4. Existing licensing and attribution

Better than expected. `config/sources.ts` is a code-first registry that the
database mirrors through the seed, with a test asserting the two agree.
Attribution wording is stored verbatim so no layer can paraphrase a licence
condition. `docs/compliance/SOURCE_REGISTER.md` records the evidence behind each
status at length, including the reasoning on the Queensland licence version and
the Adzuna aggregate reservation.

`Colophon` renders attribution from the sources a page declares, which removed a
class of drift: the jobs page had previously credited Adzuna for Queensland
Government listings.

What is missing is structure rather than substance. The registry has one
`termsUrl` doing duty as both a licence deed and a terms-of-service link, and
the permissions that matter (commercial use, redistribution, adaptation, what
the licence excludes, when it was last verified, how the data is retrieved) live
only inside a prose `notes` string. A machine cannot read them, so nothing can
be asserted about them in a test or a CI gate.

## 5. Existing job ingestion

Idempotent and resumable (ADR-0005). Upsert on `(sourceKey, sourceId)`;
`contentHash` skips the write for an unchanged record and touches `lastSeenAt`
only. Validation failures are quarantined with their payload and the run
continues, so a source schema change is visible rather than silent.

Two live paths. Adzuna runs on Vercel Cron nightly. Queensland runs on GitHub
Actions because the crawler paces itself at 1.5 seconds a request and a 60
second function could never converge; the pacing was treated as a decision about
traffic sent to a public service, and the scheduler moved instead.

Lifecycle is real: `firstSeenAt`, `lastSeenAt`, `lastVerifiedAt`, `expiredAt`,
`retrievedAt` and a status enum. Seen and verified are deliberately distinct, and
an incomplete search walk expires nothing.

## 6. Existing privacy and security

Security is solid for the size of the system. Every environment variable is
validated at startup and a malformed one stops the server. Secrets are
server-side only and never `NEXT_PUBLIC_`. The ingestion endpoint fails closed
with no secret configured and compares credentials in constant time. Logging
redacts by key pattern inside the logger rather than at call sites. Security
headers are set globally. Zod parses every trust boundary.

Privacy has one real gap, and it is on the content side rather than the user
side: no personal information is collected from readers at all, but full
advertisement text from Queensland is stored and republished verbatim, and a
Queensland advertisement can carry a named contact with a direct phone number
and email address. Nothing detects or minimises that.

## 7. Existing SEO

Effectively none, and deliberately so: `app/layout.tsx` sets
`robots: { index: false, follow: false }` across the whole site, with a comment
saying it is removed at milestone 27. There is no `metadataBase`, no canonical
URL, no sitemap, no `robots.txt`, no structured data, and no Open Graph image.
`brand.domain` is `null`, which is the honest reason canonicals cannot be built
yet.

Page-level metadata is otherwise present and well written, and the semantic HTML
underneath it is good, so this is unbuilt rather than misbuilt.

## 8. Existing analytics

None. `analytics/` is aggregation of labour market data, not web analytics. No
third-party script of any kind is loaded, no cookie is set, and no client
JavaScript is shipped by most pages. This is a strength worth keeping: the
privacy policy that describes this system honestly is short.

## 9. UX strengths

- The design constitution is honoured rather than referenced. Warm paper and
  ink, hairline rules, one rust accent, typography-led hierarchy, no cards, no
  gradients, no glass. It does not look like AI SaaS.
- A complete night edition, derived rather than inverted, so "darker means more"
  survives the scheme change and the legend needs no rewording.
- Every map state has an equivalent table with the same figures.
- Missingness is visible everywhere. A partially-reported state is marked as one
  rather than silently totalled.
- Print styles are real; a research tool gets printed.
- The plate layout is genuinely cartographic, and the marginalia reorder sensibly
  on a phone rather than falling below fifty table rows.
- Sponsorship is quoted with the wording that produced it, never characterised.

## 10. UX weaknesses

- Four sections in the masthead, and no path to methodology, sources or anything
  legal. The footer names sources but links to no explanation.
- Freshness is ambiguous in exactly the way the upgrade brief describes. The jobs
  page shows one "Last retrieved" figure taken from Adzuna alone, and applies it
  to a page that may be showing Queensland listings. Individual listings show a
  posted date and never a verification date, though the data is held.
- No regional pages. A reader who clicks a state gets a filtered map, not a place
  with an overview.
- No comparison, no insights, no trend surface.
- Occupation list has no search across 57 groups.
- No sharing affordance beyond copying the address bar.

## 11. Compliance gaps

Ordered by how much they matter.

1. **No field-level rights position for job content.** The register verifies the
   licence covering a source; nothing records which _fields_ of an advertisement
   may be republished. Queensland's own caveat, that "unless otherwise noted"
   leaves an individual advertisement carrying third-party material outside the
   grant, is recorded in prose and enforced nowhere.
2. **No personal-information minimisation.** Full descriptions are stored and
   shown verbatim, and may contain a contact name, phone number or email.
3. **No legal pages.** Privacy, terms, disclaimer, data and licensing, report an
   issue, contact: none exist. There is no route by which a reader can report an
   expired listing, a privacy concern or a licensing complaint.
4. **No independence statement.** The site draws on Commonwealth and Queensland
   Government data without anywhere stating it is unaffiliated with them.
5. **Licence facts are prose, not data.** Commercial use, redistribution,
   adaptation, exclusions and verification dates cannot be asserted in a test.
6. **No compliance CI gate.** Every rule above is held by review and memory.
7. **No source health monitoring surface.** Runs and errors are recorded; nothing
   reads them back.
8. **README is materially stale.** It claims milestone 04 of 35 with no labour
   market data and no job listings, while the product serves both.

None of these is a data-integrity failure. The figures on the site are correct
and traceable. The gaps are in what the product tells a reader about itself.

## 12. Recommended implementation order

Follows the brief, adjusted for what is already built.

1. **Provenance and rights** — structured licence and rights on the registry, a
   field-level content rights matrix enforced by a gate, personal information
   minimisation at ingestion, a reusable attribution component, and freshness
   stated in the three distinct senses the data already holds.
2. **Legal and trust pages** — privacy, terms, disclaimer, data and licensing,
   report, contact, methodology, and the independence statement. Blocked on a
   contact address and a legal entity name, which must be supplied rather than
   invented (ADR-0007 keeps them `null` until they exist).
3. **Information architecture** — navigation and footer that reach all of it.
4. **Regional pages**, then **occupation depth**, then **job discovery**.
5. **Insights, comparison, trends** — trends only when a third reference period
   exists; two points are not a trend and the retention window currently keeps
   two (ADR-0010).
6. **SEO** — index only once the legal pages, canonicals and a real domain exist.
   Turning off `noindex` before then would publish a site that cannot answer for
   itself.
7. **Accessibility and mobile audit**, **performance**, **security review**.
8. **Data quality tests and a compliance CI gate**, which is what stops all of
   the above from decaying.
