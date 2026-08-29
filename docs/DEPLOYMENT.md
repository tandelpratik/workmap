# Deployment

Vercel for the application, Neon for the database, per
[ADR-0006](adr/0006-deployment-vercel-neon.md).

## Before the first deploy

**One thing blocks a public deploy.** `public/adzuna-logo.png` is missing.
Adzuna's terms require their logo image in the attribution on every page showing
their advertisements, and their site returns HTTP 403 to automated requests, so
it has to be saved by hand from https://www.adzuna.co.uk/press.html. Until it is
there the application logs an error on every render and the page is not
compliant with the licence it depends on. A password-protected or `noindex`
deployment is a reasonable place to stand while that is sorted; a public one is
not.

The site currently sends `robots: noindex` from `app/layout.tsx`. That is
deliberate and stays until milestone 27.

## Environment variables

Set these in the Vercel project, for the Production environment. None of them
may be prefixed `NEXT_PUBLIC_`: that prefix inlines a value into the browser
bundle, which would publish the credential.

| Variable                  | Required     | Notes                                                                                       |
| ------------------------- | ------------ | ------------------------------------------------------------------------------------------- |
| `APP_ENV`                 | Yes          | `production`. Distinct from `NODE_ENV`, which cannot tell a preview from production         |
| `DATABASE_URL`            | Yes          | **Pooled** Neon string. The host contains `-pooler`                                         |
| `DIRECT_DATABASE_URL`     | Yes          | **Direct** Neon string, no `-pooler`. Used by migrations only                               |
| `ADZUNA_APP_ID`           | For listings | Without it the site runs and reports that no provider is configured                         |
| `ADZUNA_APP_KEY`          | For listings | Server-side only                                                                            |
| `ADZUNA_COUNTRY`          | No           | Defaults to `au`                                                                            |
| `OPERATIONS_SECRET`       | For cron     | Minimum 32 characters. Protects the ingestion endpoint                                      |
| `ALLOW_SYNTHETIC_SOURCES` | No           | Must be `false` or absent. A production process with it enabled refuses to start (ADR-0009) |
| `LOG_LEVEL`               | No           | Defaults to `info`                                                                          |

Getting the two connection strings the wrong way round is the easy mistake, and
a quiet one: both appear to work. Pooled for the application, direct for
migrations.

Generate the operations secret with:

```
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

## Which database

The simplest first deploy points production at the database already in use
locally, which is already migrated, seeded and holding real listings.

**The hazard that comes with it:** `npm run db:reset` on a developer machine
would destroy production data, because it is the same database. If you take this
route, treat `db:reset` as forbidden while it holds.

The cleaner arrangement is a Neon branch for production, which costs one seed and
one ingest to populate:

```
npm run db:deploy      # apply migrations
npm run db:seed        # source registry only, never fixtures
npm run adzuna:ingest  # 5 API requests, up to 250 listings
```

The seed writes the source registry and nothing else, by design: no job listings
are ever seeded, so production cannot be populated with fabricated data.

## Deploying

The repository has no git remote yet. Either push it to GitHub and import the
project in Vercel, or deploy from this machine:

```
npx vercel login
npx vercel link
npx vercel --prod
```

Vercel runs the `vercel-build` script in preference to `build`, which is
`scripts/vercel-build.mjs`. Migrations are applied at deploy and never at
runtime (ADR-0006), but **only on a production deployment**.

That condition is not fussiness. Production and preview currently share one
database, so migrating from a preview build would apply a feature branch's
schema change to live data, triggered by a build nobody treats as a release. A
preview therefore builds against whatever schema production is on, which is also
the more honest test: a preview whose code needs an unapplied migration should
fail loudly rather than quietly reshape production to suit itself.

Two consequences worth knowing:

- **A preview build needs no database variables at all.** It skips migrations
  and `next build` does not touch the database. `DATABASE_URL` is still needed
  at _runtime_, or the deployed preview reports that search is unavailable.
- **A production build fails fast without `DIRECT_DATABASE_URL`**, naming the
  variable and why it must be the direct string rather than the pooled one.

`vercel.json` pins functions to `syd1` so they sit beside the Neon database in
`ap-southeast-2`. Confirm the region is available on the current plan at first
deploy; if it is not, the application still works, and every database round trip
crosses the Pacific twice.

## Scheduled ingestion

`vercel.json` schedules `GET /api/ingest/adzuna` daily at 19:00 UTC, which is
05:00 in Sydney: fresh advertisements before the working day.

The endpoint requires `Authorization: Bearer $OPERATIONS_SECRET` and fails
closed. With no secret configured it refuses every request rather than defaulting
to open, because an unauthenticated ingestion endpoint lets anyone exhaust the
daily API allowance.

Trigger it by hand with:

```
curl -H "Authorization: Bearer $OPERATIONS_SECRET" \
  "https://<deployment>/api/ingest/adzuna?maxRequests=5"
