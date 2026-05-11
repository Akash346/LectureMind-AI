import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { headers } from "next/headers";

import type { ChatMessage } from "@/components/workspace/ChatSurface";
import { WorkspaceRouteClient } from "@/components/workspace/WorkspaceRouteClient";
import { authOptions } from "@/lib/auth";
import { formatTimestamp } from "@/lib/citations";
import { prisma } from "@/lib/prisma";
import { getYouTubeThumbnail } from "@/lib/utils/youtube";

export default async function ChatPage({
  params,
  searchParams
}: {
  params: Promise<{ chatId: string }>;
  searchParams: Promise<{ demo?: string }>;
}) {
  const { chatId } = await params;
  await searchParams;
  const requestHeaders = await headers();
  const isDemoRequest = requestHeaders.get("x-lecturemind-demo") === "true";

  if (isDemoRequest) {
    return <WorkspaceRouteClient chatId={chatId} initialIsDemo />;
  }

  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  const [activeNotebook, notebooks] = await Promise.all([
    prisma.notebook.findFirst({
      where: {
        id: chatId,
        userId: session.user.id
      },
      select: {
        id: true,
        title: true,
        sourceUrl: true,
        thumbnailUrl: true,
        status: true,
        language: true,
        videoId: true,
        videoTitle: true,
        durationSec: true,
        errorType: true,
        errorMessage: true,
        createdAt: true,
        chatMessages: {
          orderBy: {
            createdAt: "asc"
          },
          take: 80,
          select: {
            id: true,
            role: true,
            content: true,
            citationsJson: true
          }
        },
        _count: {
          select: {
            evidenceSegments: true
          }
        }
      }
    }),
    prisma.notebook.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        title: true,
        sourceUrl: true,
        thumbnailUrl: true,
        createdAt: true
      }
    })
  ]);

  if (!activeNotebook) {
    notFound();
  }

  return (
    <WorkspaceRouteClient
      chatId={chatId}
      initialChat={mapNotebookToWorkspaceChat(activeNotebook)}
      initialChats={notebooks.map((item) => mapNotebookToWorkspaceChat(item))}
      initialMessages={
        activeNotebook?.chatMessages.map((message) =>
          mapChatMessageToSurfaceMessage(message)
        ) ?? []
      }
    />
  );
}

function mapNotebookToWorkspaceChat(item: {
  id: string;
  title: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  createdAt: Date;
  status?: string;
  language?: string;
  videoId?: string | null;
  videoTitle?: string | null;
  durationSec?: number | null;
  errorType?: string | null;
  errorMessage?: string | null;
  _count?: {
    evidenceSegments: number;
  };
}) {
  return {
    id: item.id,
    title: item.title ?? "Untitled Chat",
    videoUrl: item.sourceUrl,
    thumbnailUrl: item.thumbnailUrl ?? getYouTubeThumbnail(item.sourceUrl),
    createdAt: item.createdAt.toISOString(),
    status: item.status,
    language: item.language,
    videoId: item.videoId ?? null,
    videoTitle: item.videoTitle ?? null,
    durationSec: item.durationSec ?? null,
    errorType: item.errorType ?? null,
    errorMessage: item.errorMessage ?? null,
    segmentCount: item._count?.evidenceSegments ?? 0
  };
}

function mapChatMessageToSurfaceMessage(message: {
  id: string;
  role: string;
  content: string;
  citationsJson: unknown;
}): ChatMessage {
  const citationText = extractCitationText(message.citationsJson);

  return {
    id: message.id,
    role: message.role === "USER" ? "user" : "assistant",
    content:
      message.role === "ASSISTANT" && citationText
        ? [message.content, citationText].join("\n\n")
        : message.content
  };
}

function extractCitationText(citationsJson: unknown) {
  if (!citationsJson || typeof citationsJson !== "object") return "";

  const citations = (citationsJson as { citations?: unknown }).citations;
  if (!Array.isArray(citations)) return "";

  return citations
    .map((citation) => {
      if (!citation || typeof citation !== "object") return null;
      const item = citation as { label?: unknown; startSec?: unknown };
      const seconds =
        typeof item.startSec === "number" ? item.startSec : undefined;
      const label =
        typeof item.label === "string"
          ? item.label
          : seconds !== undefined
            ? formatTimestamp(seconds)
            : null;

      return label ? `[${label}]` : null;
    })
    .filter(Boolean)
    .join(" ");
}
