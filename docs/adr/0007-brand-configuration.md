# ADR-0007: Brand as configuration, never as namespace

- **Status:** Accepted
- **Date:** 2026-08-28
- **Milestone:** 01 (Product & Architecture)

## Context

"WorkMap" is a working name. The constitution requires that a rename be possible
by changing configuration, assets and content, and forbids the brand appearing
as a technical namespace.

Brand names leak into codebases through a hundred small decisions: a type name, a
route, a CSS class, an email template, a database table. Each is trivial alone,
and collectively they make a rename a multi-week refactor with a long tail of
missed strings.

## Decision

**One typed, validated brand configuration module is the single source of every
user-visible brand value. Technical identifiers never contain the brand.**

### Brand configuration

`config/brand.ts` exports a validated object:

```ts
interface BrandConfig {
  productName: string;       // "WorkMap"
  shortName: string;         // "WorkMap"
  tagline: string;           // "See where the work is."
  legalName: string;         // display name for legal/public pages
  domain: string;
  contactEmail: string;
  social: {
    title: string;
    description: string;
    imagePath: string;
  };
  assets: {
    logoPath: string;
    faviconPath: string;
  };
}
```

Validated with Zod at module load, so a missing or empty brand value fails
immediately rather than rendering an empty heading in production.

### Naming rules

| Concern | Rule | Example |
| --- | --- | --- |
| Domain types | Generic | `Job`, `Company`, `User`, `Geography` |
| API routes | Generic | `/api/jobs`, `/api/market` |
| Database tables | Generic | `job`, `company`, `geography` |
| Adapters | Provider-named | `AdzunaJobSourceAdapter` |
| Env vars | Neutral or provider-named | `DATABASE_URL`, `ADZUNA_APP_ID` |
| Package name | Neutral | see below |

Provider names in `integrations/` are correct and expected; they identify a real
external system. The brand is what must stay out.

### Where the brand may appear

- `config/brand.ts` (the values)
- content and copy files that read from it
- `public/` brand assets (logo, favicon, social image)
- generated metadata and documents that read from it

Anywhere else is a defect.

### Enforcement

A test asserts that the literal string "WorkMap" appears nowhere outside the
permitted locations, scanning source, schema and route definitions. This runs in
CI and fails the build. Without it, this ADR is a wish rather than a decision.

The existing `.claude/docs/BRAND_RENAME_CHECKLIST.md` remains the operational
procedure; this ADR is what makes that checklist short enough to be true.

### Package name

The package name is neutral rather than brand-derived, so a rename does not
touch dependency metadata, lockfiles or import paths.

## Consequences

**Accepted costs**

- One indirection between a heading and its text.
- Copy cannot be typed inline where it mentions the product.

**Gained**

- A rename is a configuration change plus asset replacement.
- Metadata, social cards and legal pages cannot drift apart.
- Domain vocabulary stays about the problem, not the brand.

## Alternatives rejected

- **Hard-code now, rename later.** The rename is guaranteed; the cost is
  strictly higher the longer it waits.
- **Environment variables for brand values.** Brand is not per-environment, and
  losing type safety and compile-time checking buys nothing.
