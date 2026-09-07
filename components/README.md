# Components

Presentation components.

Renders data it is given. Never queries the database and never calls a
provider; data arrives through `app/` or the API layer.

Every data-backed view implements loading, empty, error and unavailable
states (ADR-0008).

## Layout

| Directory | Holds                                                            |
| --------- | ---------------------------------------------------------------- |
| `ui/`     | Primitives: class merge, label, link, button, grid, ranked table |
| `layout/` | Page structure: masthead, plate grid, figure frame, colophon     |
| `data/`   | Reusable data displays: release strip, headline figure, bar      |
| _(root)_  | Subject components: the map, the tables, listings, the controls  |

A subject component renders one thing this product publishes. A layout
component knows nothing about labour market data and could set any page in the
same house style. Keep that line: a component that reaches for `Occupation` or
`RegionFigure` does not belong in `layout/` or `ui/`.

`ui/` is the shadcn/ui model without shadcn/ui: variants are declared with
`cva`, caller overrides resolve through `cn`, and the files are ours to edit.
No headless component library is installed, because every one of them runs
React hooks and would put `use client` on pages that currently ship no
JavaScript at all. Adding one needs a widget that genuinely cannot be a link
or a form, and there is not one here yet.

Never write a Tailwind class list that a primitive already expresses. If a
label, link or button needs a treatment the variants do not cover, add the
variant rather than the exception.

See [the design system](../docs/architecture/DESIGN_SYSTEM.md) for what these
primitives are for and the rules they encode.
