"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isVideoProcessingError } from "@/lib/video-errors";
import { newNotebookSchema } from "@/lib/validators";
import { parseYouTubeUrl } from "@/lib/youtube/url";

const defaultArtifacts = [
  "OUTLINE",
  "SUMMARY_SHORT",
  "STUDY_GUIDE",
  "FLASHCARDS",
  "QUIZ",
  "MIND_MAP"
] as const;

export type CreateNotebookState = {
  error?: string;
};

export async function createNotebook(
  _previousState: CreateNotebookState,
  formData: FormData
): Promise<CreateNotebookState> {
  const user = await requireUser();
  const parsed = newNotebookSchema.safeParse({
    sourceUrl: formData.get("sourceUrl"),
    language: formData.get("language") || "en"
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Enter a valid YouTube URL."
    };
  }

  let parsedUrl: ReturnType<typeof parseYouTubeUrl>;

  try {
    parsedUrl = parseYouTubeUrl(parsed.data.sourceUrl);
  } catch (error) {
    return {
      error: isVideoProcessingError(error)
        ? error.userMessage
        : "Paste a supported public YouTube video URL."
    };
  }

  const notebook = await prisma.notebook.create({
    data: {
      userId: user.id,
      sourceUrl: parsedUrl.normalizedUrl,
      videoId: parsedUrl.videoId,
      language: parsed.data.language,
      status: "PENDING",
      title: `YouTube lecture ${parsedUrl.videoId}`,
      artifacts: {
        create: defaultArtifacts.map((type) => ({
          type,
          language: parsed.data.language,
          status: "EMPTY"
        }))
      }
    },
    select: {
      id: true
    }
  });

  revalidatePath("/dashboard");
  redirect(`/notebooks/${notebook.id}`);
}

export async function deleteNotebook(formData: FormData) {
  const user = await requireUser();
  const notebookId = String(formData.get("notebookId") ?? "");

  if (!notebookId) {
    return;
  }

  await prisma.notebook.deleteMany({
    where: {
      id: notebookId,
      userId: user.id
    }
  });

  revalidatePath("/dashboard");
}
