import { skillKindLabel, type SkillAttachment } from '@/domain/skill';
import { Label } from '@/components/ui/label';

/**
 * What an advertisement's own text named, with the words that named it.
 *
 * Not a row of tags. A skill here is a reading of a document, and the reading
 * is only trustworthy beside the words it was made from, which is the same
 * settlement the sponsorship badge reached: a label alone is our
 * characterisation of an employer, a label beside a quotation is something a
 * reader can check against the original.
 *
 * ## What this is careful not to say
 *
 * **Not "required".** The corpus puts mandatory requirements under headings
 * reading "Highly Desirable" and desirable ones under "Your mandatory
 * requirements", so the distinction cannot be drawn honestly from the text and
 * is not drawn. "Named in this advertisement" is the whole claim.
 *
 * **Not a count of anything.** One listing, its own words.
 *
 * **Nothing at all when nothing was found.** A listing with no attachments
 * renders no empty state, no "none listed" and no reassuring absence. Most of
 * what this product holds is an excerpt rather than a whole advertisement, so
 * "we found none" and "the job asks for none" are different facts and only the
 * first is true. The page-level key says so once, where a reader who wants to
 * know why a listing is bare will look.
 */

/**
 * Whether the advertisement's words add anything to the label we chose.
 *
 * "AHPRA" under "AHPRA registration" and "blue card" under "Working with
 * Children Check" are the point: they show the reader the wording that
 * produced the label, which is how a bad match gets spotted from the outside.
 * "Working with Children Check" under "Working with Children Check" is the
 * same string twice, which is noise on a page whose whole manner is calm.
 *
 * Compared case-insensitively and on collapsed whitespace, because a source
 * writing "FIRST AID" has not said anything different from "First aid" and a
 * quotation of it would only be showing the reader a shouting employer. 340 of
 * the corpus's 498 attachments differ by more than that, so the quotation
 * earns its place on most of them.
 */
export function quotationAddsSomething(
  attachment: Pick<SkillAttachment, 'name' | 'matchedText'>,
): boolean {
  const { matchedText, name } = attachment;
  if (matchedText === null) return false;
  const normalise = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
  const quoted = normalise(matchedText);
  return quoted !== '' && quoted !== normalise(name);
}

export function SkillNote({ skills }: { skills: readonly SkillAttachment[] }) {
  if (skills.length === 0) return null;

  return (
    <div>
      <Label as="p">Named in this advertisement</Label>
      <dl className="mt-1.5 space-y-1">
        {skills.map((skill) => (
          <div
            key={skill.normalizedName}
            className="flex flex-wrap items-baseline gap-x-2"
          >
            <dt className="text-ink text-sm">{skill.name}</dt>
            <dd className="text-ink-faint text-sm">
              {quotationAddsSomething(skill) ? (
                /*
                  The advertisement's words, quoted rather than paraphrased.
                  The screen-reader text says whose words they are, because
                  quotation marks are punctuation a screen reader does not
                  announce and without it this is an unexplained second phrase.
                */
                <>
                  <span className="sr-only">The advertisement says: </span>
                  &ldquo;{skill.matchedText}&rdquo;
                </>
              ) : (
                /*
                  The label already is the advertisement's wording. The kind is
                  shown instead, which is the one thing the label does not say:
                  "SAP" alone does not tell a reader it is a tool rather than a
                  credential, and on a page of credentials that matters.
                */
                skillKindLabel(skill.kind)
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * What the skill lines mean, shown once per page rather than on every listing.
 *
 * The absence is the part that needs explaining, and it needs explaining more
 * here than anywhere else on this page. A reader who sees three listings carry
 * a Blue Card line and the fourth carry nothing will read the fourth as a job
 * that does not need one. It is far more often a job whose advertisement we
 * hold two sentences of.
 */
export function SkillKey() {
  const entries: { term: string; meaning: string }[] = [
    {
      term: 'Named, not required',
      meaning:
        'A line says the advertisement mentions the thing. It does not say ' +
        'the employer treats it as mandatory. Advertisements in this index ' +
        'file mandatory requirements under headings reading "Highly ' +
        'Desirable" and desirable ones under "Your mandatory requirements", ' +
        'so the two cannot be told apart from the text and are not.',
    },
    {
      term: 'Read, never inferred',
      meaning:
        'Nothing is added because a job of this kind usually wants it. A ' +
        'skill appears only where the advertisement writes it, and the ' +
        "advertisement's own words are quoted beside it wherever they differ " +
        'from the label.',
    },
    {
      term: 'A blank listing means nothing was found',
      meaning:
        'It does not mean the job asks for nothing. Most advertisements here ' +
        'reach us as a short excerpt rather than in full, and an excerpt that ' +
        'stops before the requirements has nothing to read. Listings that ' +
        'arrive whole name a skill around four times as often as excerpts do.',
    },
  ];

  return (
    <dl className="mt-4 space-y-2">
      {entries.map((entry) => (
        <div key={entry.term} className="flex flex-wrap items-baseline gap-x-2">
          <dt className="text-ink shrink-0 text-sm font-medium">{entry.term}</dt>
          <dd className="text-ink-faint max-w-measure text-sm">{entry.meaning}</dd>
        </div>
      ))}
    </dl>
  );
}
