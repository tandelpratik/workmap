# Setting up a development environment

Written for someone who has just been handed this repository and has not seen it
before. It assumes you can open a terminal and nothing else about you. Every
command is given in full, and every step says what it does and why the project
asks for it.

By the end you will have the site running on your own machine, against your own
database, holding real job advertisements that you fetched yourself.

Two documents sit either side of this one. [DEPLOYMENT.md](DEPLOYMENT.md) is the
same story for a deployed environment and goes deeper on the data passes.
[README.md](../README.md) at the repository root is the short version for
someone already familiar with the stack.

## What you need first

| Thing                 | Version                 | How to check     |
| --------------------- | ----------------------- | ---------------- |
| Node.js               | 20 or later. CI uses 22 | `node --version` |
| npm                   | 10 or later             | `npm --version`  |
| Git                   | Any recent version      | `git --version`  |
| A PostgreSQL database | 14 or later             | See step 3       |

Node and npm arrive together. If `node --version` prints nothing, or prints
something below 20, install the current LTS from https://nodejs.org.

**Nothing else is required.** No Docker, no Redis, no search cluster, no
container runtime. That is a deliberate constraint rather than a coincidence:
the project is built to run on free tiers, and adding recurring infrastructure
needs evidence that it is necessary. See the free-tier rules in
`.claude/CLAUDE.md`.

## 1. Get the code

```bash
git clone https://github.com/tandelpratik/workmap.git
cd workmap
```

## 2. Install the dependencies

```bash
npm install
```

This also generates the Prisma database client, because `postinstall` runs
`prisma generate`. Prisma reads `db/schema.prisma` and writes typed code into
`db/generated/`, which is why that directory is not committed: it is rebuilt
from the schema on every install.

You can prove the install worked before touching a database at all:

```bash
npm test
```

The suite should pass in around two minutes. It needs no database and no
credentials. If it passes, your toolchain is fine, and anything that breaks
later is configuration rather than setup.

## 3. Decide how you want a database

The application is built to run without one. It reports its database as
`not_configured` and renders honest "unavailable" states rather than crashing,
so you can skip this entire section if you are only working on layout or copy.

For anything touching search, listings or data, pick one of these.

| Option                 | Good for                        | Cost | Effort     |
| ---------------------- | ------------------------------- | ---- | ---------- |
| **Neon** (recommended) | Matching production exactly     | Free | 5 minutes  |
| **Local PostgreSQL**   | Working offline, fast iteration | Free | 15 minutes |
| **No database**        | Front-end work only             | Free | None       |

### Option A: Neon (recommended)

Neon is hosted PostgreSQL with a free tier, and it is what production uses
([ADR-0006](adr/0006-deployment-vercel-neon.md)). Using the same thing locally
means a problem you hit on your machine is a problem that is real.

1. Sign up at https://neon.tech and create a project. Choose the region closest
   to you. Production sits in `ap-southeast-2` (Sydney) to be near its users,
   but your development database has no such obligation.
2. Neon shows you a connection string. You need **two** of them, and they are
   different. The connection details panel has a toggle for **connection
   pooling**. Copy the string with pooling on, then copy it again with pooling
   off.

The two strings differ by one thing:

```text
pooled  postgresql://user:pass@ep-example-123456-pooler.ap-southeast-2.aws.neon.tech/dbname?sslmode=verify-full
direct  postgresql://user:pass@ep-example-123456.ap-southeast-2.aws.neon.tech/dbname?sslmode=verify-full
                                              ^^^^^^^ present on one, absent on the other
```

**Getting these the wrong way round is the easiest mistake here, and the
quietest.** Both appear to work. The pooled one is for the application, which
opens a connection per request and would otherwise exhaust the connection limit.
The direct one is for migrations, because some schema changes do not execute
correctly through a pooler.

Prefer `sslmode=verify-full` over `sslmode=require`. Current versions of the
Postgres driver treat them the same, but a coming major version will weaken
"require" to skip certificate verification.

### Option B: Local PostgreSQL

Install PostgreSQL 14 or later from https://www.postgresql.org/download/ and
create a database:

```bash
createdb workmap
```

On Windows, use pgAdmin or the SQL shell that ships with the installer, and
create a database named `workmap`.

Your connection string is then:

```text
postgresql://postgres:yourpassword@localhost:5432/workmap
```

There is no pooler locally, so the pooled and direct strings are the same
string. Set both variables to it.

## 4. Write your `.env`

```bash
cp .env.example .env
```

`.env` is ignored by Git and must stay that way. It is where credentials live,
and `.env.example` is the copy that gets committed, so never put a real password
in the example file.

Open `.env` and fill it in. Every variable is validated when the process starts,
by `config/env.ts`, so a typo stops the server with a message naming the
variable rather than surfacing as something strange an hour later.

