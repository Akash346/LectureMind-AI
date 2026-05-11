import { NextResponse } from "next/server";
import { z } from "zod";

import { createFacultySession } from "@/lib/faculty/session";

const bodySchema = z.object({
  lectureUrl: z.string().url().optional()
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await readJsonBody(request));

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid Faculty session request." }, { status: 400 });
  }

  const session = await createFacultySession({
    lectureUrl: parsed.data.lectureUrl
  });

  return NextResponse.json({
    sessionId: session.id,
    workspaceId: session.workspaceId,
    azureNamespace: session.azureNamespace,
    expiresAt: session.expiresAt.toISOString()
  });
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
