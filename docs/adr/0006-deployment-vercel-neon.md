# ADR-0006: Deployment on Vercel with Neon PostgreSQL

- **Status:** Accepted
- **Date:** 2026-08-28
- **Milestone:** 01 (Product & Architecture)

## Context

The MVP must run at zero or near-zero cost while remaining a credible production
system. The development machine has no local PostgreSQL and no Docker, so the
database must be hosted. The audience is Australian, so latency to Australian
users matters.

Chosen by the product owner on 2026-08-28: Vercel for the application, Neon for
the database.

## Decision

**Next.js (App Router) on Vercel, PostgreSQL on Neon, migrations run from CI or a
developer machine, never at runtime.**

### Application

- Next.js App Router with React Server Components as the default; client
  components only where interaction demands them (the map, filter controls).
- Server-side rendering for anything indexable: market and occupation pages are
  the SEO surface (milestone 27).
- Route handlers under `/api` for JSON contracts consumed by the client.

### Database

- Neon serverless PostgreSQL.
- Application connections use the **pooled** connection string. Serverless
  functions open connections per invocation and will exhaust a direct connection
  limit under any real traffic.
- Migrations use the **direct** connection string, since some DDL does not
  execute correctly through a pooler.
- Neon branching gives a throwaway database per migration test, so destructive
  migrations are rehearsed rather than hoped over.

### Region

Both the database and the primary function region should be Australian
(Sydney) to keep round trips short. Function region configuration and its
availability on the current plan must be confirmed at deployment (milestone 34).

### Configuration and secrets

- Environment variables validated at startup with Zod; the process fails fast on
  a missing or malformed variable rather than failing mysteriously later.
- Secrets are server-only. Nothing sensitive is ever prefixed `NEXT_PUBLIC_`.
  Source credentials never reach the browser: the browser talks to this
  application, and this application talks to providers.
- `.env.example` documents every variable by name and purpose, and holds no real
  values.

### Known platform constraints

These shape the design and **must be re-verified against current plan limits at
milestone 34** rather than trusted from memory:

| Constraint | Consequence |
| --- | --- |
| Function execution time is bounded | Ingestion is batched and resumable (ADR-0005) |
| Cron frequency is limited on free plans | Schedules sized to publication cadence, not to freshness appetite |
| No long-running process | No in-process scheduler, no background worker |
| Serverless connection churn | Pooled connections are mandatory |
| Free-tier bandwidth and build limits | Small payloads, cached static geometry (ADR-0003) |

### Exit path

The design deliberately avoids Vercel-specific primitives beyond cron
scheduling. Ingestion is plain HTTP endpoints plus a database cursor, so moving
to a container host with a long-running worker means changing the trigger, not
the pipeline. Neon speaks standard PostgreSQL, so the database is portable to any
managed Postgres.

## Consequences

**Accepted costs**

- Cold starts on infrequently hit routes.
- Ingestion latency bounded by cron frequency rather than by demand.
- Two connection strings to manage and not confuse.

**Gained**

- No infrastructure to operate, and no recurring cost at MVP volume.
- Preview deployments per change, and database branching for migrations.
- A clear, cheap path off the platform if it stops fitting.

## Alternatives rejected

- **Railway/Render with a worker.** Simpler ingestion model, but free tiers sleep
  and the operational burden is higher for no MVP benefit.
- **Local PostgreSQL.** Requires installation, and still needs a hosted database
  for deployment.
- **Supabase.** Good fit, PostGIS enabled by default, but free projects pause
  after inactivity and PostGIS is not needed yet (ADR-0003).
