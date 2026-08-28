# Components

Presentation components.

Renders data it is given. Never queries the database and never calls a
provider; data arrives through `app/` or the API layer.

Every data-backed view implements loading, empty, error and unavailable
states (ADR-0008).