| Variable                  | Needed for              | Notes                                                 |
| ------------------------- | ----------------------- | ----------------------------------------------------- |
| `APP_ENV`                 | Always                  | `development` on your machine                         |
| `DATABASE_URL`            | Anything with data      | The **pooled** string. Optional in development        |
| `DIRECT_DATABASE_URL`     | Migrations              | The **direct** string. Falls back to `DATABASE_URL`   |
| `LOG_LEVEL`               | No                      | `debug` is useful while you are learning the codebase |
| `ADZUNA_APP_ID`           | Adzuna listings only    | Free, see step 7                                      |
| `ADZUNA_APP_KEY`          | Adzuna listings only    | Free, see step 7                                      |
| `ADZUNA_COUNTRY`          | No                      | Defaults to `au`                                      |
| `OPERATIONS_SECRET`       | The ingestion API route | 32 characters minimum. Not needed for local scripts   |
| `ALLOW_SYNTHETIC_SOURCES` | No                      | Leave `false`. See the note in step 7                 |

A working development `.env` is small:

```bash
APP_ENV=development
LOG_LEVEL=debug
DATABASE_URL=postgresql://user:pass@ep-example-123456-pooler.ap-southeast-2.aws.neon.tech/dbname?sslmode=verify-full
DIRECT_DATABASE_URL=postgresql://user:pass@ep-example-123456.ap-southeast-2.aws.neon.tech/dbname?sslmode=verify-full
ALLOW_SYNTHETIC_SOURCES=false
```

Two rules about this file are not style preferences:

- **Never prefix anything `NEXT_PUBLIC_`.** That prefix tells Next.js to inline
  the value into the JavaScript sent to the browser, which would publish your
  credential to everyone who visits the page. The browser talks to this
  application; this application talks to providers.
- **An empty variable is not the same as an unset one.** `ADZUNA_COUNTRY=` with
  nothing after it fails a validation rule instead of falling back to its
  default. This once took down every route on a deployment. If you do not want a
  variable, delete the line or comment it out.

If you need `OPERATIONS_SECRET`, generate one rather than inventing it:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

## 5. Create the tables

```bash
npm run db:deploy
```

This applies the committed migrations in `db/migrations/` to your database, in
order, creating every table the application needs. It does not invent migrations
and it does not ask questions, which is what makes it the right command for a
database you are setting up rather than changing. Use `npm run db:migrate` only
when you are changing the schema yourself.

Then seed it:

```bash
npm run db:seed
```

**The seed writes the source registry and nothing else.** No job listings, ever,
by design. Every listing in this product came from a real advertisement
published by a real organisation, and a seed that invented a few for convenience
would put fabricated advertisements one mistake away from production. What the
seed does write is which data sources exist and what each is permitted to do,
mirrored from `config/sources.ts`. Ingestion refuses to write anything from a
source that is not registered and verified, so this step is what makes step 7
possible.

It is safe to run repeatedly. Every write is an upsert.

Confirm it worked:

```bash
npm run db:studio
```

Prisma Studio opens a browser table viewer at http://localhost:5555. You should
see a `Source` table with rows in it and everything else empty. Close it when you
are done; it holds a database connection open.

## 6. Load the geography

```bash
npm run geo:import
```

This reads `data/geography/registry-ASGS2026.json`, which is committed, and
writes the 155 Australian statistical areas into your database: the country, the
states, the capital city regions, and the SA4 regions beneath them.

You do not need to download anything from the ABS. The map's drawing data is
already committed under `public/geography/` as simplified TopoJSON, and the
registry above is the committed index of what those shapes are. The 223MB of
original ABS shapefiles that produced them are not in the repository and are not
needed unless you are rebuilding the geometry itself, which is what
`npm run geo:build` is for and which you will probably never run.

## 7. Get some real job advertisements

You have a schema and no listings. There is no fixture loader and no "generate
sample data" command, and that absence is the product's first rule rather than
an oversight: nothing in this system may fabricate a job listing. So you fetch
real ones.

### Queensland Smart Jobs, which needs no credentials

The easiest path. The Queensland Government job portal is public, so there is
nothing to sign up for:

```bash
npm run qld:ingest -- --max-requests=40
```

That gives you roughly 38 listings in about a minute. The crawler paces itself
at 1.5 seconds between requests because the portal publishes no rate limit and
never asked to be crawled, and the budget is a hard ceiling rather than a
suggestion: a run stops when it reaches it and leaves the rest for the next one.

Raising the budget is a decision about how much traffic to send someone else's
public service. For a development database, a few hundred listings is plenty:

```bash
npm run qld:ingest -- --max-requests=400
```

