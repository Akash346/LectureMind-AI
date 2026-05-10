-- CreateEnum
CREATE TYPE "EvidenceSourceType" AS ENUM ('CAPTION', 'AUTO_CAPTION', 'ASR', 'METADATA');

-- CreateTable
CREATE TABLE "EvidenceSegment" (
    "id" TEXT NOT NULL,
    "notebookId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "startSec" DOUBLE PRECISION NOT NULL,
    "endSec" DOUBLE PRECISION NOT NULL,
    "text" TEXT NOT NULL,
    "sourceType" "EvidenceSourceType" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceSegment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvidenceSegment_notebookId_startSec_idx" ON "EvidenceSegment"("notebookId", "startSec");

-- CreateIndex
CREATE INDEX "EvidenceSegment_videoId_idx" ON "EvidenceSegment"("videoId");

-- AddForeignKey
ALTER TABLE "EvidenceSegment" ADD CONSTRAINT "EvidenceSegment_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "Notebook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
