# Prompt 13 — Generic Job Ingestion + Synthetic Development Source

Build the generic JobSourceAdapter pipeline:

fetch → validate → normalize → deduplicate → upsert → track

Implement:
1. Adzuna adapter in PENDING state with no live credentials.
2. SyntheticJobSource for development/testing only.

Synthetic requirements:
- deterministic fixtures
- source=SYNTHETIC
- isSynthetic=true
- development-only feature flag
- production APIs exclude synthetic records
- official JSA metrics exclude synthetic records
- SEO/public pages exclude synthetic records

Add run tracking, retries, failure records, provenance and tests.
