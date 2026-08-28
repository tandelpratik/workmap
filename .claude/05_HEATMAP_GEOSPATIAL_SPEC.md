# Heatmap & Geospatial Product Specification

## Flagship feature

Australian Job Market Heatmap.

## Primary question

Where is employment demand concentrated?

## Geography hierarchy

```text
Australia
  └── State/Territory
       └── SA4 / IVI Region
            └── City/suburb only if source-supported
```

Never imply a more granular dataset than actually exists.

## Official geography

Use authoritative geography and JSA-supported identifiers/geometries.

Do not:
- draw fake polygons
- invent coordinates
- approximate boundaries and label them as exact
- use unrelated administrative boundaries without disclosure

## Heatmap modes

### 1. Official market heatmap

Based on JSA IVI.

Metrics:
- online job advertisements
- change
- growth
- occupation demand
- regional demand

### 2. Platform-derived job heatmap

Based on individual stored listings.

Examples:
- listing count by state
- percentage of Business Analyst listings mentioning SQL
- median reported salary by region where sample size supports it

Always label derived metrics.

## UI controls

- occupation
- metric
- period
- geography
- optional skill
- optional employment type
- optional remote type

## Drilldown

Australia → state → supported regional level.

Preserve filters.

Show breadcrumb.

## Map interaction

- hover may enhance
- click/tap must select
- selection persists
- detail panel displays exact metric and context
- keyboard-accessible alternative exists

## Missing data

Differentiate:
- zero
- unavailable
- suppressed/unknown
- not covered

Never turn missing into zero.

## Legend

Must show:
- metric name
- units
- scale
- period
- source

## Geometry performance

Use simplified geometry appropriate for web display while preserving topology sufficiently for the selected level.

Do not send unnecessary geometry to the browser.

Cache static geometry where licensing permits.

## API contract

Heatmap API should return normalized records:

```json
{
  "geographyId": "example",
  "name": "Victoria",
  "level": "STATE",
  "value": 12345,
  "change": 321,
  "changePercent": 2.7,
  "period": "2026-07",
  "source": "JSA IVI"
}
```

## Accessibility table

For every map state, provide an equivalent list/table:
- geography
- value
- change
- rank where supported

## Methodology

Every visualization must make it possible to understand:
- what is measured
- source
- period
- geographic level
- whether it is official or derived
