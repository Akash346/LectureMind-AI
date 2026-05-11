import { NextResponse } from "next/server";
import { z } from "zod";

import { listArtifacts } from "@/lib/ai/artifact-orchestrator";
import {
  artifactTypeSchema,
  normalizeArtifactLanguage
} from "@/lib/ai/schemas";
import { getApiUser } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({
  notebookId: z.string().min(1),
  artifactType: artifactTypeSchema
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ notebookId: string; artifactType: string }> }
) {
  const user = await getApiUser();

  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(await params);

  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid artifact." }, { status: 400 });
  }

  const language = await resolveLanguage({
    notebookId: parsedParams.data.notebookId,
    userId: user.id
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
    artifact: artifacts.find(
      (artifact) => artifact.type === parsedParams.data.artifactType
    )
  });
}

async function resolveLanguage({
  notebookId,
  userId
}: {
  notebookId: string;
  userId: string;
}) {
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
