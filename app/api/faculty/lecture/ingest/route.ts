import { NextResponse } from "next/server";
import { z } from "zod";

import { ingestFacultyLecture } from "@/lib/faculty/ingest";
import { assertFacultySession } from "@/lib/faculty/session";

const bodySchema = z.object({
  sessionId: z.string().min(1),
  lectureUrl: z.string().url()
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await readJsonBody(request));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Faculty ingest request." }, { status: 400 });
  }

  await assertFacultySession(parsed.data.sessionId);
  void ingestFacultyLecture(parsed.data);

  return NextResponse.json({
    ok: true,
    sessionId: parsed.data.sessionId,
    status: "queued"
  });
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
