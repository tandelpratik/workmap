-- CreateEnum
CREATE TYPE "postcode_source" AS ENUM ('PUBLISHED', 'DERIVED_FROM_COORDINATES');

-- AlterTable
ALTER TABLE "location" ADD COLUMN     "postcode_reference" TEXT,
ADD COLUMN     "postcode_source" "postcode_source";
