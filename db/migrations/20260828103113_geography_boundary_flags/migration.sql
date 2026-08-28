/*
  Warnings:

  - Added the required column `has_geometry` to the `geography` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "geography" ADD COLUMN     "area_sq_km" DECIMAL(14,4),
ADD COLUMN     "has_geometry" BOOLEAN NOT NULL;
