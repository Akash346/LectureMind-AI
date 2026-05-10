import type { Job, Prisma } from "@prisma/client";

import { normalizeJobError, JobProcessorError } from "@/lib/jobs/job-types";
import {
  failJob,
  getRunnableJob,
  succeedJob,
  updateJobProgress
} from "@/lib/jobs/job-store";
import { processGenerateArtifactsJob } from "@/lib/jobs/processors/generate-artifacts-job";
import { processGenerateEmbeddingsJob } from "@/lib/jobs/processors/generate-embeddings-job";
import { processIndexEvidenceJob } from "@/lib/jobs/processors/index-evidence-job";
import { prisma } from "@/lib/prisma";

export function runJobSoon(jobId: string) {
  setTimeout(() => {
    void runJobById(jobId);
  }, 0);
}

export async function runJobById(jobId: string) {
  const job = await getRunnableJob(jobId);

  if (!job) {
    return null;
  }

  try {
    const result = await runProcessor(job);

    return succeedJob({
      jobId: job.id,
      currentStep: "Done",
      metadata: toInputJson({
        ...(toRecord(job.metadata) ?? {}),
        result
      })
    });
  } catch (error) {
    const safe = normalizeJobError(error);
    const latestJob = await prismaSafeJob(job.id);

    console.info(
      "[jobs]",
      JSON.stringify({
        event: "failed",
        jobId: job.id,
        notebookId: job.notebookId,
        type: job.type,
        errorCode: safe.code
      })
    );

    return failJob(
      job.id,
      safe,
      toInputJson({
        ...(toRecord(latestJob?.metadata) ?? toRecord(job.metadata) ?? {}),
        ...(safe.metadata ?? {}),
        errorCode: safe.code
      })
    );
  }
}

async function runProcessor(job: Job) {
  await updateJobProgress({
    jobId: job.id,
    progressPercent: Math.max(job.progressPercent, 1),
    currentStep: "Starting job"
  });

  switch (job.type) {
    case "GENERATE_ARTIFACTS":
      return processGenerateArtifactsJob(job);
    case "GENERATE_EMBEDDINGS":
      return processGenerateEmbeddingsJob(job);
    case "INDEX_EVIDENCE":
      return processIndexEvidenceJob(job);
    default:
      throw new JobProcessorError({
        code: "JOB_PROCESSOR_UNKNOWN",
        technicalMessage: `No processor is registered for ${job.type}.`
      });
  }
}

function toRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

async function prismaSafeJob(jobId: string) {
  try {
    return await prisma.job.findUnique({
      where: { id: jobId },
      select: { metadata: true }
    });
  } catch {
    return null;
  }
}
