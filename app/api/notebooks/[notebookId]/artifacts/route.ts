import { NextResponse } from "next/server";
import { z } from "zod";

import { listArtifacts } from "@/lib/ai/artifact-orchestrator";
import { normalizeArtifactLanguage } from "@/lib/ai/schemas";
import { getApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({
  notebookId: z.string().min(1)
});

export async function GET(
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

  const url = new URL(request.url);
  const language = await resolveLanguage({
    notebookId: parsedParams.data.notebookId,
    userId: user.id,
    requestedLanguage: url.searchParams.get("language")
  });
  const artifacts = await listArtifacts({
    notebookId: parsedParams.data.notebookId,
    userId: user.id,
    language
  });

  if (!artifacts) {
    return NextResponse.json({ error: "Notebook not found." }, { status: 404 });
  }

  return NextResponse.json({
    notebookId: parsedParams.data.notebookId,
    language,
    artifacts
  });
}

async function resolveLanguage({
  notebookId,
  userId,
  requestedLanguage
}: {
  notebookId: string;
  userId: string;
  requestedLanguage: string | null;
}) {
  if (requestedLanguage) {
    return normalizeArtifactLanguage(requestedLanguage);
  }

  const notebook = await prisma.notebook.findFirst({
    where: {
      id: notebookId,
      userId
    },
    select: {
      language: true
    }
  });

  return normalizeArtifactLanguage(notebook?.language);
}
