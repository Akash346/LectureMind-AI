import type { Job } from "@prisma/client";

import { JobProcessorError } from "@/lib/jobs/job-types";
import { updateJobProgress } from "@/lib/jobs/job-store";
import { indexEvidenceSegments } from "@/lib/search/index-evidence";

export async function processIndexEvidenceJob(job: Job) {
  await updateJobProgress({
    jobId: job.id,
    progressPercent: 5,
    currentStep: "Preparing evidence indexing"
  });

  const result = await indexEvidenceSegments({
    notebookId: job.notebookId,
    userId: job.userId,
    force: getForceFromMetadata(job.metadata)
  });

  if (result.skipped) {
    await updateJobProgress({
      jobId: job.id,
      progressPercent: 100,
      currentStep: result.safeErrorMessage ?? "Using local retrieval fallback"
    });

    return result;
  }

  if (result.errorCode || result.failedCount > 0 || result.indexedCount === 0) {
    throw new JobProcessorError({
      code: "SEARCH_INDEX_FAILED",
      message:
        result.safeErrorMessage ??
        "No evidence segments were indexed successfully.",
      technicalMessage: result.firstFailureReason,
      metadata: result.metadata
    });
  }

  await updateJobProgress({
    jobId: job.id,
    progressPercent: 100,
    currentStep: `Indexed ${result.indexedCount} evidence segments`
  });

  return result;
}

function getForceFromMetadata(metadata: unknown) {
  return Boolean(
    metadata &&
    typeof metadata === "object" &&
    !Array.isArray(metadata) &&
    (metadata as Record<string, unknown>).force === true
  );
}
