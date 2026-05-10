import type { Job, Prisma } from "@prisma/client";

import {
  generateAllArtifacts,
  generateArtifact
} from "@/lib/ai/artifact-orchestrator";
import {
  artifactTypes,
  artifactTypeSchema,
  normalizeArtifactLanguage,
  type ArtifactType
} from "@/lib/ai/schemas";
import { JobProcessorError } from "@/lib/jobs/job-types";
import { updateJobProgress } from "@/lib/jobs/job-store";

type GenerateArtifactsMetadata = {
  language?: unknown;
  artifactTypes?: unknown;
};

export async function processGenerateArtifactsJob(job: Job) {
  if (!job.userId) {
    throw new JobProcessorError({ code: "NOTEBOOK_NOT_FOUND" });
  }

  const metadata = toRecord(job.metadata) as GenerateArtifactsMetadata;
  const language = normalizeArtifactLanguage(
    typeof metadata.language === "string" ? metadata.language : undefined
  );
  const requestedTypes = normalizeArtifactTypes(metadata.artifactTypes);

  await updateJobProgress({
    jobId: job.id,
    progressPercent: 5,
    currentStep: "Preparing artifact generation",
    metadata: {
      language,
      artifactTypes: requestedTypes
    } satisfies Prisma.InputJsonValue
  });

  if (requestedTypes.length === artifactTypes.length) {
    const artifacts = await generateAllArtifacts({
      notebookId: job.notebookId,
      userId: job.userId,
      language
    });

    if (!artifacts) {
      throw new JobProcessorError({ code: "NOTEBOOK_NOT_FOUND" });
    }

    const failed = artifacts.filter((artifact) => artifact.status === "FAILED");

    if (failed.length > 0) {
      throw new JobProcessorError({
        code: normalizeArtifactFailureCode(failed[0]?.errorType),
        message:
          failed[0]?.errorMessage ??
          "One or more artifacts could not be generated safely.",
        technicalMessage: JSON.stringify(
          failed.map((artifact) => ({
            type: artifact.type,
            errorType: artifact.errorType
          }))
        )
      });
    }

    return {
      generatedCount: artifacts.length,
      failedCount: 0,
      language,
      artifactTypes: requestedTypes
    };
  }

  let generatedCount = 0;
  const failures: Array<{ type: ArtifactType; errorType: string | null }> = [];

  for (const [index, artifactType] of requestedTypes.entries()) {
    await updateJobProgress({
      jobId: job.id,
      progressPercent: 10 + Math.floor((index / requestedTypes.length) * 80),
      currentStep: `Generating ${artifactType.replace(/_/g, " ").toLowerCase()}`
    });

    const artifact = await generateArtifact({
      notebookId: job.notebookId,
      userId: job.userId,
      artifactType,
      language
    });

    if (!artifact) {
      throw new JobProcessorError({ code: "NOTEBOOK_NOT_FOUND" });
    }

    if (artifact.status === "FAILED") {
      failures.push({ type: artifactType, errorType: artifact.errorType });
    } else {
      generatedCount += 1;
    }
  }

  if (failures.length > 0) {
    throw new JobProcessorError({
      code: normalizeArtifactFailureCode(failures[0]?.errorType),
      message: "One or more artifacts could not be generated safely.",
      technicalMessage: JSON.stringify(failures)
    });
  }

  return {
    generatedCount,
    failedCount: failures.length,
    language,
    artifactTypes: requestedTypes
  };
}

function normalizeArtifactTypes(value: unknown): ArtifactType[] {
  const raw = Array.isArray(value) ? value : artifactTypes;
  const parsed = raw
    .map((item) => artifactTypeSchema.safeParse(item))
    .filter((item): item is { success: true; data: ArtifactType } => item.success)
    .map((item) => item.data);

  return parsed.length > 0 ? Array.from(new Set(parsed)) : [...artifactTypes];
}

function normalizeArtifactFailureCode(errorType: string | null | undefined) {
  if (errorType === "AI_NOT_CONFIGURED") {
    return "AI_NOT_CONFIGURED";
  }

  if (errorType === "INSUFFICIENT_EVIDENCE") {
    return "INSUFFICIENT_EVIDENCE";
  }

  return "JOB_PROCESSOR_FAILED";
}

function toRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
