import { z } from 'zod';

/**
 * The shape of an Adzuna search response, as this project relies on it.
 *
 * Third-party payloads are untrusted input and are validated at the boundary
 * before becoming domain objects (ADR-0008). The schemas are deliberately
 * permissive about everything the product does not use: a provider adding a
 * field must not break ingestion, and unknown keys are dropped rather than
 * carried inward.
 *
 * Only three things are actually required: an identifier, a title, and a URL
 * to send an applicant to. A listing missing any of them cannot be published,
 * so it is quarantined rather than stored half-formed.
 */

/** Adzuna returns identifiers as strings, and numbers in some payloads. */
const identifier = z
  .union([z.string().min(1), z.number()])
  .transform((value) => String(value));

/** Their booleans arrive as 0/1, "0"/"1", or true/false depending on endpoint. */
const looseBoolean = z.union([z.boolean(), z.number(), z.string()]).transform((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  return value === '1' || value.toLowerCase() === 'true';
});

const companySchema = z.object({
  display_name: z.string().optional(),
});

const locationSchema = z.object({
  display_name: z.string().optional(),
  /** Broadest first, for example ["Australia", "New South Wales", "Sydney"]. */
  area: z.array(z.string()).optional(),
});

const categorySchema = z.object({
  label: z.string().optional(),
  tag: z.string().optional(),
});

export const adzunaJobSchema = z.object({
  id: identifier,
  title: z.string().min(1),
  redirect_url: z.url(),

  description: z.string().optional(),
  created: z.string().optional(),

  company: companySchema.optional(),
  location: locationSchema.optional(),
  category: categorySchema.optional(),

  latitude: z.number().optional(),
  longitude: z.number().optional(),

  salary_min: z.number().optional(),
  salary_max: z.number().optional(),
  /** True when the figure is an Adzuna Jobsworth estimate, not the employer's. */
  salary_is_predicted: looseBoolean.optional(),

  /** "permanent" or "contract". */
  contract_type: z.string().optional(),
  /** "full_time" or "part_time". */
  contract_time: z.string().optional(),
});

export type AdzunaJob = z.infer<typeof adzunaJobSchema>;

/**
 * The envelope.
 *
 * Results are validated individually by the mapper, not here, so that one
 * malformed advert is quarantined instead of failing the whole page.
 */
export const adzunaSearchSchema = z.object({
  results: z.array(z.unknown()),
  count: z.number().optional(),
});

export type AdzunaSearchResponse = z.infer<typeof adzunaSearchSchema>;
