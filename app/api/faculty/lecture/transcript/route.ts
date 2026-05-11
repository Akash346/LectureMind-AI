import { NextResponse } from "next/server";
import { z } from "zod";

import { ingestFacultyTranscriptUpload } from "@/lib/faculty/ingest";
import { assertFacultySession } from "@/lib/faculty/session";

const MAX_TRANSCRIPT_FILE_BYTES = 5 * 1024 * 1024;

const payloadSchema = z.object({
  sessionId: z.string().min(1)
});

export async function POST(request: Request) {
  const formData = await readFormData(request);
  if (!formData.ok) {
    return NextResponse.json({ error: formData.error }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse({
    sessionId: formData.value.get("sessionId")
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Missing Faculty session for transcript upload." },
      { status: 400 }
    );
  }

  const fileValue = formData.value.get("file");
  if (!(fileValue instanceof File)) {
    return NextResponse.json({ error: "Upload a transcript file." }, { status: 400 });
  }

  if (!fileValue.size) {
    return NextResponse.json({ error: "Transcript file is empty." }, { status: 400 });
  }

  if (fileValue.size > MAX_TRANSCRIPT_FILE_BYTES) {
    return NextResponse.json(
      { error: "Transcript file must be smaller than 5MB." },
      { status: 400 }
    );
  }

  await assertFacultySession(parsed.data.sessionId);
  const content = await fileValue.text();
  const result = await ingestFacultyTranscriptUpload({
    sessionId: parsed.data.sessionId,
    fileName: fileValue.name,
    mimeType: fileValue.type,
    content
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    sessionId: parsed.data.sessionId,
    segmentCount: result.segmentCount,
    indexedCount: result.indexedCount,
    format: result.format
  });
}

async function readFormData(request: Request) {
  try {
    return { ok: true as const, value: await request.formData() };
  } catch {
    return {
      ok: false as const,
      error: "Could not read transcript upload request."
    };
  }
}
