import { Prisma } from "@prisma/client";

import { logAuthDebug } from "@/lib/auth-debug";
import { prisma } from "@/lib/prisma";
import { deleteNotebookFromIndex } from "@/lib/search/index-evidence";

export type DeleteNotebookResult =
  | {
      ok: true;
      notebookId: string;
      deletedCounts: {
        evidenceSegments: number;
        artifacts: number;
        chatMessages: number;
        jobs: number;
        notebooks: number;
      };
      indexDeleted: boolean;
      indexErrorCode: string | null;
    }
  | {
      ok: false;
      status: 401 | 403 | 404 | 500;
      message: string;
      notebookId: string;
      notebookOwnerId: string | null;
    };

export async function deleteNotebookForUser({
  notebookId,
  userId
}: {
  notebookId: string;
  userId: string | null;
}): Promise<DeleteNotebookResult> {
  if (!userId) {
    logNotebookDeleteDebug({
      notebookId,
      sessionUserId: null,
      notebookOwnerId: null,
      deleteAllowed: false,
      reason: "unauthorized"
    });

    return {
      ok: false,
      status: 401,
      message: "Unauthorized.",
      notebookId,
      notebookOwnerId: null
    };
  }

  const notebook = await prisma.notebook.findUnique({
    where: { id: notebookId },
    select: {
      id: true,
      userId: true
    }
  });

  if (!notebook) {
    logNotebookDeleteDebug({
      notebookId,
      sessionUserId: userId,
      notebookOwnerId: null,
      deleteAllowed: false,
      reason: "not_found"
    });

    return {
      ok: false,
      status: 404,
      message: "Notebook not found.",
      notebookId,
      notebookOwnerId: null
    };
  }

  if (notebook.userId !== userId) {
    logNotebookDeleteDebug({
      notebookId,
      sessionUserId: userId,
      notebookOwnerId: notebook.userId,
      deleteAllowed: false,
      reason: "forbidden"
    });

    return {
      ok: false,
      status: 403,
      message: "You do not have access to delete this notebook.",
      notebookId,
      notebookOwnerId: notebook.userId
    };
  }

  let indexDeleted = false;
  let indexErrorCode: string | null = null;

  try {
    const indexResult = await deleteNotebookFromIndex(notebook.id);
    indexDeleted = indexResult.deleted;
    indexErrorCode = indexResult.errorCode ?? null;
  } catch (error) {
    logNotebookDeleteDebug({
      notebookId,
      sessionUserId: userId,
      notebookOwnerId: notebook.userId,
      deleteAllowed: true,
      reason: "index_delete_failed",
      errorName: error instanceof Error ? error.name : "UnknownError"
    });

    return {
      ok: false,
      status: 500,
      message: "Could not delete notebook search data. Please try again.",
      notebookId,
      notebookOwnerId: notebook.userId
    };
  }

  try {
    const deleted = await prisma.$transaction(async (tx) => {
      const [evidenceSegments, artifacts, chatMessages, jobs] =
        await Promise.all([
          tx.evidenceSegment.deleteMany({ where: { notebookId: notebook.id } }),
          tx.artifact.deleteMany({ where: { notebookId: notebook.id } }),
          tx.chatMessage.deleteMany({ where: { notebookId: notebook.id } }),
          tx.job.deleteMany({ where: { notebookId: notebook.id } })
        ]);

      await tx.notebook.delete({
        where: { id: notebook.id }
      });

      return {
        evidenceSegments: evidenceSegments.count,
        artifacts: artifacts.count,
        chatMessages: chatMessages.count,
        jobs: jobs.count,
        notebooks: 1
      };
    });

    logNotebookDeleteDebug({
      notebookId,
      sessionUserId: userId,
      notebookOwnerId: notebook.userId,
      deleteAllowed: true,
      evidenceSegmentDeleteCount: deleted.evidenceSegments,
      artifactDeleteCount: deleted.artifacts,
      chatMessageDeleteCount: deleted.chatMessages,
      jobDeleteCount: deleted.jobs,
      notebookDeleteCount: deleted.notebooks,
      indexDeleted,
      indexErrorCode
    });

    return {
      ok: true,
      notebookId,
      deletedCounts: deleted,
      indexDeleted,
      indexErrorCode
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return {
        ok: false,
        status: 404,
        message: "Notebook not found.",
        notebookId,
        notebookOwnerId: notebook.userId
      };
    }

    logNotebookDeleteDebug({
      notebookId,
      sessionUserId: userId,
      notebookOwnerId: notebook.userId,
      deleteAllowed: true,
      reason: "db_delete_failed",
      errorName: error instanceof Error ? error.name : "UnknownError"
    });

    return {
      ok: false,
      status: 500,
      message: "Could not delete this notebook. Please try again.",
      notebookId,
      notebookOwnerId: notebook.userId
    };
  }
}

function logNotebookDeleteDebug(
  fields: {
    notebookId: string;
    sessionUserId: string | null;
    notebookOwnerId: string | null;
    deleteAllowed: boolean;
    reason?: string;
    evidenceSegmentDeleteCount?: number;
    artifactDeleteCount?: number;
    chatMessageDeleteCount?: number;
    jobDeleteCount?: number;
    notebookDeleteCount?: number;
    indexDeleted?: boolean;
    indexErrorCode?: string | null;
    errorName?: string;
  }
) {
  logAuthDebug("notebook_delete", fields);
}
