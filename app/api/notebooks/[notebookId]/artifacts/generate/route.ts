import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  generateAllArtifacts,
  generateArtifact
} from "@/lib/ai/artifact-orchestrator";
import { normalizeAIGenerationError } from "@/lib/ai/errors";
import {
  artifactTypes,
  artifactTypeSchema,
  generateArtifactTypeSchema,
  normalizeArtifactLanguage
} from "@/lib/ai/schemas";
import { getApiUser } from "@/lib/api-auth";
import { enqueueJob } from "@/lib/jobs/job-store";
import { runJobSoon } from "@/lib/jobs/job-runner";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({
  notebookId: z.string().min(1)
});

const bodySchema = z.object({
  artifactType: generateArtifactTypeSchema.optional(),
  types: z.array(artifactTypeSchema).min(1).optional(),
  language: z.string().optional(),
  mode: z.enum(["async", "sync"]).optional().default("async")
});

export async function POST(
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

  const parsedBody = bodySchema.safeParse(await readJsonBody(request));

  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid artifact request." }, { status: 400 });
  }

  const notebook = await prisma.notebook.findFirst({
    where: {
      id: parsedParams.data.notebookId,
      userId: user.id
    },
    select: {
      id: true,
      language: true
    }
  });

  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found." }, { status: 404 });
  }

  const language = normalizeArtifactLanguage(
    parsedBody.data.language ?? notebook.language
  );
  const requestedTypes = getRequestedTypes(parsedBody.data);

  try {
    if (parsedBody.data.mode === "async") {
      const job = await enqueueJob({
        notebookId: notebook.id,
        userId: user.id,
        type: "GENERATE_ARTIFACTS",
        currentStep: "Queued artifact generation",
        maxAttempts: 1,
        metadata: {
          language,
          artifactTypes: requestedTypes
        } satisfies Prisma.InputJsonValue
      });

      runJobSoon(job.id);

      return NextResponse.json(
        {
          jobId: job.id,
          status: job.status,
          job
        },
        { status: 202 }
      );
    }

    if (!parsedBody.data.artifactType || parsedBody.data.artifactType === "ALL") {
      const artifacts = await generateAllArtifacts({
        notebookId: parsedParams.data.notebookId,
        userId: user.id,
        language
      });

      if (!artifacts) {
        return NextResponse.json(
          { error: "Notebook not found." },
          { status: 404 }
        );
      }

      return NextResponse.json({
        notebookId: parsedParams.data.notebookId,
        language,
        artifacts
      });
    }

    const artifactType = artifactTypeSchema.parse(parsedBody.data.artifactType);
    const artifact = await generateArtifact({
      notebookId: parsedParams.data.notebookId,
      userId: user.id,
      artifactType,
      language
    });

    if (!artifact) {
      return NextResponse.json({ error: "Notebook not found." }, { status: 404 });
    }

    return NextResponse.json({
      notebookId: parsedParams.data.notebookId,
      language,
      artifact
    });
  } catch (error) {
    const safeError = normalizeAIGenerationError(error);

    return NextResponse.json(
      {
        error: safeError.title,
        errorType: safeError.type,
        errorMessage: safeError.userMessage
      },
      { status: 500 }
    );
  }
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function getRequestedTypes(body: z.infer<typeof bodySchema>) {
  if (body.types?.length) {
    return Array.from(new Set(body.types));
  }

  if (!body.artifactType || body.artifactType === "ALL") {
    return [...artifactTypes];
  }

  return [artifactTypeSchema.parse(body.artifactType)];
}
