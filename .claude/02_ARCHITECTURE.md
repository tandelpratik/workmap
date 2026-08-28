# Production Architecture

## High-level

```text
                 DATA SOURCES
       ┌────────────┴────────────┐
       │                         │
 Individual Jobs            Market Data
       │                         │
 Adzuna / licensed           JSA IVI
 future feeds                future JSA
       │                         │
       └────────────┬────────────┘
                    ↓
             SOURCE ADAPTERS
                    ↓
              INGESTION
                    ↓
              VALIDATION
                    ↓
             NORMALIZATION
                    ↓
            DEDUPLICATION
                    ↓
             CANONICAL DATA
                    │
       ┌────────────┼────────────┐
       ↓            ↓            ↓
    SEARCH      ANALYTICS    GEOGRAPHY
       │            │            │
       └────────────┼────────────┘
                    ↓
          INTELLIGENCE SERVICES
                    ↓
              WEB APPLICATION
```

## Application boundaries

- presentation
- API
- domain
- persistence
- integrations
- ingestion
- analytics
- geography
- search
- skills
- salary
- observability
- configuration

## Key principle

Source adapters translate external data into internal contracts.

The domain must not know whether a job came from Adzuna, an employer feed or a future licensed provider.

## Suggested structure

```text
/app
/components
/config
/domain
/db
/integrations
/ingestion
/analytics
/geography
/search
/skills
/salary
/lib
/types
/tests
/docs
/public
```

## Production evolution

MVP:
Next.js + PostgreSQL + scheduled ingestion

Later:
separate worker process
queue
search engine
cache
observability stack
additional data providers

Only make each move when justified by volume/performance.
