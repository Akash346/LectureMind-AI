import { NextResponse } from "next/server";
import { z } from "zod";

import { getApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({
  notebookId: z.string().min(1)
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ notebookId: string }> }
) {
  const user = await getApiUser();

  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await params);

  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid notebook." }, { status: 400 });
  }

  const notebook = await prisma.notebook.findFirst({
    where: {
      id: parsedParams.data.notebookId,
      userId: user.id
    },
    include: {
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
  });

  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found." }, { status: 404 });
  }

  const latestJob = notebook.jobs[0] ?? null;

  return NextResponse.json({
    notebookId: notebook.id,
    status: notebook.status,
    videoId: notebook.videoId,
    videoTitle: notebook.videoTitle,
    thumbnailUrl: notebook.thumbnailUrl,
    durationSec: notebook.durationSec,
    segmentCount: notebook._count.evidenceSegments,
    errorType: notebook.errorType,
    errorMessage: notebook.errorMessage,
    job: latestJob
      ? {
          id: latestJob.id,
          status: latestJob.status,
          progress: latestJob.progress,
          progressPercent: latestJob.progressPercent,
          currentStep: latestJob.currentStep,
          errorType: latestJob.errorType,
          errorMessage: latestJob.errorMessage,
          errorCode: latestJob.errorCode,
          safeErrorMessage: latestJob.safeErrorMessage,
          attempts: latestJob.attempts,
          attemptCount: latestJob.attemptCount,
          maxAttempts: latestJob.maxAttempts,
          metadata: latestJob.metadata
        }
      : null
  });
}
