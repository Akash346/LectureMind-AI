-- CreateTable
CREATE TABLE "FacultySession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "lectureUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'created',
    "azureNamespace" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "FacultySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacultyWorkspace" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "title" TEXT,
    "lectureUrl" TEXT NOT NULL,
    "transcriptText" TEXT,
    "segmentCount" INTEGER NOT NULL DEFAULT 0,
    "indexedCount" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacultyWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacultyUpload" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "ocrStatus" TEXT NOT NULL DEFAULT 'pending',
    "ocrText" TEXT,
    "ocrJson" JSONB,
    "confidenceScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacultyUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacultyArtifact" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "title" TEXT,
    "json" JSONB,
    "storageKey" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FacultyArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacultyChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacultyChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FacultySession_workspaceId_key" ON "FacultySession"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "FacultySession_azureNamespace_key" ON "FacultySession"("azureNamespace");

-- CreateIndex
CREATE INDEX "FacultySession_expiresAt_idx" ON "FacultySession"("expiresAt");

-- CreateIndex
CREATE INDEX "FacultySession_lastActiveAt_idx" ON "FacultySession"("lastActiveAt");

-- CreateIndex
CREATE INDEX "FacultySession_deletedAt_idx" ON "FacultySession"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FacultyWorkspace_sessionId_key" ON "FacultyWorkspace"("sessionId");

-- CreateIndex
CREATE INDEX "FacultyWorkspace_sessionId_idx" ON "FacultyWorkspace"("sessionId");

-- CreateIndex
CREATE INDEX "FacultyWorkspace_status_idx" ON "FacultyWorkspace"("status");

-- CreateIndex
CREATE INDEX "FacultyUpload_sessionId_idx" ON "FacultyUpload"("sessionId");

-- CreateIndex
CREATE INDEX "FacultyUpload_ocrStatus_idx" ON "FacultyUpload"("ocrStatus");

-- CreateIndex
CREATE INDEX "FacultyArtifact_sessionId_idx" ON "FacultyArtifact"("sessionId");

-- CreateIndex
CREATE INDEX "FacultyArtifact_type_idx" ON "FacultyArtifact"("type");

-- CreateIndex
CREATE UNIQUE INDEX "FacultyArtifact_sessionId_type_key" ON "FacultyArtifact"("sessionId", "type");

-- CreateIndex
CREATE INDEX "FacultyChatMessage_sessionId_idx" ON "FacultyChatMessage"("sessionId");

-- CreateIndex
CREATE INDEX "FacultyChatMessage_createdAt_idx" ON "FacultyChatMessage"("createdAt");

-- AddForeignKey
ALTER TABLE "FacultyWorkspace" ADD CONSTRAINT "FacultyWorkspace_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "FacultySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacultyUpload" ADD CONSTRAINT "FacultyUpload_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "FacultySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacultyArtifact" ADD CONSTRAINT "FacultyArtifact_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "FacultySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacultyChatMessage" ADD CONSTRAINT "FacultyChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "FacultySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
