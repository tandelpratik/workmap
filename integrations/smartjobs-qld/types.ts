/**
 * Smart Jobs and Careers provider types (ADR-0001).
 *
 * These describe the portal's own vocabulary and stop at the adapter boundary.
 * The domain never sees an `in_jnCounter` or a "Cairns region".
 *
 * The portal runs on NGA.NET. There is no API and no documented contract, so
 * every shape here was read off the live HTML on 2026-08-31 and is subject to
 * change without notice. The parser fails loudly rather than guessing when the
 * markup moves, because a silent empty result would look exactly like a day
 * with no vacancies.
 */

/** One row of the search results list. */
export interface SmartJobsSearchRow {
  /**
   * Whatever the result link identified the row by.
   *
   * The portal uses two link forms and they carry different identifiers: an
   * `in_jnCounter` query parameter on one, and a slug such as
   * `QLD-QLD-PTCAP2026` on the vanity path form. Either way this addresses a
   * row, not a vacancy, and is never the idempotency key: the stable reference
   * lives on the detail page. Kept so a parse can be traced back to the row
   * that produced it.
   */
  readonly rowRef: string;
  readonly title: string;
  /** The agency, as the portal words it. Null when the row omits it. */
  readonly employer: string | null;
  /** For example "Fixed Term Temporary Full-time,Part-time". Portal wording. */
  readonly employmentText: string | null;
  /**
   * The portal's own region names, already split.
   *
   * A listing may name several. These are a closed vocabulary, which is what
   * makes this source tractable: no free-text geocoding is required.
   */
  readonly localities: readonly string[];
  /** The list view's teaser. Always a fragment, never the whole advert. */
  readonly excerpt: string | null;
  /** Absolute URL of the detail page. */
  readonly detailUrl: string;
}

/** A parsed search results page. */
export interface SmartJobsSearchPage {
  /** The portal's own count of matching jobs, across all pages. */
  readonly total: number;
  readonly rows: readonly SmartJobsSearchRow[];
  /**
   * The form state needed to request the next page, or null on the last page.
   *
   * Paging is a form replay rather than a query string: the portal carries its
   * cursor in hidden fields. Replaying what the server sent avoids inventing a
   * cursor it did not offer.
   */
  readonly nextPageForm: Readonly<Record<string, string>> | null;
}

/** The detail page, which is where the stable reference and dates live. */
export interface SmartJobsJobDetail {
  /** From JSON-LD `identifier.value`, for example `QLD/164089`. */
  readonly reference: string;
  readonly title: string;
  readonly employer: string | null;
  readonly description: string | null;
  /** ISO date string from JSON-LD `datePosted`. */
  readonly datePosted: string | null;
  /** ISO date string from JSON-LD `validThrough`. */
  readonly validThrough: string | null;
  /** schema.org employment type tokens, as published. May be several. */
  readonly employmentTypes: readonly string[];
  /** The portal's region names from the labelled "Workplace Location" field. */
  readonly localities: readonly string[];
  /** The licence URI the page declares in its AGLS metadata, if present. */
  readonly declaredLicence: string | null;
}
