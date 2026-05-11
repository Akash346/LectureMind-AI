import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { headers } from "next/headers";

import { WorkspaceRouteClient } from "@/components/workspace/WorkspaceRouteClient";
import { authOptions } from "@/lib/auth";
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
        createdAt: true
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

  return (
    <WorkspaceRouteClient
      chatId={chatId}
      initialChat={
        activeNotebook ? mapNotebookToWorkspaceChat(activeNotebook) : null
      }
      initialChats={notebooks.map((item) => mapNotebookToWorkspaceChat(item))}
    />
  );
}

function mapNotebookToWorkspaceChat(item: {
  id: string;
  title: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  createdAt: Date;
}) {
  return {
    id: item.id,
    title: item.title ?? "Untitled Chat",
    videoUrl: item.sourceUrl,
    thumbnailUrl: item.thumbnailUrl ?? getYouTubeThumbnail(item.sourceUrl),
    createdAt: item.createdAt.toISOString()
  };
}
