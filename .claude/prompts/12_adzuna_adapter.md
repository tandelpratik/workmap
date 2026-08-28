# Prompt 12 — Adzuna Adapter (Pending)

## Context
Adzuna onboarding is currently blocked because the selected onboarding path requires organization/website details that are not available. Do not invent organization details or bypass the requirement.

## Objective
Implement the adapter boundary without requiring live credentials.

## Requirements
- provider-specific types isolated under integrations
- configuration schema
- credential validation
- clear pending state when credentials are absent
- no live request without valid credentials
- timeout/retry/rate-limit handling prepared
- structured logging
- mocked response tests
- source status exposed to admin/operations

## Acceptance
The application builds and tests with no Adzuna credentials. No fake credentials or fake organization details are committed. Synthetic data is never labelled Adzuna.
