import { NextResponse } from "next/server";
import { z } from "zod";

import { assertFacultySession } from "@/lib/faculty/session";
import { downloadFacultyBlob } from "@/lib/faculty/storage";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({
  artifactId: z.string().min(1)
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ artifactId: string }> }
) {
  const parsed = paramsSchema.safeParse(await params);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Faculty artifact." }, { status: 400 });
  }

  const sessionId = new URL(request.url).searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "Missing Faculty session." }, { status: 400 });
  }

  const session = await assertFacultySession(sessionId);
  const artifact = await prisma.facultyArtifact.findFirst({
    where: {
      id: parsed.data.artifactId,
      sessionId: session.id,
      type: "accessibility_docx",
      status: "complete",
      storageKey: {
        not: null
      }
    },
    select: {
      storageKey: true,
      title: true
    }
  });

  if (!artifact?.storageKey) {
    return NextResponse.json({ error: "Faculty artifact not found." }, { status: 404 });
  }

  const blob = await downloadFacultyBlob(artifact.storageKey);
  const filename = `${sanitizeDownloadFilename(
    artifact.title ?? "faculty-accessibility-report"
  )}.docx`;
  const bytes = new ArrayBuffer(blob.buffer.byteLength);
  new Uint8Array(bytes).set(blob.buffer);

  return new NextResponse(bytes, {
    headers: {
      "content-type": blob.contentType,
      "content-length": String(blob.size),
      "content-disposition": `attachment; filename="${filename}"`
    }
  });
}

function sanitizeDownloadFilename(filename: string) {
  const sanitized = filename
    .replace(/["\r\n]/g, "")
    .replace(/[\\/:*?<>|]/g, "-")
    .trim();

  return sanitized || "faculty-accessibility-report";
}
