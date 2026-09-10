-- CreateEnum
CREATE TYPE "regional_status" AS ENUM ('REGIONAL', 'NOT_REGIONAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "regional_category" AS ENUM ('CITY_OR_MAJOR_CENTRE', 'REGIONAL_CENTRE_OR_OTHER');

-- CreateEnum
CREATE TYPE "regional_basis" AS ENUM ('POSTCODE', 'STATE', 'NONE');

-- AlterTable
ALTER TABLE "location" ADD COLUMN     "regional_basis" "regional_basis" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "regional_category" "regional_category",
ADD COLUMN     "regional_classified_at" TIMESTAMP(3),
ADD COLUMN     "regional_instrument" TEXT,
ADD COLUMN     "regional_status" "regional_status" NOT NULL DEFAULT 'UNKNOWN';

-- CreateIndex
CREATE INDEX "location_regional_status_idx" ON "location"("regional_status");
