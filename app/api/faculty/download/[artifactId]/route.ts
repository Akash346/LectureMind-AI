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

  await assertFacultySession(sessionId);
  const artifact = await prisma.facultyArtifact.findFirst({
    where: {
      id: parsed.data.artifactId,
      sessionId,
      storageKey: {
        not: null
      }
    }
  });

  if (!artifact?.storageKey) {
    return NextResponse.json({ error: "Faculty artifact not found." }, { status: 404 });
  }

  const blob = await downloadFacultyBlob(artifact.storageKey);

  return new NextResponse(new Uint8Array(blob.buffer), {
    headers: {
      "content-type": blob.contentType,
      "content-length": String(blob.size),
      "content-disposition": `attachment; filename="${artifact.title ?? "faculty-artifact"}.docx"`
    }
  });
}
