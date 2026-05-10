-- Phase 5 durable jobs, retrieval metadata, and evidence indexing state.
-- Existing Phase 1-4 columns are preserved for backward compatibility.

ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "Job"
ADD COLUMN "userId" TEXT,
ADD COLUMN "progressPercent" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "errorCode" TEXT,
ADD COLUMN "safeErrorMessage" TEXT,
ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "maxAttempts" INTEGER NOT NULL DEFAULT 2;

UPDATE "Job"
SET
  "progressPercent" = "progress",
  "attemptCount" = "attempts",
  "errorCode" = "errorType",
  "safeErrorMessage" = "errorMessage"
WHERE "progressPercent" = 0 OR "attemptCount" = 0;

ALTER TABLE "Job"
ADD CONSTRAINT "Job_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Job_userId_status_idx" ON "Job"("userId", "status");
CREATE INDEX "Job_type_status_idx" ON "Job"("type", "status");

ALTER TABLE "EvidenceSegment"
ADD COLUMN "embeddingStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN "embeddingModel" TEXT,
ADD COLUMN "embeddingErrorCode" TEXT,
ADD COLUMN "embeddingErrorMessage" TEXT,
ADD COLUMN "indexedAt" TIMESTAMP(3),
ADD COLUMN "searchDocumentId" TEXT;

CREATE INDEX "EvidenceSegment_notebookId_embeddingStatus_idx"
ON "EvidenceSegment"("notebookId", "embeddingStatus");

CREATE INDEX "EvidenceSegment_notebookId_indexedAt_idx"
ON "EvidenceSegment"("notebookId", "indexedAt");