```

**Vercel's Hobby plan runs cron once a day.** That shapes the index: each run
takes the newest few hundred advertisements, and anything not seen for 14 days
is marked expired. At one run of 250 a day the index settles at roughly 3,500
active listings. Raising the frequency needs a paid plan, not a code change.

Adzuna's own allowance is the harder limit: 25 requests a minute, 250 a day,
1,000 a week and 2,500 a month. A daily run of 5 requests uses 150 a month, so
there is room to increase frequency or breadth later.

## Health

`GET /api/health` reports build identity, environment, database reachability and
whether synthetic sources are enabled. It is never cached, because a cached
health check reports the past. It exposes no secrets and no connection strings,
which is what makes it safe to leave unauthenticated.

## Rollback

Vercel keeps every deployment. To roll back the application, promote the previous
deployment from the dashboard, or:

```
npx vercel rollback <deployment-url>
```

**Migrations do not roll back with it.** A deployment that added a column can be
reverted safely, because the old code ignores the column. A deployment that
removed or renamed one cannot, and needs a forward migration that restores it.
Write migrations to be safe under an old build: add before you remove, and remove
in a later release than the one that stopped using the column.

Rehearse a destructive migration on a Neon branch before running it against
production. That is what branching is for.

## Backups and recovery

Neon retains a restore window on the free plan and can branch from a point in
time, which is the recovery mechanism: create a branch at a timestamp before the
damage, verify it, then repoint `DATABASE_URL`.

Two things are worth knowing about what is and is not recoverable:

- **Job listings are reproducible.** Losing them costs one ingest run. They are
  a cache of someone else's data, not the system of record.
- **The geography registry is committed to the repository**
  (`data/geography/registry-ASGS2026.json`), so it is restored with
  `npm run geo:import` rather than from a backup.

Confirm the current free-tier retention window at first deploy rather than
trusting this document; Neon has changed it before.

## Failure modes worth expecting

| Symptom                                             | Cause                                                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Site loads, search says "not configured"            | `DATABASE_URL` missing. The health endpoint will say so                                                                               |
| Search works, no listings                           | Nothing ingested yet, or the ingest cron has never run                                                                                |
| Ingest returns 403                                  | `OPERATIONS_SECRET` differs between the caller and the deployment                                                                     |
| Ingest returns 503 `NOT_CONFIGURED`                 | `OPERATIONS_SECRET` is not set on the deployment at all                                                                               |
| Ingest returns `FORBIDDEN` about the source         | The `adzuna` row is not `ACTIVE`/`VERIFIED`. Run the seed                                                                             |
| Ingest fails with `FORBIDDEN` from Adzuna           | Credentials rejected. The client does not retry these, by design                                                                      |
| Production build fails naming `DIRECT_DATABASE_URL` | Not set for the Production environment, or set to the pooled host                                                                     |
| Preview deploys but search says "not configured"    | `DATABASE_URL` not set for the Preview environment. Preview builds skip migrations, so the build passing proves nothing about runtime |
| Process refuses to start                            | `ALLOW_SYNTHETIC_SOURCES=true` with `APP_ENV=production`. Working as intended                                                         |

## What is not yet in place

- **Error monitoring.** Logs go to Vercel's log drain and nothing aggregates or
  alerts on them. Milestone 34 proper.
- **Uptime checks.** `/api/health` exists and nothing polls it.
- **A contact path**, which the commercial checklist requires before launch.
