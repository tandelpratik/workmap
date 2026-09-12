-- Split the single affirmative sponsorship signal into three.
--
-- MENTIONED said only that an advertisement raised the subject. An employer
-- stating sponsorship is available and one who might consider it for the right
-- person were recorded identically, and that difference is the one a reader
-- deciding whether to relocate most needs.
--
-- Postgres cannot drop a value from an enum, so the type is rebuilt. Existing
-- MENTIONED rows land on MAY_BE_CONSIDERED, which is the weakest affirmative
-- reading: the old label did not record strength, so inventing one for
-- historical rows would be asserting something the detector never established.
-- Every row is then re-read from its stored description by
-- `npm run sponsorship:reclassify`, which is what actually assigns the tiers.

ALTER TYPE "sponsorship_signal" RENAME TO "sponsorship_signal_old";

CREATE TYPE "sponsorship_signal" AS ENUM (
  'OFFERED',
  'OPEN_TO',
  'MAY_BE_CONSIDERED',
  'EXCLUDED',
  'NOT_MENTIONED',
  'INDETERMINATE'
);

ALTER TABLE "job"
  ALTER COLUMN "sponsorship_signal" DROP DEFAULT,
  ALTER COLUMN "sponsorship_signal" TYPE "sponsorship_signal"
    USING (
      CASE "sponsorship_signal"::text
        WHEN 'MENTIONED' THEN 'MAY_BE_CONSIDERED'
        ELSE "sponsorship_signal"::text
      END
    )::"sponsorship_signal",
  ALTER COLUMN "sponsorship_signal" SET DEFAULT 'INDETERMINATE';

DROP TYPE "sponsorship_signal_old";
