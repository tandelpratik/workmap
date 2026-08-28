# Integrations

Provider adapters.

One directory per external system, each holding its HTTP client, its own DTO
types and the mappers that translate them into domain objects. Provider types
stop at this boundary (ADR-0001).

Every adapter declares a descriptor carrying its compliance status and
activation state (ADR-0009).
