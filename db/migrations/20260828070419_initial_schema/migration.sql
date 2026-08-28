-- CreateEnum
CREATE TYPE "source_kind" AS ENUM ('JOB_LISTING', 'MARKET_INDICATOR', 'GEOGRAPHY', 'CLASSIFICATION');

-- CreateEnum
CREATE TYPE "source_activation" AS ENUM ('ACTIVE', 'PENDING', 'BLOCKED', 'DEVELOPMENT_ONLY');

-- CreateEnum
CREATE TYPE "compliance_status" AS ENUM ('VERIFIED', 'UNVERIFIED', 'RESTRICTED', 'PROHIBITED');

-- CreateEnum
CREATE TYPE "metric_basis" AS ENUM ('OFFICIAL', 'DERIVED', 'SYNTHETIC');

-- CreateEnum
CREATE TYPE "value_state" AS ENUM ('PRESENT', 'ZERO', 'UNAVAILABLE', 'SUPPRESSED', 'NOT_COVERED');

-- CreateEnum
CREATE TYPE "period_granularity" AS ENUM ('MONTH', 'QUARTER', 'YEAR');

-- CreateEnum
CREATE TYPE "geography_level" AS ENUM ('COUNTRY', 'STATE', 'SA4');

-- CreateEnum
CREATE TYPE "job_status" AS ENUM ('ACTIVE', 'EXPIRED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "employment_type" AS ENUM ('FULL_TIME', 'PART_TIME', 'CASUAL', 'CONTRACT', 'TEMPORARY', 'INTERNSHIP', 'APPRENTICESHIP');

-- CreateEnum
CREATE TYPE "remote_type" AS ENUM ('ONSITE', 'HYBRID', 'REMOTE');

-- CreateEnum
CREATE TYPE "salary_period" AS ENUM ('HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "salary_basis" AS ENUM ('REPORTED', 'SOURCE_ESTIMATED');

-- CreateEnum
CREATE TYPE "description_format" AS ENUM ('HTML', 'TEXT');

-- CreateEnum
CREATE TYPE "ingestion_status" AS ENUM ('PENDING', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ingestion_error_kind" AS ENUM ('TRANSPORT', 'VALIDATION', 'MAPPING', 'PERSISTENCE');

-- CreateEnum
CREATE TYPE "skill_kind" AS ENUM ('TECHNICAL', 'TOOL', 'CERTIFICATION', 'LANGUAGE', 'DOMAIN', 'SOFT');

-- CreateEnum
CREATE TYPE "skill_extraction_method" AS ENUM ('DETERMINISTIC', 'MANUAL');

-- CreateTable
CREATE TABLE "source" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "kind" "source_kind" NOT NULL,
    "activation" "source_activation" NOT NULL,
    "compliance_status" "compliance_status" NOT NULL,
    "attribution_required" BOOLEAN NOT NULL DEFAULT true,
    "attribution_text" TEXT,
    "terms_url" TEXT,
    "methodology_url" TEXT,
    "homepage_url" TEXT,
    "rate_limit_requests" INTEGER,
    "rate_limit_per_second" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geography" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" "geography_level" NOT NULL,
    "asgs_edition" TEXT NOT NULL,
    "parent_id" TEXT,
    "source_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geography_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "occupation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "classification_version" TEXT NOT NULL,
    "parent_id" TEXT,
    "source_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "occupation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "website" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "location" (
    "id" TEXT NOT NULL,
    "raw_text" TEXT NOT NULL,
    "normalized_key" TEXT NOT NULL,
    "suburb" TEXT,
    "city" TEXT,
    "state_code" TEXT,
    "postcode" TEXT,
    "geography_id" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job" (
    "id" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "source_version" TEXT,
    "content_hash" TEXT NOT NULL,
    "is_synthetic" BOOLEAN NOT NULL DEFAULT false,
    "synthetic_fixture_version" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "description_format" "description_format",
    "company_id" TEXT,
    "location_id" TEXT,
    "occupation_id" TEXT,
    "employment_type" "employment_type",
    "remote_type" "remote_type",
    "salary_min" DECIMAL(12,2),
    "salary_max" DECIMAL(12,2),
    "salary_currency" CHAR(3),
    "salary_period" "salary_period",
    "salary_basis" "salary_basis",
    "apply_url" TEXT NOT NULL,
    "source_url" TEXT,
    "posted_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_verified_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),
    "retrieved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "job_status" NOT NULL DEFAULT 'ACTIVE',
    "duplicate_group_id" TEXT,
    "is_canonical" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_duplicate_group" (
    "id" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "canonical_job_id" TEXT,
    "member_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_duplicate_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "kind" "skill_kind" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_skill" (
    "job_id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "method" "skill_extraction_method" NOT NULL DEFAULT 'DETERMINISTIC',
    "matched_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_skill_pkey" PRIMARY KEY ("job_id","skill_id")
);

-- CreateTable
CREATE TABLE "labour_market_series" (
    "id" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "dataset" TEXT NOT NULL,
    "measure" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "basis" "metric_basis" NOT NULL,
    "geography_id" TEXT,
    "occupation_id" TEXT,
    "granularity" "period_granularity" NOT NULL,
    "series_key" TEXT NOT NULL,
    "methodology_url" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "labour_market_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "labour_market_metric" (
    "id" TEXT NOT NULL,
    "series_id" TEXT NOT NULL,
    "period_start" DATE NOT NULL,
    "value" DECIMAL(18,4),
    "value_state" "value_state" NOT NULL,
    "source_version" TEXT,
    "retrieved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "labour_market_metric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geography_metric" (
    "id" TEXT NOT NULL,
    "geography_id" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "measure" TEXT NOT NULL,
    "basis" "metric_basis" NOT NULL,
    "occupation_id" TEXT,
    "period_start" DATE NOT NULL,
    "granularity" "period_granularity" NOT NULL,
    "value" DECIMAL(18,4),
    "value_state" "value_state" NOT NULL,
    "change" DECIMAL(18,4),
    "change_percent" DECIMAL(9,4),
    "rank" INTEGER,
    "sample_size" INTEGER,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geography_metric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_run" (
    "id" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "dataset" TEXT NOT NULL,
    "status" "ingestion_status" NOT NULL DEFAULT 'PENDING',
    "cursor" TEXT,
    "records_seen" INTEGER NOT NULL DEFAULT 0,
    "records_written" INTEGER NOT NULL DEFAULT 0,
    "records_skipped" INTEGER NOT NULL DEFAULT 0,
    "records_quarantined" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),
    "error" TEXT,
    "triggered_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingestion_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_error" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "source_id" TEXT,
    "kind" "ingestion_error_kind" NOT NULL,
    "message" TEXT NOT NULL,
    "raw_payload" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "ingestion_error_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_event" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "context" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "source_key_key" ON "source"("key");

-- CreateIndex
CREATE INDEX "source_kind_idx" ON "source"("kind");

-- CreateIndex
CREATE INDEX "source_activation_idx" ON "source"("activation");

-- CreateIndex
CREATE INDEX "geography_level_asgs_edition_idx" ON "geography"("level", "asgs_edition");

-- CreateIndex
CREATE INDEX "geography_parent_id_idx" ON "geography"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "geography_code_asgs_edition_key" ON "geography"("code", "asgs_edition");

-- CreateIndex
CREATE INDEX "occupation_level_classification_version_idx" ON "occupation"("level", "classification_version");

-- CreateIndex
CREATE INDEX "occupation_parent_id_idx" ON "occupation"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "occupation_code_classification_version_key" ON "occupation"("code", "classification_version");

-- CreateIndex
CREATE UNIQUE INDEX "company_normalized_name_key" ON "company"("normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "location_normalized_key_key" ON "location"("normalized_key");

-- CreateIndex
CREATE INDEX "location_geography_id_idx" ON "location"("geography_id");

-- CreateIndex
CREATE INDEX "location_state_code_idx" ON "location"("state_code");

-- CreateIndex
CREATE INDEX "job_content_hash_idx" ON "job"("content_hash");

-- CreateIndex
CREATE INDEX "job_is_synthetic_idx" ON "job"("is_synthetic");

-- CreateIndex
CREATE INDEX "job_status_last_seen_at_idx" ON "job"("status", "last_seen_at");

-- CreateIndex
CREATE INDEX "job_occupation_id_idx" ON "job"("occupation_id");

-- CreateIndex
CREATE INDEX "job_location_id_idx" ON "job"("location_id");

-- CreateIndex
CREATE INDEX "job_company_id_idx" ON "job"("company_id");

-- CreateIndex
CREATE INDEX "job_posted_at_idx" ON "job"("posted_at");

-- CreateIndex
CREATE INDEX "job_duplicate_group_id_idx" ON "job"("duplicate_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_source_key_source_id_key" ON "job"("source_key", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_duplicate_group_signature_key" ON "job_duplicate_group"("signature");

-- CreateIndex
CREATE UNIQUE INDEX "job_duplicate_group_canonical_job_id_key" ON "job_duplicate_group"("canonical_job_id");

-- CreateIndex
CREATE UNIQUE INDEX "skill_normalized_name_key" ON "skill"("normalized_name");

-- CreateIndex
CREATE INDEX "skill_kind_idx" ON "skill"("kind");

-- CreateIndex
CREATE INDEX "job_skill_skill_id_idx" ON "job_skill"("skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "labour_market_series_series_key_key" ON "labour_market_series"("series_key");

-- CreateIndex
CREATE INDEX "labour_market_series_source_key_dataset_idx" ON "labour_market_series"("source_key", "dataset");

-- CreateIndex
CREATE INDEX "labour_market_series_geography_id_idx" ON "labour_market_series"("geography_id");

-- CreateIndex
CREATE INDEX "labour_market_series_occupation_id_idx" ON "labour_market_series"("occupation_id");

-- CreateIndex
CREATE INDEX "labour_market_series_basis_idx" ON "labour_market_series"("basis");

-- CreateIndex
CREATE INDEX "labour_market_metric_period_start_idx" ON "labour_market_metric"("period_start");

-- CreateIndex
CREATE UNIQUE INDEX "labour_market_metric_series_id_period_start_key" ON "labour_market_metric"("series_id", "period_start");

-- CreateIndex
CREATE INDEX "geography_metric_measure_period_start_basis_idx" ON "geography_metric"("measure", "period_start", "basis");

-- CreateIndex
CREATE INDEX "geography_metric_geography_id_idx" ON "geography_metric"("geography_id");

-- CreateIndex
CREATE UNIQUE INDEX "geography_metric_geography_id_measure_basis_period_start_oc_key" ON "geography_metric"("geography_id", "measure", "basis", "period_start", "occupation_id");

-- CreateIndex
CREATE INDEX "ingestion_run_source_key_dataset_status_idx" ON "ingestion_run"("source_key", "dataset", "status");

-- CreateIndex
CREATE INDEX "ingestion_run_started_at_idx" ON "ingestion_run"("started_at");

-- CreateIndex
CREATE INDEX "ingestion_error_run_id_idx" ON "ingestion_error"("run_id");

-- CreateIndex
CREATE INDEX "ingestion_error_source_key_source_id_idx" ON "ingestion_error"("source_key", "source_id");

-- CreateIndex
CREATE INDEX "ingestion_error_occurred_at_idx" ON "ingestion_error"("occurred_at");

-- CreateIndex
CREATE INDEX "system_event_kind_occurred_at_idx" ON "system_event"("kind", "occurred_at");

-- CreateIndex
CREATE INDEX "system_event_occurred_at_idx" ON "system_event"("occurred_at");

-- AddForeignKey
ALTER TABLE "geography" ADD CONSTRAINT "geography_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "geography"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geography" ADD CONSTRAINT "geography_source_key_fkey" FOREIGN KEY ("source_key") REFERENCES "source"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occupation" ADD CONSTRAINT "occupation_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "occupation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "occupation" ADD CONSTRAINT "occupation_source_key_fkey" FOREIGN KEY ("source_key") REFERENCES "source"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "location" ADD CONSTRAINT "location_geography_id_fkey" FOREIGN KEY ("geography_id") REFERENCES "geography"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job" ADD CONSTRAINT "job_source_key_fkey" FOREIGN KEY ("source_key") REFERENCES "source"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job" ADD CONSTRAINT "job_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job" ADD CONSTRAINT "job_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job" ADD CONSTRAINT "job_occupation_id_fkey" FOREIGN KEY ("occupation_id") REFERENCES "occupation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job" ADD CONSTRAINT "job_duplicate_group_id_fkey" FOREIGN KEY ("duplicate_group_id") REFERENCES "job_duplicate_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_skill" ADD CONSTRAINT "job_skill_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_skill" ADD CONSTRAINT "job_skill_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labour_market_series" ADD CONSTRAINT "labour_market_series_source_key_fkey" FOREIGN KEY ("source_key") REFERENCES "source"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labour_market_series" ADD CONSTRAINT "labour_market_series_geography_id_fkey" FOREIGN KEY ("geography_id") REFERENCES "geography"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labour_market_series" ADD CONSTRAINT "labour_market_series_occupation_id_fkey" FOREIGN KEY ("occupation_id") REFERENCES "occupation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labour_market_metric" ADD CONSTRAINT "labour_market_metric_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "labour_market_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geography_metric" ADD CONSTRAINT "geography_metric_geography_id_fkey" FOREIGN KEY ("geography_id") REFERENCES "geography"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geography_metric" ADD CONSTRAINT "geography_metric_source_key_fkey" FOREIGN KEY ("source_key") REFERENCES "source"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_run" ADD CONSTRAINT "ingestion_run_source_key_fkey" FOREIGN KEY ("source_key") REFERENCES "source"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_error" ADD CONSTRAINT "ingestion_error_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "ingestion_run"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===========================================================================
-- Constraints and objects Prisma cannot express in the schema.
-- Added by hand at milestone 03. See docs/milestones/03-database.md
-- ===========================================================================

-- Missing data must never become zero (ADR-0002). A value is present only when
-- the state says so, and ZERO must actually be zero.
ALTER TABLE "labour_market_metric"
  ADD CONSTRAINT "labour_market_metric_value_state_check" CHECK (
    (value_state = 'PRESENT'::"value_state" AND value IS NOT NULL)
    OR (value_state = 'ZERO'::"value_state" AND value = 0)
    OR (value_state IN ('UNAVAILABLE'::"value_state", 'SUPPRESSED'::"value_state", 'NOT_COVERED'::"value_state") AND value IS NULL)
  );

ALTER TABLE "geography_metric"
  ADD CONSTRAINT "geography_metric_value_state_check" CHECK (
    (value_state = 'PRESENT'::"value_state" AND value IS NOT NULL)
    OR (value_state = 'ZERO'::"value_state" AND value = 0)
    OR (value_state IN ('UNAVAILABLE'::"value_state", 'SUPPRESSED'::"value_state", 'NOT_COVERED'::"value_state") AND value IS NULL)
  );

-- Only one RUNNING ingestion run per source and dataset (ADR-0005), so an
-- overlapping cron firing becomes a no-op rather than a double import.
CREATE UNIQUE INDEX "ingestion_run_single_active_idx"
  ON "ingestion_run" ("source_key", "dataset")
  WHERE status = 'RUNNING'::"ingestion_status";

-- Completes the geography_metric uniqueness. Postgres treats NULLs as
-- distinct, so the generated unique index does not constrain rows where
-- occupation_id is null, which is the all-occupations case and the most common
-- heatmap row.
CREATE UNIQUE INDEX "geography_metric_all_occupations_idx"
  ON "geography_metric" ("geography_id", "measure", "basis", "period_start")
  WHERE occupation_id IS NULL;

-- A synthetic record must name the fixture that produced it, and a real record
-- must not carry one (ADR-0009). Makes the two impossible to confuse in SQL.
ALTER TABLE "job"
  ADD CONSTRAINT "job_synthetic_fixture_check" CHECK (
    (is_synthetic = true AND synthetic_fixture_version IS NOT NULL)
    OR (is_synthetic = false AND synthetic_fixture_version IS NULL)
  );

-- A salary range must be ordered.
ALTER TABLE "job"
  ADD CONSTRAINT "job_salary_range_check" CHECK (
    salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max
  );

-- Any salary figure must state whether the employer reported it or the
-- provider estimated it. The two must never be presented identically.
ALTER TABLE "job"
  ADD CONSTRAINT "job_salary_basis_check" CHECK (
    (salary_min IS NULL AND salary_max IS NULL) OR salary_basis IS NOT NULL
  );

-- Containment layer 4 (ADR-0009): analytics read this view, never the job
-- table, so a summary can never be computed partly from fixtures.
--
-- SELECT * is expanded at creation time. A later migration that adds a column
-- to "job" must recreate this view, otherwise the column is simply absent here
-- and the query fails loudly rather than returning wrong data.
CREATE VIEW "job_real" AS
  SELECT * FROM "job" WHERE is_synthetic = false;

-- Supports the exclusion filter on the hot path.
CREATE INDEX "job_real_status_last_seen_idx"
  ON "job" ("status", "last_seen_at")
  WHERE is_synthetic = false;
