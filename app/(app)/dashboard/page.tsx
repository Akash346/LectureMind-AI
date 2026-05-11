import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { headers } from "next/headers";

import {
  DashboardClient,
  type ChatCard
} from "@/components/dashboard/DashboardClient";
import { authOptions } from "@/lib/auth";
import { logAuthDebug } from "@/lib/auth-debug";
import { prisma } from "@/lib/prisma";
import { getYouTubeThumbnail } from "@/lib/utils/youtube";

export default async function DashboardPage({
  searchParams
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  await searchParams;
  const requestHeaders = await headers();
  const isDemoRequest = requestHeaders.get("x-lecturemind-demo") === "true";

  if (isDemoRequest) {
    return <DashboardClient initialChats={[]} initialIsDemo />;
  }

  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/auth/signin");
  }

  const notebooks = await prisma.notebook.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      userId: true,
      title: true,
      sourceUrl: true,
      thumbnailUrl: true,
      createdAt: true,
      artifacts: {
        where: {
          type: {
            in: ["OUTLINE", "MIND_MAP", "QUIZ"]
          }
        },
        select: {
          type: true,
          status: true
        }
      }
    }
  });

  logAuthDebug("dashboard_chats_loaded", {
    sessionUserId: session.user.id,
    chatOwnerIds: Array.from(new Set(notebooks.map((item) => item.userId))),
    chatCount: notebooks.length
  });

  return (
    <DashboardClient
      initialChats={notebooks.map((item) => mapNotebookToChat(item))}
      user={{
        name: session.user.name,
        image: session.user.image
      }}
    />
  );
}

function mapNotebookToChat(item: {
  id: string;
  title: string;
  sourceUrl: string;
  thumbnailUrl: string | null;
  createdAt: Date;
  artifacts: Array<{
    type: string;
    status: string;
  }>;
}): ChatCard {
  const isReady = (type: "OUTLINE" | "MIND_MAP" | "QUIZ") =>
    item.artifacts.some(
      (artifact) => artifact.type === type && artifact.status === "READY"
    );

  return {
    id: item.id,
    title: item.title ?? "Untitled Chat",
    videoUrl: item.sourceUrl,
    thumbnailUrl: item.thumbnailUrl ?? getYouTubeThumbnail(item.sourceUrl),
    createdAt: item.createdAt.toISOString(),
    artifacts: {
      outline: isReady("OUTLINE"),
      mindMap: isReady("MIND_MAP"),
      quiz: isReady("QUIZ")
    }
  };
}
