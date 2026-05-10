-- Phase 4 AI artifact generation metadata.
-- These additions are nullable so existing placeholder artifacts stay valid.

ALTER TABLE "Artifact"
ADD COLUMN "errorType" TEXT,
ADD COLUMN "errorMessage" TEXT,
ADD COLUMN "generatedBy" TEXT,
ADD COLUMN "verifiedAt" TIMESTAMP(3),
ADD COLUMN "sourceSegmentCount" INTEGER,
ADD COLUMN "metadata" JSONB;
