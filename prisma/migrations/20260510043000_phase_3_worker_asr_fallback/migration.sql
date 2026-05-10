-- Phase 3 worker/ASR fallback metadata.
-- These additions are nullable/defaulted so existing Phase 2 rows stay valid.

ALTER TABLE "EvidenceSegment"
ADD COLUMN "language" TEXT,
ADD COLUMN "extractionEngine" TEXT,
ADD COLUMN "rawSource" TEXT;

ALTER TABLE "Job"
ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "startedAt" TIMESTAMP(3),
ADD COLUMN "finishedAt" TIMESTAMP(3),
ADD COLUMN "metadata" JSONB;
