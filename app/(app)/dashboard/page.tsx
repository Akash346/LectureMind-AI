import { redirect } from "next/navigation";

import {
  DashboardClient,
  type ChatCard
} from "@/components/dashboard/DashboardClient";
import { logAuthDebug } from "@/lib/auth-debug";
import { ensureDemoNotebook } from "@/lib/demo-notebook";
import { DEMO_USER_EMAIL } from "@/lib/demo-user";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { getYouTubeThumbnail } from "@/lib/utils/youtube";

export default async function DashboardPage() {
  const user = await requireUser();

  if (!user?.id) {
    redirect("/auth/signin");
  }

  if (user.email === DEMO_USER_EMAIL) {
    await ensureDemoNotebook({ userId: user.id });
  }

  const notebooks = await prisma.notebook.findMany({
    where: { userId: user.id },
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
            in: [
              "OUTLINE",
              "SUMMARY_SHORT",
              "SUMMARY_MEDIUM",
              "FLASHCARDS",
              "QUIZ",
              "MIND_MAP",
              "STUDY_GUIDE"
            ]
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
    sessionUserId: user.id,
    chatOwnerIds: Array.from(new Set(notebooks.map((item) => item.userId))),
    chatCount: notebooks.length
  });

  return (
    <DashboardClient
      initialChats={notebooks.map((item) => mapNotebookToChat(item))}
      user={{
        name: user.name,
        image: user.image
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
  const isReady = (
    type:
      | "OUTLINE"
      | "SUMMARY_SHORT"
      | "SUMMARY_MEDIUM"
      | "FLASHCARDS"
      | "QUIZ"
      | "MIND_MAP"
      | "STUDY_GUIDE"
  ) =>
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
      summary: isReady("SUMMARY_SHORT") || isReady("SUMMARY_MEDIUM"),
      flashcards: isReady("FLASHCARDS"),
      mindMap: isReady("MIND_MAP"),
      quiz: isReady("QUIZ"),
      report: isReady("STUDY_GUIDE")
    }
  };
}
