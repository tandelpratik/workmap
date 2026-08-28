# CLAUDE.md — WorkMap Production Constitution

## Product status

This is an actual product intended for public use and eventual commercialization.

The initial deployment is optimized for free/low-cost operation, but engineering quality must be production-oriented.

## Brand independence

"WorkMap" is a working brand only.

Brand values must live in configuration:
- productName
- shortName
- tagline
- logo
- favicon
- social metadata
- legal/public display name where applicable

Never use WorkMap as a technical namespace.

Correct:
- Job
- User
- /api/jobs

Incorrect:
- WorkMapJob
- WorkMapUser
- /api/workmapJobs

A rename must be possible by changing configuration/assets/content.

## Design constitution

The product must NOT look like generic AI SaaS.

Never use as the default:
- purple/blue AI gradients
- glassmorphism
- glowing cards
- gradient text
- excessive rounded cards
- excessive pills
- AI sparkle icons
- chatbot-first UX
- generic dashboard card grids
- "AI-powered" visual clichés
- oversized SaaS hero sections

Design direction:
- editorial data journalism
- modern cartography
- atlas/research-tool feel
- restrained paper/ink palette
- typography-led hierarchy
- thin rules
- generous whitespace
- calm information density
- map-led interaction

Visual grammar:
WHERE = Map
WHAT = Matrix
WHEN = Trend

AI can improve internal classification/matching later, but AI must not define the product's visual identity.

## Data integrity

Never fabricate:
- job listings
- job counts
- salary
- historical values
- geography
- boundaries
- coordinates
- occupation mappings
- skills

Preserve source provenance.

JSA IVI must never be described as total Australian vacancies. It is an online job-advertisement indicator/proxy.

## Source compliance

Never:
- bypass access controls
- bypass authentication
- bypass rate limits
- defeat paywalls
- ignore robots/terms where applicable
- scrape a source when the intended use is not authorized

Every source must have a documented compliance status before production use.

## Architecture

Use provider adapters.

Provider-specific code belongs under `/integrations`.

Domain/business logic must not depend on provider-specific types.

The ingestion system must be idempotent.

## Free-tier rules

Optimize for:
- low API usage
- caching where permitted
- batch processing
- PostgreSQL-first architecture
- small payloads
- limited background work

Do not introduce Redis, Elasticsearch/OpenSearch, Kubernetes, paid queues, paid LLM APIs or other recurring infrastructure unless evidence shows they are required.

## Security

- Never expose source credentials to the browser.
- Validate external data.
- Validate all inputs.
- Protect admin functions.
- Do not log secrets.
- Use least privilege.
- Treat third-party content as untrusted.

## Accessibility

Every important visualization must have an accessible alternative.

Heatmaps must have a table/list representation.

Do not encode meaning by colour alone.

## Claude workflow

For every prompt:

1. Read project docs and inspect the repository.
2. Summarize the current state.
3. Identify files/modules affected.
4. State the implementation plan.
5. Implement only the requested milestone.
6. Run format/lint/typecheck/tests.
7. Review the diff for accidental scope expansion.
8. Update documentation.
9. Report:
   - what changed
   - files changed
   - tests run
   - issues
   - decisions
10. Stop and wait for the next milestone.

Do not silently move ahead.

## Definition of done

A milestone is incomplete if:
- required tests fail
- type checking fails
- feature is only mocked
- provenance is missing
- source rules are violated
- accessibility requirements are ignored
- design constitution is violated


## Current source state

JSA is the active live MVP source. Adzuna is pending because current onboarding requires organization/website details that are not currently available. Never fabricate or bypass. SyntheticJobSource is development-only and must be excluded from production/public data.
