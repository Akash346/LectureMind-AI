import { NextResponse } from "next/server";
import { z } from "zod";

import { assertFacultySession, touchFacultySession } from "@/lib/faculty/session";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({
  sessionId: z.string().min(1)
});

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const parsed = paramsSchema.safeParse(await params);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Faculty session." }, { status: 400 });
  }

  await assertFacultySession(parsed.data.sessionId);
  await touchFacultySession(parsed.data.sessionId);
  const session = await prisma.facultySession.findUniqueOrThrow({
    where: { id: parsed.data.sessionId },
    select: { lastActiveAt: true }
  });

  return NextResponse.json({
    ok: true,
    lastActiveAt: session.lastActiveAt.toISOString()
  });
}
