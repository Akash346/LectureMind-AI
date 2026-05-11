import { NextResponse } from "next/server";

import { getFacultyConfig } from "@/lib/config/server-env";
import { cleanupFacultySession } from "@/lib/faculty/cleanup";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const config = getFacultyConfig();

  if (config.sweepSecret) {
    const supplied = request.headers.get("x-faculty-sweep-secret");
    if (supplied !== config.sweepSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const inactivityCutoff = new Date(
    Date.now() - config.sessionTtlMinutes * 60_000
  );
  const sessions = await prisma.facultySession.findMany({
    where: {
      deletedAt: null,
      OR: [
        { expiresAt: { lt: new Date() } },
        { lastActiveAt: { lt: inactivityCutoff } }
      ]
    },
    select: { id: true }
  });

  for (const session of sessions) {
    await cleanupFacultySession({
      sessionId: session.id,
      reason: "expired"
    });
  }

  return NextResponse.json({
    ok: true,
    cleaned: sessions.length
  });
}
