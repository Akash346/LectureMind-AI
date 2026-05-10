import { notFound } from "next/navigation";

import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { formatDate } from "@/lib/utils";

export default async function WorkspacePage({
  params
}: {
  params: Promise<{ notebookId: string }>;
}) {
  const { notebookId } = await params;
  const user = await requireUser();
  const [notebook, preference] = await Promise.all([
    prisma.notebook.findFirst({
      where: {
        id: notebookId,
        userId: user.id
      },
      include: {
        artifacts: {
          orderBy: {
            createdAt: "asc"
          }
        },
        jobs: {
          orderBy: {
            updatedAt: "desc"
          },
          take: 1
        },
        _count: {
          select: {
            evidenceSegments: true
          }
        }
      }
    }),
    prisma.userPreference.findUnique({
      where: { userId: user.id }
    })
  ]);

  if (!notebook) {
    notFound();
  }

  return (
    <WorkspaceShell
      notebook={{
        id: notebook.id,
        title: notebook.title,
        sourceUrl: notebook.sourceUrl,
        status: notebook.status,
        language: notebook.language,
        videoId: notebook.videoId,
        videoTitle: notebook.videoTitle,
        thumbnailUrl: notebook.thumbnailUrl,
        durationSec: notebook.durationSec,
        errorType: notebook.errorType,
        errorMessage: notebook.errorMessage,
        segmentCount: notebook._count.evidenceSegments,
        latestJob: notebook.jobs[0]
          ? {
              status: notebook.jobs[0].status,
              progress: notebook.jobs[0].progress,
              currentStep: notebook.jobs[0].currentStep,
              errorType: notebook.jobs[0].errorType,
              errorMessage: notebook.jobs[0].errorMessage,
              attempts: notebook.jobs[0].attempts,
              metadata: notebook.jobs[0].metadata as Record<string, unknown> | null
            }
          : null,
        createdAt: formatDate(notebook.createdAt),
        artifacts: notebook.artifacts.map((artifact) => ({
          id: artifact.id,
          type: artifact.type,
          status: artifact.status,
          language: artifact.language
        }))
      }}
      preference={{
        theme: preference?.theme ?? "system",
        defaultLanguage: preference?.defaultLanguage ?? "en",
        chatMode: preference?.chatMode ?? "default",
        responseLength: preference?.responseLength ?? "default"
      }}
      user={user}
    />
  );
}
