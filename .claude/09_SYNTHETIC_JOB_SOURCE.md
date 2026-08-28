# Synthetic Job Source Specification

## Purpose
Provide deterministic development records while no authorized individual-job provider is active.

## Rules
- source = SYNTHETIC
- isSynthetic = true
- fixture/version ID required
- production API must exclude synthetic records
- production startup should fail closed if synthetic public mode is enabled

## Fixture coverage
Include occupations, Australian locations, employment types, remote types, salary ranges, missing values, duplicate-like records, long descriptions and multiple skills.

## Never use synthetic records for
- public vacancy counts
- JSA metrics
- market reporting
- public job search
- SEO
- employer claims
- commercial analytics
