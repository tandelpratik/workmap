# Data Strategy

## Individual job layer

Initial:
- Adzuna API, subject to current terms/limits

Future:
- licensed job feeds
- permitted employer feeds
- additional authorized sources

## Labour-market intelligence

Initial:
- Jobs and Skills Australia Internet Vacancy Index

Future:
- other JSA datasets such as Total New Vacancies where appropriate
- other public/licensed labour datasets

## Source responsibilities

JSA:
- broad online vacancy indicator
- occupation demand
- state/region demand
- historical trends

Individual listings:
- actual job descriptions
- employer
- salary where reported
- location
- application destination
- source-specific listing information

## Important semantics

Never equate:
- IVI = total vacancies
- our indexed jobs = all Australian jobs

Use precise labels.

## Provenance

Every record should be traceable to:
- source
- dataset/API
- source identifier
- reference period
- import timestamp
- data version where available
- methodology

## Freshness

Track:
- source posted date
- first seen
- last seen
- last verified
- expiry
- source status

## Derived analytics

Clearly label analytics derived from platform job listings separately from official JSA metrics.
