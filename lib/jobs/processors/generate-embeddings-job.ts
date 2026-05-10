import type { Job } from "@prisma/client";

import { JobProcessorError } from "@/lib/jobs/job-types";
import { updateJobProgress } from "@/lib/jobs/job-store";
import { generateEmbeddingsForNotebook } from "@/lib/search/index-evidence";

export async function processGenerateEmbeddingsJob(job: Job) {
  if (!job.userId) {
    throw new JobProcessorError({ code: "NOTEBOOK_NOT_FOUND" });
  }

  await updateJobProgress({
    jobId: job.id,
    progressPercent: 5,
    currentStep: "Preparing evidence embeddings"
  });

  const result = await generateEmbeddingsForNotebook({
    notebookId: job.notebookId,
    userId: job.userId
  });

  if (result.skipped) {
    throw new JobProcessorError({
      code:
        result.errorCode === "EMBEDDING_NOT_CONFIGURED"
          ? "EMBEDDING_NOT_CONFIGURED"
          : "JOB_PROCESSOR_FAILED",
      message: result.safeErrorMessage
    });
  }

  if (result.embeddedCount === 0) {
    throw new JobProcessorError({
      code: "EMBEDDING_UNKNOWN",
      message: "No evidence segments were embedded successfully."
    });
  }

  return result;
}
