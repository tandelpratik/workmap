# Documentation

## Governing documents

The product constitution and milestone specifications live in `.claude/`:

- `.claude/CLAUDE.md`: the constitution. Binding, and it overrides everything here.
- `.claude/01_PRODUCT_SPEC.md` through
  `.claude/07_COMMERCIAL_READINESS.md`: specifications.
- `.claude/prompts/`: the 35 sequenced milestones.

## Engineering documentation

| Document                                                                           | Purpose                                                                              |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md)                       | Consolidated technical view: modules, boundaries, data flow                          |
| [adr/README.md](adr/README.md)                                                     | Architecture decision records and their status                                       |
| [compliance/SOURCE_REGISTER.md](compliance/SOURCE_REGISTER.md)                     | Per-source compliance status, and what each licence permits                          |
| [compliance/DIRECT_SOURCE_FEASIBILITY.md](compliance/DIRECT_SOURCE_FEASIBILITY.md) | Direct employer and government sources: measured access, and what their terms permit |
| [milestones/](milestones/)                                                         | One record per completed milestone                                                   |

## Reading order for a new contributor

1. `.claude/CLAUDE.md`: the rules.
2. [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md): the system.
3. [adr/README.md](adr/README.md): why it is that way.
4. [compliance/SOURCE_REGISTER.md](compliance/SOURCE_REGISTER.md): what may
   and may not be done with each data source.

## Project status

Two surfaces are live. **Jobs** is a working search over ingested Adzuna
advertisements. **Map** draws online job advertisements by region from the July
2026 JSA IVI release: 50 areas, the eight capitals at GCCSA and the rest of the
country at SA4, with a table of the same figures beside it. Selecting a region,
on the map or in the table, opens a panel with its exact figure, its change on
the month before and its rank. Selection is a URL, so it is shareable and needs
no JavaScript.

The map drills down: selecting a region offers its state, which redraws it from
the detail tier with finer boundaries, a breadcrumb back to the country, and
the capital city dissolved into one shape from the SA4s the ABS says belong to
it. Shading stays on the national bands in both views, so a colour means one
thing everywhere.

Labour market history is retained at two reference periods
([ADR-0010](adr/0010-labour-market-retention-window.md)). Milestones 06 and 07,
history and trend, therefore begin by widening that window and re-importing.
The occupation matrix (11) is untouched, and the map has no filters yet:
occupation is the valuable one, and its 2,850 series are already loaded.

**Source position:** Adzuna carries job listings and is verified for exactly
that. Its terms bar publishing aggregate figures without written consent, so
counts, averages and the heatmap stay on JSA IVI, which is CC BY 4.0. ABS ASGS
supplies geography. A development-only synthetic source exists for the pipeline
and can never run in production. See
[ADR-0009](adr/0009-source-activation-and-synthetic-containment.md) and the
[source register](compliance/SOURCE_REGISTER.md).

**Launch blocker:** `public/adzuna-logo.png` must be added by hand before the
site is public. Adzuna's terms require their logo in the attribution and their
site blocks automated download.
