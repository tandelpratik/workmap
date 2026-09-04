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

Job search is live. Adzuna is verified and active, and the home page is a
working search over ingested advertisements. Milestone 05 built the JSA IVI
importer, which has no file to import yet.

Milestones 06 to 11, the market intelligence layer, are deferred: the product
owner chose to build a demonstrable job product first.

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
