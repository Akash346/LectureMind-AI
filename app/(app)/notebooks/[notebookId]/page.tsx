import { notFound } from "next/navigation";

import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import type { StudioArtifact } from "@/components/workspace/artifacts/types";
import { aiErrorCopy } from "@/lib/ai/errors";
import { normalizeArtifactLanguage } from "@/lib/ai/schemas";
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
        chatMessages: {
          orderBy: {
            createdAt: "desc"
          },
          take: 50
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
              progressPercent: notebook.jobs[0].progressPercent,
              currentStep: notebook.jobs[0].currentStep,
              errorType: notebook.jobs[0].errorType,
              errorMessage: notebook.jobs[0].errorMessage,
              errorCode: notebook.jobs[0].errorCode,
              safeErrorMessage: notebook.jobs[0].safeErrorMessage,
              attempts: notebook.jobs[0].attempts,
              attemptCount: notebook.jobs[0].attemptCount,
              maxAttempts: notebook.jobs[0].maxAttempts,
              metadata: notebook.jobs[0].metadata as Record<string, unknown> | null
            }
          : null,
        createdAt: formatDate(notebook.createdAt),
        artifacts: notebook.artifacts.map((artifact) => {
          const errorCopy =
            artifact.errorType && artifact.errorType in aiErrorCopy
              ? aiErrorCopy[artifact.errorType as keyof typeof aiErrorCopy]
              : null;

          return {
            id: artifact.id,
            notebookId: artifact.notebookId,
            type: artifact.type,
            status: artifact.status,
            language: normalizeArtifactLanguage(artifact.language),
            json: artifact.json as StudioArtifact["json"],
            errorType: artifact.errorType,
            errorTitle: errorCopy?.title ?? null,
            errorMessage: artifact.errorMessage ?? errorCopy?.message ?? null,
            generatedBy: artifact.generatedBy,
            verifiedAt: artifact.verifiedAt?.toISOString() ?? null,
            sourceSegmentCount: artifact.sourceSegmentCount,
            metadata:
              artifact.metadata &&
              typeof artifact.metadata === "object" &&
              !Array.isArray(artifact.metadata)
                ? (artifact.metadata as Record<string, unknown>)
                : null,
            updatedAt: artifact.updatedAt.toISOString()
          } satisfies StudioArtifact;
        })
      }}
      initialChatMessages={notebook.chatMessages
        .slice()
        .reverse()
        .filter((message) => message.role !== "SYSTEM")
        .map((message) => {
          const citationsJson =
            message.citationsJson &&
            typeof message.citationsJson === "object" &&
            !Array.isArray(message.citationsJson)
              ? (message.citationsJson as Record<string, unknown>)
              : null;
          const citations = Array.isArray(citationsJson?.citations)
            ? citationsJson.citations.filter(isChatCitation)
            : undefined;

          return {
            id: message.id,
            role: message.role === "USER" ? ("user" as const) : ("assistant" as const),
            content: message.content,
            citations,
            retrievalMode:
              citationsJson?.retrievalMode === "azure_hybrid" ||
              citationsJson?.retrievalMode === "local_lexical_fallback"
                ? (citationsJson.retrievalMode as
                    | "azure_hybrid"
                    | "local_lexical_fallback")
                : undefined,
            contextSegmentCount:
              typeof citationsJson?.contextSegmentCount === "number"
                ? citationsJson.contextSegmentCount
                : undefined
          };
        })}
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

function isChatCitation(value: unknown): value is {
  evidenceSegmentId: string;
  startSec: number;
  endSec: number;
  label: string;
} {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { evidenceSegmentId?: unknown }).evidenceSegmentId ===
      "string" &&
    typeof (value as { startSec?: unknown }).startSec === "number" &&
    typeof (value as { endSec?: unknown }).endSec === "number" &&
    typeof (value as { label?: unknown }).label === "string"
  );
}
