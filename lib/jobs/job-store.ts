import { Prisma, type Job, type JobStatus } from "@prisma/client";

import {
  JobProcessorError,
  normalizeJobError,
  terminalJobStatuses,
  type JobType,
  type SafeJobError
} from "@/lib/jobs/job-types";
import { prisma } from "@/lib/prisma";

export type SerializedJob = {
  id: string;
  notebookId: string;
  userId: string | null;
  type: string;
  status: JobStatus;
  progress: number;
  progressPercent: number;
  currentStep: string | null;
  errorType: string | null;
  errorMessage: string | null;
  errorCode: string | null;
  safeErrorMessage: string | null;
  attempts: number;
  attemptCount: number;
  maxAttempts: number;
  startedAt: string | null;
  finishedAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export async function enqueueJob({
  notebookId,
  userId,
  type,
  metadata,
  maxAttempts = 2,
  currentStep = "Queued"
}: {
  notebookId: string;
  userId?: string | null;
  type: JobType;
  metadata?: Prisma.InputJsonValue;
  maxAttempts?: number;
  currentStep?: string;
}) {
  const job = await prisma.job.create({
    data: {
      notebookId,
      userId: userId ?? null,
      type,
      status: "QUEUED",
      progress: 0,
      progressPercent: 0,
      currentStep,
      attempts: 0,
      attemptCount: 0,
      maxAttempts,
      metadata: metadata ?? Prisma.JsonNull
    }
  });

  return serializeJob(job);
}

export async function getJobForUser(jobId: string, userId: string) {
  const job = await prisma.job.findFirst({
    where: {
      id: jobId,
      notebook: {
        userId
      }
    }
  });

  return job ? serializeJob(job) : null;
}

export async function listNotebookJobs({
  notebookId,
  userId,
  type
}: {
  notebookId: string;
  userId: string;
  type?: JobType;
}) {
  const jobs = await prisma.job.findMany({
    where: {
      notebookId,
      ...(type ? { type } : {}),
      notebook: {
        userId
      }
    },
    orderBy: {
      updatedAt: "desc"
    },
    take: 20
  });

  return jobs.map(serializeJob);
}

export async function getRunnableJob(jobId: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId }
  });

  if (!job) {
    throw new JobProcessorError({ code: "JOB_NOT_FOUND" });
  }

  if (terminalJobStatuses.includes(job.status)) {
    return null;
  }

  const nextAttempt = Math.max(job.attempts, job.attemptCount) + 1;

  if (nextAttempt > job.maxAttempts) {
    await failJob(job.id, {
      code: "JOB_MAX_ATTEMPTS_EXCEEDED",
      message: "The job reached its retry limit."
    });
    return null;
  }

  return prisma.job.update({
    where: { id: job.id },
    data: {
      status: "RUNNING",
      attempts: nextAttempt,
      attemptCount: nextAttempt,
      startedAt: job.startedAt ?? new Date(),
      finishedAt: null,
      progress: Math.max(job.progress, 1),
      progressPercent: Math.max(job.progressPercent, 1),
      errorType: null,
      errorMessage: null,
      errorCode: null,
      safeErrorMessage: null
    }
  });
}

export async function updateJobProgress({
  jobId,
  progressPercent,
  currentStep,
  metadata
}: {
  jobId: string;
  progressPercent: number;
  currentStep: string;
  metadata?: Prisma.InputJsonValue;
}) {
  const clamped = clampProgress(progressPercent);

  await prisma.job.update({
    where: { id: jobId },
    data: {
      progress: clamped,
      progressPercent: clamped,
      currentStep,
      ...(metadata !== undefined ? { metadata } : {})
    }
  });
}

export async function succeedJob({
  jobId,
  currentStep = "Done",
  metadata
}: {
  jobId: string;
  currentStep?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  const job = await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "SUCCEEDED",
      progress: 100,
      progressPercent: 100,
      currentStep,
      errorType: null,
      errorMessage: null,
      errorCode: null,
      safeErrorMessage: null,
      finishedAt: new Date(),
      ...(metadata !== undefined ? { metadata } : {})
    }
  });

  return serializeJob(job);
}

export async function failJob(
  jobId: string,
  error: SafeJobError,
  metadata?: Prisma.InputJsonValue
) {
  const safeError = normalizeJobError(
    new JobProcessorError({
      code: error.code,
      message: error.message,
      technicalMessage: error.technicalMessage
    })
  );

  const job = await prisma.job.update({
    where: { id: jobId },
    data: {
      status: "FAILED",
      progress: 100,
      progressPercent: 100,
      currentStep: safeError.message,
      errorType: safeError.code,
      errorMessage: safeError.message,
      errorCode: safeError.code,
      safeErrorMessage: safeError.message,
      finishedAt: new Date(),
      ...(metadata !== undefined ? { metadata } : {})
    }
  });

  return serializeJob(job);
}

export function serializeJob(job: Job): SerializedJob {
  const metadata =
    job.metadata && typeof job.metadata === "object" && !Array.isArray(job.metadata)
      ? (job.metadata as Record<string, unknown>)
      : null;

  return {
    id: job.id,
    notebookId: job.notebookId,
    userId: job.userId,
    type: job.type,
    status: job.status,
    progress: job.progress,
    progressPercent: job.progressPercent,
    currentStep: job.currentStep,
    errorType: job.errorType,
    errorMessage: job.errorMessage,
    errorCode: job.errorCode,
    safeErrorMessage: job.safeErrorMessage,
    attempts: job.attempts,
    attemptCount: job.attemptCount,
    maxAttempts: job.maxAttempts,
    startedAt: job.startedAt?.toISOString() ?? null,
    finishedAt: job.finishedAt?.toISOString() ?? null,
    metadata,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString()
  };
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(value)));
}
