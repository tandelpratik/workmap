-- CreateEnum
CREATE TYPE "sponsorship_signal" AS ENUM ('MENTIONED', 'EXCLUDED', 'NOT_MENTIONED', 'INDETERMINATE');

-- AlterTable
ALTER TABLE "job" ADD COLUMN     "sponsorship_evidence" JSONB,
ADD COLUMN     "sponsorship_signal" "sponsorship_signal" NOT NULL DEFAULT 'INDETERMINATE';

-- CreateIndex
CREATE INDEX "job_sponsorship_signal_idx" ON "job"("sponsorship_signal");
