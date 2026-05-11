import { NextResponse } from "next/server";
import { z } from "zod";

import { getApiUser } from "@/lib/api-auth";
import { logNotebookOwnerDebug } from "@/lib/auth-debug";
import { prisma } from "@/lib/prisma";
import { parseUploadedTranscriptFile } from "@/lib/transcript/upload-parser";

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
    select: {
      id: true,
      userId: true
    }
  });

  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found." }, { status: 404 });
  }

  logNotebookOwnerDebug({
    event: "api_notebook_evidence",
    sessionUserId: user.id,
    notebookId: notebook.id,
    notebookOwnerId: notebook.userId
  });

  const evidence = await prisma.evidenceSegment.findMany({
    where: {
      notebookId: notebook.id
    },
    orderBy: {
      startSec: "asc"
    },
    select: {
      id: true,
      videoId: true,
      startSec: true,
      endSec: true,
      text: true,
      sourceType: true,
      confidence: true,
      language: true,
      extractionEngine: true,
      rawSource: true
    }
  });

  return NextResponse.json({
    notebookId: notebook.id,
    evidence
  });
}

const MAX_TRANSCRIPT_FILE_BYTES = 5 * 1024 * 1024;

export async function POST(
  request: Request,
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
    select: {
      id: true,
      userId: true,
      videoId: true
    }
  });

  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found." }, { status: 404 });
  }

  const file = await readTranscriptFile(request);
  if (!file.ok) {
    return NextResponse.json({ error: file.error }, { status: 400 });
  }

  const content = await file.value.text();
  const parsed = parseUploadedTranscriptFile({
    fileName: file.value.name,
    mimeType: file.value.type,
    content
  });

  const videoId = notebook.videoId ?? `uploaded-${notebook.id}`;

  await prisma.$transaction(async (tx) => {
    await tx.evidenceSegment.deleteMany({
      where: {
        notebookId: notebook.id
      }
    });

    await tx.evidenceSegment.createMany({
      data: parsed.segments.map((segment) => ({
        notebookId: notebook.id,
        videoId,
        startSec: segment.startSec,
        endSec: segment.endSec,
        text: segment.text,
        sourceType: "CAPTION",
        confidence: 0.98,
        language: "en",
        extractionEngine: `manual_upload_${parsed.format}`,
        rawSource: `USER_UPLOAD:${file.value.name || "transcript"}`
      }))
    });

    await tx.notebook.update({
      where: { id: notebook.id },
      data: {
        status: "READY",
        errorType: null,
        errorMessage: null
      }
    });
  });

  console.info(
    "[transcript:upload]",
    JSON.stringify({
      event: "notebook_transcript_uploaded",
      notebookId: notebook.id,
      userId: user.id,
      segmentCount: parsed.segments.length,
      format: parsed.format
    })
  );

  return NextResponse.json({
    ok: true,
    notebookId: notebook.id,
    segmentCount: parsed.segments.length,
    format: parsed.format
  });
}

async function readTranscriptFile(request: Request) {
  try {
    const formData = await request.formData();
    const value = formData.get("file");
    if (!(value instanceof File)) {
      return { ok: false as const, error: "Upload a transcript file." };
    }

    if (!value.size) {
      return { ok: false as const, error: "Transcript file is empty." };
    }

    if (value.size > MAX_TRANSCRIPT_FILE_BYTES) {
      return {
        ok: false as const,
        error: "Transcript file must be smaller than 5MB."
      };
    }

    return { ok: true as const, value };
  } catch {
    return { ok: false as const, error: "Could not read transcript upload." };
  }
}
