-- AlterTable
ALTER TABLE "ingestion_run" ADD COLUMN     "input_checksum" TEXT,
ADD COLUMN     "input_ref" TEXT;

-- AlterTable
ALTER TABLE "labour_market_series" ADD COLUMN     "source_geography_code" TEXT,
ADD COLUMN     "source_geography_name" TEXT,
ADD COLUMN     "source_occupation_code" TEXT,
ADD COLUMN     "source_occupation_name" TEXT;
