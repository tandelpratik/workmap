import { brand } from './brand';

/**
 * The product's legal position, in the words it must be published in.
 *
 * These strings are held the way a licence's attribution text is held in the
 * source register: verbatim, in one place, because a legal statement that every
 * call site is free to reword is a legal statement that will eventually be
 * reworded into something else. Components render these. They never paraphrase
 * them.
 *
 * The boundary described here is the product's whole basis for existing.
 * Reporting what a third party published, and linking to it, is a different act
 * from advising someone about their own migration position. The second is
 * "immigration assistance" within the meaning of the Migration Act 1958, which
 * is reserved to registered agents and legal practitioners; the first is not.
 * Every string below is written to keep the product on the first side of that
 * line.
 *
 * The product name makes stating it mandatory rather than prudent. A service
 * called after sponsorship, carrying a sponsorship filter, is one careless
 * sentence away from reading as an assurance that an employer sponsors or that
 * a reader will be sponsored. It asserts neither, and says so on every page.
 *
 * The name is interpolated rather than written out, so a rename carries into
 * the legal text instead of leaving it naming a product that no longer exists
 * (ADR-0007).
 */
export const legal = {
  /**
   * The statement the product carries on every page.
   *
   * Two claims and no more: what it does, and what it is not. Anything added
   * here is an assertion the product then has to be able to stand behind.
   */
  disclaimer:
    `${brand.productName} provides factual job information and reports ` +
    'sponsorship wording published in advertisements. It does not provide ' +
    'migration advice.',

  /**
   * Short form, for beside a sponsorship label where a paragraph will not fit.
   *
   * Never a substitute for the full statement on the same page. It is a
   * reminder of what the label is, not the disclaimer itself.
   */
  shortDisclaimer: 'Reported wording, not migration advice.',

  /**
   * That this is not a government service, and not connected to one.
   *
   * The Department of Home Affairs is named because the regional classification
   * this product reports against is theirs, and using an official definition is
   * exactly what invites a reader to assume an official connection.
   */
  notGovernment:
    `${brand.productName} is an independent service. It is not a government ` +
    'service, a migration agent or a legal practice, and it is not affiliated ' +
    'with, endorsed by or connected to the Department of Home Affairs.',

  /** That the data providers have not endorsed any of this. */
  notAffiliatedWithSources:
    `${brand.productName} is not affiliated with, endorsed by or sponsored by ` +
    'any organisation whose advertisements or data it publishes. Each source ' +
    'is named beside the material it supplied.',

  /**
   * What the product does not do.
   *
   * Written in the third person throughout, deliberately. Second-person
   * phrasing reads as an assessment of the reader even inside a sentence
   * refusing to make one, so it is refused outright and a test forbids it
   * anywhere in the interface.
   *
   * That test fails on an example quoted in a comment exactly as readily as on
   * one written into a page, which is why this note describes the construction
   * rather than demonstrating it. The first draft demonstrated it, and the test
   * caught the file it is written in.
   */
  exclusions: [
    "It does not assess any person's visa eligibility, points score, or " +
      'prospects of permanent residence.',
    'It does not recommend a visa subclass or a migration pathway.',
    'It does not describe an employer as a sponsor, or confirm that any ' +
      'employer holds sponsorship approval. It reports what an advertisement ' +
      'said, and quotes it.',
    'It does not promise that sponsorship, a visa or a job will be offered to ' +
      'anyone.',
    'It does not give guidance on applying for a job or for a visa.',
  ],

  /**
   * Where a reader is sent for everything above.
   *
   * One official destination rather than a reading list. A curated set of
   * further reading is a judgement about what someone in their position needs
   * to know, which is the judgement this product does not make.
   */
  officialVisaInformation: {
    label: 'Department of Home Affairs',
    url: 'https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing',
  },
} as const;
