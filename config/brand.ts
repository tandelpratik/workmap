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
    faviconPath: z.string().startsWith('/'),
  }),

  /** Locale and region the product is written for. */
  locale: z.string().min(2),
});

export type BrandConfig = z.infer<typeof brandSchema>;

export const brand: BrandConfig = brandSchema.parse({
  productName: 'WorkMap',
  shortName: 'WorkMap',
  tagline: 'See where the work is.',
  description:
    'Australian job market intelligence: labour market demand by occupation, ' +
    'geography and skill, drawn from published sources.',

  legalName: null,
  domain: null,
  contactEmail: null,

  social: {
    title: 'WorkMap',
    description:
      'Where employment demand is concentrated across Australia, by occupation, ' +
      'region and skill.',
    imagePath: null,
  },

  assets: {
    logoPath: null,
    faviconPath: '/favicon.ico',
  },

  locale: 'en-AU',
});
