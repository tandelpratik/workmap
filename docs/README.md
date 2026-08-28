# Documentation

## Governing documents

The product constitution and milestone specifications live in `.claude/`:

- `.claude/CLAUDE.md`: the constitution. Binding, and it overrides everything here.
- `.claude/01_PRODUCT_SPEC.md` through
  `.claude/07_COMMERCIAL_READINESS.md`: specifications.
- `.claude/prompts/`: the 35 sequenced milestones.

## Engineering documentation

| Document | Purpose |
| --- | --- |
| [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md) | Consolidated technical view: modules, boundaries, data flow |
| [adr/README.md](adr/README.md) | Architecture decision records and their status |
| [compliance/SOURCE_REGISTER.md](compliance/SOURCE_REGISTER.md) | Per-source compliance status. **All sources currently unverified.** |
| [milestones/](milestones/) | One record per completed milestone |

## Reading order for a new contributor

1. `.claude/CLAUDE.md`: the rules.
2. [architecture/ARCHITECTURE.md](architecture/ARCHITECTURE.md): the system.
3. [adr/README.md](adr/README.md): why it is that way.
4. [compliance/SOURCE_REGISTER.md](compliance/SOURCE_REGISTER.md): what may
   and may not be done with each data source.

## Project status

Milestone 01 complete (architecture), revised at 01a after Adzuna onboarding was
blocked. No application code yet.

**Source position:** JSA is the active source and carries the launch product.
Adzuna is blocked at onboarding and no job listings ship until it or another
authorized provider is activated. A development-only synthetic source exists for
building the job pipeline and can never run in production. See
[ADR-0009](adr/0009-source-activation-and-synthetic-containment.md).
