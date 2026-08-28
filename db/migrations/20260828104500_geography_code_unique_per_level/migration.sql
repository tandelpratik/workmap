-- ASGS codes are unique only within a level, not across the standard.
-- "ZZZ" is both a COUNTRY and an SA4 ("Outside Australia"), so the previous
-- (code, asgs_edition) key let the SA4 row silently overwrite the country row
-- on upsert. Level is therefore part of geography identity.

-- DropIndex
DROP INDEX "geography_code_asgs_edition_key";

-- CreateIndex
CREATE UNIQUE INDEX "geography_code_level_asgs_edition_key" ON "geography"("code", "level", "asgs_edition");
