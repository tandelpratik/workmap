# Domain

Entities, value objects, ports and business rules.

The centre of the dependency graph. Imports nothing from `integrations/`,
`db/`, `app/` or `components/`, enforced by lint (ADR-0001). It must not know
which provider a record came from.
