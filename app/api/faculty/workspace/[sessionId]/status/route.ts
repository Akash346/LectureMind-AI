import { NextResponse } from "next/server";
import { z } from "zod";

import { assertFacultySession } from "@/lib/faculty/session";
import { prisma } from "@/lib/prisma";
import { extractYouTubeId } from "@/lib/utils/youtube";

const paramsSchema = z.object({
  sessionId: z.string().min(1)
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const parsed = paramsSchema.safeParse(await params);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Faculty session." }, { status: 400 });
  }

  await assertFacultySession(parsed.data.sessionId);
  const [workspace, artifacts] = await Promise.all([
    prisma.facultyWorkspace.findUnique({
      where: { sessionId: parsed.data.sessionId },
      select: {
        status: true,
        segmentCount: true,
        indexedCount: true,
        transcriptText: true,
        title: true,
        lectureUrl: true
      }
    }),
    prisma.facultyArtifact.findMany({
      where: { sessionId: parsed.data.sessionId },
      select: {
        id: true,
        type: true,
        status: true,
        title: true,
        json: true,
        storageKey: true,
        errorCode: true,
        errorMessage: true
      }
    })
  ]);

  const ingestStatus = artifacts.find((artifact) => artifact.type === "lecture_ingest");

  return NextResponse.json({
    sessionId: parsed.data.sessionId,
    status: workspace?.status ?? "pending",
    title: workspace?.title ?? null,
    lectureUrl: workspace?.lectureUrl ?? null,
    videoId: workspace?.lectureUrl ? extractYouTubeId(workspace.lectureUrl) : null,
    transcriptText: workspace?.transcriptText ?? null,
    segmentCount: workspace?.segmentCount ?? 0,
    indexedCount: workspace?.indexedCount ?? 0,
    ingestErrorCode: ingestStatus?.errorCode ?? null,
    ingestErrorMessage: ingestStatus?.errorMessage ?? null,
    artifacts: artifacts.map((artifact) => ({
      id: artifact.id,
      type: artifact.type,
      status: artifact.status,
      title: artifact.title,
      json: artifact.json,
      storageKey: artifact.storageKey,
      errorCode: artifact.errorCode,
      errorMessage: artifact.errorMessage
    }))
  });
}