Expect that to take around half an hour, most of it spent waiting politely. Runs
are resumable by construction: listings are written in batches as they are
fetched, and anything already stored costs no request on the next pass.

### Adzuna, which needs a free key

Optional, and worth doing if you are working on anything that touches more than
one source.

1. Register at https://developer.adzuna.com/signup.
2. Put the application ID and key in `.env` as `ADZUNA_APP_ID` and
   `ADZUNA_APP_KEY`.

```bash
npm run adzuna:ingest
```

The default budget is 5 API requests, up to 250 listings. Adzuna's free
allowance is 25 requests a minute, 250 a day, 1,000 a week and 2,500 a month, so
the script takes a few pages and stops rather than paginating until the data
runs out.

**One rule travels with Adzuna data and it is not optional.** Their terms permit
this product to display their listings and forbid publishing aggregates derived
from them: no counts, no averages, no trends. Every published figure in the
product comes from Jobs and Skills Australia instead. If you find yourself
writing a query that counts Adzuna rows for display, stop and read the
[source register](compliance/SOURCE_REGISTER.md).

### A note on `ALLOW_SYNTHETIC_SOURCES`

You will see this flag and wonder whether it gives you test data. It loads
nothing. It registers a development-only source so the pipeline can be exercised
without a live provider. Leave it `false`. A process with `APP_ENV` set to
`production` and this flag on refuses to start, deliberately, because serving
invented vacancies to the public is a worse outcome than not booting
([ADR-0009](adr/0009-source-activation-and-synthetic-containment.md)).

## 8. Make the listings usable

Fresh listings are raw. Four passes turn them into what the product actually
shows, and none of them runs automatically.

Every one is idempotent, and every one dry-runs by default, printing what it
would change without changing it. **Run each without `--apply` first and read the
numbers.** The shape of the corpus is known well enough that a surprise is a bug
rather than a discovery: a reclassification pass reporting 2,713 changes where
about 15 were expected is exactly the signal that caught a real defect before it
rewrote the corpus.

```bash
npm run postcodes:resolve          # look first
npm run postcodes:resolve -- --apply

npm run regional:classify
npm run regional:classify -- --apply

npm run sponsorship:reclassify
npm run sponsorship:reclassify -- --apply

npm run skills:extract
npm run skills:extract -- --apply
```

Run them in that order. Each depends on the one above it.

| Pass                     | What it does                                                        |
| ------------------------ | ------------------------------------------------------------------- |
| `postcodes:resolve`      | Places published coordinates inside an ABS postal area              |
| `regional:classify`      | Decides whether each location is a designated regional area         |
| `sponsorship:reclassify` | Re-reads each advertisement for what it says about visa sponsorship |
| `skills:extract`         | Attaches the skills an advertisement names, with its own wording    |

Skipping one breaks nothing, which is precisely why it is worth being careful.
Every failure here is quiet and lands on the safe side: a regional search returns
nothing rather than returning the wrong thing.
[DEPLOYMENT.md](DEPLOYMENT.md) has the full table of what a reader sees when each
pass has not run.

## 9. Run it

```bash
npm run dev
```

Open http://localhost:3000. Search is the front page.

Check the plumbing at http://localhost:3000/api/health:

```json
{
  "status": "ok",
  "appEnv": "development",
  "buildId": "local",
  "checks": { "database": { "state": "ok", "latencyMs": 42 } },
  "syntheticSourcesAllowed": false
}
```

`"state": "not_configured"` means `DATABASE_URL` is unset. `"unreachable"` means
it is set and wrong, or the database is asleep; Neon suspends an idle free-tier
database, and the first query after that takes a few seconds to wake it.
`"status": "misconfigured"` returns HTTP 503 and lists the offending variable
names, never their values, because several of them are secrets.

## 10. The map figures, if you need them

The map and the labour market statistics read the Jobs and Skills Australia
Internet Vacancy Index, which arrives as a published Excel workbook. **That file
is not in the repository and cannot be fetched by a script.** The JSA site does
not respond to automated requests from this environment, and the open-data mirror
disallows automated access, so an operator supplies the file by hand. Ask the
product owner for the current release.

Once you have it:

```bash
npm run jsa:import -- data/raw/jsa-ivi/<file>.xlsx --dry-run
npm run jsa:import -- data/raw/jsa-ivi/<file>.xlsx
```

Without it, job search works completely and the map and statistics pages have no
figures to draw. That is a fine place to work from if you are not touching them.

**JSA IVI is never described as total Australian vacancies.** It is an indicator
of online job advertisements, and calling it anything else misrepresents the
source. The wording used throughout the product is deliberate.

## Before you commit

```bash
npm run check
```

