import { NextResponse } from "next/server";
import { z } from "zod";

import { cleanupFacultySession } from "@/lib/faculty/cleanup";

const bodySchema = z.object({
  sessionId: z.string().min(1)
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await readJsonBody(request));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Faculty signout request." }, { status: 400 });
  }

  await cleanupFacultySession({
    sessionId: parsed.data.sessionId,
    reason: "signout"
  });

  return NextResponse.json({ ok: true });
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
