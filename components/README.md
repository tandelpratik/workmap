# Components

Presentation components.

Renders data it is given. Never queries the database and never calls a
provider; data arrives through `app/` or the API layer.

Every data-backed view implements loading, empty, error and unavailable
states (ADR-0008).

## Layout

| Directory | Holds                                                           |
| --------- | --------------------------------------------------------------- |
| `layout/` | Page structure: masthead, plate grid, figure frame, colophon    |
| `data/`   | Reusable data displays: release strip, headline figure, bar     |
| _(root)_  | Subject components: the map, the tables, listings, the controls |

A subject component renders one thing this product publishes. A layout
component knows nothing about labour market data and could set any page in the
same house style. Keep that line: a component that reaches for `Occupation` or
`RegionFigure` does not belong in `layout/`.

See [the design system](../docs/architecture/DESIGN_SYSTEM.md) for what these
primitives are for and the rules they encode.