That is format checking, lint including the architectural import boundaries,
TypeScript, and the full test suite, in one command, in about two minutes. CI
runs the same command, so passing locally means passing there.

If formatting is the only complaint:

```bash
npm run format
```

Two further checks need more than the repository:

```bash
npm run data:check     # data integrity, read-only, needs a database
npm run a11y:check     # accessibility, needs a running server
```

`data:check` is a set of checks over stored rows. It is read-only and safe to run
against any database at any time, including production, and it exits non-zero on
failure.

`a11y:check` walks every route looking for structural accessibility defects. Run
it against a built server rather than the development one, because the built
output is what readers actually get:

```bash
npm run build
npm run start
npm run a11y:check     # in a second terminal
```

## The rules that will trip you up

The binding rules are in `.claude/CLAUDE.md` and they override every other
document, including this one. Read it before your first change. The five that
catch newcomers most often:

1. **Never fabricate data.** Not job counts, not salaries, not coordinates, not a
   placeholder listing that could reach a real database. A value that does not
   exist is reported as unavailable, suppressed, or not covered, and never as
   zero.
2. **Check the source register before using any data.** Each source permits
   different things, and Adzuna permitting display while forbidding aggregates is
   a live constraint in everyday code rather than a footnote.
3. **Dependencies point inward.** `domain/` is the centre and imports nothing
   from outside itself. Provider-specific code lives in `integrations/`. Lint
   enforces this, so you will find out immediately, but knowing why saves you
   arguing with it.
4. **The product must not look like generic AI SaaS.** No gradients, no glowing
   cards, no sparkle icons, no oversized hero sections. The direction is
   editorial data journalism and modern cartography. See
   [DESIGN_SYSTEM.md](architecture/DESIGN_SYSTEM.md).
5. **"WorkMap" is a working brand, not a namespace.** Types are `Job` and `User`,
   routes are `/api/jobs`. A rename must be possible by changing configuration
   and assets alone.

## Troubleshooting

| Symptom                                             | Cause and fix                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `EnvironmentError` on startup, naming a variable    | A malformed value in `.env`. The message names the field. An empty value is not unset |
| Health says `not_configured`                        | `DATABASE_URL` is missing. Expected if you skipped step 3                             |
| Health says `unreachable`                           | Wrong connection string, or a sleeping Neon database. Try again in a few seconds      |
| A migration hangs, or a schema change behaves oddly | `DIRECT_DATABASE_URL` points at the pooled host. Remove `-pooler` from it             |
| Connection limit exhausted                          | The opposite mistake: `DATABASE_URL` set to the direct host. It needs `-pooler`       |
| Search returns nothing at all                       | Nothing ingested. Run step 7                                                          |
| Listings exist, regional search is empty            | `regional:classify` has not run with `--apply`. Run step 8                            |
| Every location reads "Location not established"     | The same thing. Step 8, in order                                                      |
| Ingestion refuses with `FORBIDDEN` about the source | The source is not registered. Run `npm run db:seed`                                   |
| Adzuna ingestion returns `FORBIDDEN`                | Credentials rejected. The client does not retry these, on purpose                     |
| Type errors about Prisma types after pulling        | The schema changed. Run `npm run db:generate`                                         |
| Tests pass locally, CI fails on formatting          | Run `npm run format` and commit the result                                            |
| A console error about a missing Adzuna logo         | Known. `public/adzuna-logo.png` must be added by hand before any public deploy        |

## What is deliberately not in the repository

Knowing what is missing on purpose saves you looking for it.

| Absent                   | Why                                                                              |
| ------------------------ | -------------------------------------------------------------------------------- |
| `.env`                   | Credentials. `.env.example` is the committed template                            |
| `db/generated/`          | Rebuilt from `db/schema.prisma` on every install                                 |
| `data/raw/`, `data/tmp/` | Hundreds of megabytes of ABS downloads and generated geometry, both reproducible |
| The JSA IVI workbook     | Supplied by an operator, see step 10                                             |
| `public/adzuna-logo.png` | Adzuna's terms require it and their site blocks automated download               |
| Any job listing fixture  | Nothing in this system fabricates a listing                                      |

## Where to read next

The documentation index is [docs/README.md](README.md), which carries a reading
order. The short version:

1. `.claude/CLAUDE.md`, the binding rules.
2. [ARCHITECTURE.md](architecture/ARCHITECTURE.md), how the system fits together.
3. [adr/README.md](adr/README.md), why it is shaped this way.
4. [SOURCE_REGISTER.md](compliance/SOURCE_REGISTER.md), what each data source
   permits.
5. [milestones/](milestones/), one record per completed step, newest last. These
   are the closest thing to a narrative history of the codebase, and each states
   what was built, what it caught, and what it deliberately left undone.
