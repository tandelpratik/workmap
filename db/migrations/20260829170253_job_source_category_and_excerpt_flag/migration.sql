-- AlterTable
ALTER TABLE "job" ADD COLUMN     "description_is_excerpt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source_category_label" TEXT,
ADD COLUMN     "source_category_tag" TEXT;

-- CreateIndex
CREATE INDEX "job_source_category_tag_idx" ON "job"("source_category_tag");
