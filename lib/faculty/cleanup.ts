import { deleteFacultyNamespace } from "@/lib/faculty/indexing";
import { logFacultyError, logFacultyEvent } from "@/lib/faculty/logger";
import { deleteFacultySessionBlobs } from "@/lib/faculty/storage";
import { prisma } from "@/lib/prisma";

type CleanupReason = "signout" | "expired" | "manual" | "test";

type CleanupHooks = Partial<
  Record<
    | "markDeleted"
    | "deleteStorage"
    | "deleteVectors"
    | "deleteArtifacts"
    | "deleteChat"
    | "deleteWorkspace"
    | "deleteUploads"
    | "deleteSession",
    () => Promise<void>
  >
>;

let cleanupHooks: CleanupHooks = {};

export function __setFacultyCleanupTestHooks(hooks: CleanupHooks) {
  cleanupHooks = hooks;
}

export async function cleanupFacultySession(input: {
  sessionId: string;
  reason: CleanupReason;
}): Promise<{
  ok: true;
  sessionId: string;
  removedUploads: number;
  removedArtifacts: number;
  removedVectorDocuments: number;
}> {
  logFacultyEvent("faculty_cleanup_started", {
    sessionId: input.sessionId,
    reason: input.reason
  });

  const [uploadCount, artifactCount] = await Promise.all([
    prisma.facultyUpload.count({ where: { sessionId: input.sessionId } }),
    prisma.facultyArtifact.count({ where: { sessionId: input.sessionId } })
  ]).catch(() => [0, 0] as const);
  let removedVectorDocuments = 0;

  await runCleanupStep("markDeleted", input, async () => {
    await cleanupHooks.markDeleted?.();
    await prisma.facultySession.updateMany({
      where: { id: input.sessionId, deletedAt: null },
      data: { deletedAt: new Date(), status: "deleted" }
    });
  });

  await runCleanupStep("deleteStorage", input, async () => {
    await cleanupHooks.deleteStorage?.();
    await deleteFacultySessionBlobs(input.sessionId);
  });

  await runCleanupStep("deleteVectors", input, async () => {
    await cleanupHooks.deleteVectors?.();
    const result = await deleteFacultyNamespace({
      sessionId: input.sessionId
    });
    removedVectorDocuments = result.deletedCount;
  });

  await runCleanupStep("deleteArtifacts", input, async () => {
    await cleanupHooks.deleteArtifacts?.();
    await prisma.facultyArtifact.deleteMany({
      where: { sessionId: input.sessionId }
    });
  });

  await runCleanupStep("deleteChat", input, async () => {
    await cleanupHooks.deleteChat?.();
    await prisma.facultyChatMessage.deleteMany({
      where: { sessionId: input.sessionId }
    });
  });

  await runCleanupStep("deleteWorkspace", input, async () => {
    await cleanupHooks.deleteWorkspace?.();
    await prisma.facultyWorkspace.deleteMany({
      where: { sessionId: input.sessionId }
    });
  });

  await runCleanupStep("deleteUploads", input, async () => {
    await cleanupHooks.deleteUploads?.();
    await prisma.facultyUpload.deleteMany({
      where: { sessionId: input.sessionId }
    });
  });

  await runCleanupStep("deleteSession", input, async () => {
    await cleanupHooks.deleteSession?.();
    await prisma.facultySession.deleteMany({
      where: { id: input.sessionId }
    });
  });

  logFacultyEvent("faculty_cleanup_complete", {
    sessionId: input.sessionId,
    reason: input.reason,
    removedUploads: uploadCount,
    removedArtifacts: artifactCount,
    removedVectorDocuments
  });

  return {
    ok: true,
    sessionId: input.sessionId,
    removedUploads: uploadCount,
    removedArtifacts: artifactCount,
    removedVectorDocuments
  };
}

async function runCleanupStep(
  step: string,
  input: {
    sessionId: string;
    reason: CleanupReason;
  },
  run: () => Promise<void>
) {
  try {
    await run();
    logFacultyEvent("faculty_cleanup_complete", {
      sessionId: input.sessionId,
      reason: input.reason,
      step,
      stepStatus: "ok"
    });
  } catch (error) {
    logFacultyError("faculty_error", error, {
      sessionId: input.sessionId,
      reason: input.reason,
      step,
      stepStatus: "failed_continued"
    });
  }
}
