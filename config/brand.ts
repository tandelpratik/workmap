import { z } from 'zod';

/**
 * Brand configuration (ADR-0007).
 *
 * This module is the single source of every user-visible brand value. The
 * working name appears here and in content and assets. It must not appear in
 * a type name, route, database identifier, environment variable or package
 * name, so that a rename is a configuration change rather than a refactor.
 *
 * Values that are not yet assigned are `null` rather than invented. A
 * placeholder domain or contact address would be fabricated data in a product
 * whose constitution forbids exactly that.
 */

const brandSchema = z.object({
  /** Full product name, used in headings, metadata and legal text. */
  productName: z.string().min(1),

  /** Compact form for tight spaces such as the masthead and browser tab. */
  shortName: z.string().min(1),

  tagline: z.string().min(1),

  /** One-sentence description of what the product does. */
  description: z.string().min(1),

  /** Legal or public display name. Null until an entity exists. */
  legalName: z.string().min(1).nullable(),

  /** Primary domain, without protocol. Null until one is registered. */
  domain: z.string().min(1).nullable(),

  /** Public contact address. Null until one exists. */
  contactEmail: z.email().nullable(),

  social: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    /** Path to the social preview image. Null until the asset is produced. */
    imagePath: z.string().startsWith('/').nullable(),
  }),

  assets: z.object({
    /** Null until a logo exists. The masthead falls back to typography. */
    logoPath: z.string().startsWith('/').nullable(),
    /** Linked from the document head. The asset must exist under public/. */
    faviconPath: z.string().startsWith('/'),
  }),

  /** Locale and region the product is written for. */
  locale: z.string().min(2),
});

export type BrandConfig = z.infer<typeof brandSchema>;

export const brand: BrandConfig = brandSchema.parse({
  productName: 'Regional Sponsor',
  shortName: 'Regional Sponsor',
  tagline: 'Regional Australian jobs, in one search.',
  description:
    'One search across current job advertisements in regional Australia, with ' +
    'what each advertisement says about visa sponsorship quoted from the ' +
    'advertisement itself.',

  // Still unassigned, and therefore null rather than invented. A placeholder
  // would be fabricated data in a product whose constitution forbids exactly
  // that, and both of these appear in legal text where a wrong value is worse
  // than an absent one.
  legalName: null,
  // Registered and held by the operator. Bare host, no protocol and no path:
  // the metadata layer builds URLs from it.
  domain: 'regionalsponsor.com.au',
  contactEmail: null,

  social: {
    title: 'Regional Sponsor',
    description:
      'Search job advertisements across regional Australia in one place, and ' +
      'read exactly what each one says about visa sponsorship.',
    imagePath: null,
  },

  assets: {
    // Deliberately unchanged by the rename. The mark is a map sheet with one
    // cell picked out, which is the subject rather than the name, so it
    // survives a rebrand by design (see the asset's own note).
    logoPath: null,
    faviconPath: '/icon.svg',
  },

  locale: 'en-AU',
});
