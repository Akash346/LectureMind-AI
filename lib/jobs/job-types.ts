import type { JobStatus } from "@prisma/client";

export const jobTypes = [
  "INGEST_NOTEBOOK",
  "YOUTUBE_INGESTION",
  "GENERATE_ARTIFACTS",
  "GENERATE_EMBEDDINGS",
  "INDEX_EVIDENCE",
  "CHAT_RETRIEVAL"
] as const;

export type JobType = (typeof jobTypes)[number];

export const terminalJobStatuses: JobStatus[] = [
  "SUCCEEDED",
  "FAILED",
  "CANCELLED"
];

export const jobErrorCodes = [
  "JOB_NOT_FOUND",
  "JOB_CANCELLED",
  "JOB_MAX_ATTEMPTS_EXCEEDED",
  "JOB_PROCESSOR_UNKNOWN",
  "JOB_PROCESSOR_FAILED",
  "NOTEBOOK_NOT_FOUND",
  "AI_NOT_CONFIGURED",
  "EMBEDDING_NOT_CONFIGURED",
  "EMBEDDING_RATE_LIMITED",
  "EMBEDDING_TIMEOUT",
  "EMBEDDING_BAD_RESPONSE",
  "EMBEDDING_UNKNOWN",
  "SEARCH_NOT_CONFIGURED",
  "SEARCH_INDEX_FAILED",
  "SEARCH_QUERY_FAILED",
  "INSUFFICIENT_EVIDENCE",
  "UNKNOWN"
] as const;

export type JobErrorCode = (typeof jobErrorCodes)[number];

export type SafeJobError = {
  code: JobErrorCode;
  message: string;
  technicalMessage?: string;
  metadata?: Record<string, unknown>;
};

export const jobErrorCopy: Record<JobErrorCode, string> = {
  JOB_NOT_FOUND: "The background job could not be found.",
  JOB_CANCELLED: "The background job was cancelled.",
  JOB_MAX_ATTEMPTS_EXCEEDED: "The job reached its retry limit.",
  JOB_PROCESSOR_UNKNOWN: "This job type is not supported yet.",
  JOB_PROCESSOR_FAILED: "The background job failed safely.",
  NOTEBOOK_NOT_FOUND: "Notebook not found.",
  AI_NOT_CONFIGURED: "AI generation is not configured yet.",
  EMBEDDING_NOT_CONFIGURED: "Embedding generation is not configured yet.",
  EMBEDDING_RATE_LIMITED: "Embedding generation is temporarily rate limited.",
  EMBEDDING_TIMEOUT: "Embedding generation took too long.",
  EMBEDDING_BAD_RESPONSE: "The embedding service returned an unexpected response.",
  EMBEDDING_UNKNOWN: "Embedding generation failed safely.",
  SEARCH_NOT_CONFIGURED: "Azure AI Search is not configured yet.",
  SEARCH_INDEX_FAILED: "Evidence indexing failed safely.",
  SEARCH_QUERY_FAILED: "Search failed safely.",
  INSUFFICIENT_EVIDENCE: "I could not find enough lecture evidence to continue safely.",
  UNKNOWN: "The background job failed safely."
};

export class JobProcessorError extends Error {
  readonly code: JobErrorCode;
  readonly safeMessage: string;
  readonly technicalMessage?: string;
  readonly metadata?: Record<string, unknown>;

  constructor({
    code,
    message,
    technicalMessage,
    metadata
  }: {
    code: JobErrorCode;
    message?: string;
    technicalMessage?: string;
    metadata?: Record<string, unknown>;
  }) {
    super(message ?? jobErrorCopy[code]);
    this.name = "JobProcessorError";
    this.code = code;
    this.safeMessage = message ?? jobErrorCopy[code];
    this.technicalMessage = technicalMessage;
    this.metadata = metadata;
  }
}

export function normalizeJobError(error: unknown): SafeJobError {
  if (error instanceof JobProcessorError) {
    return {
      code: error.code,
      message: error.safeMessage,
      technicalMessage: error.technicalMessage,
      metadata: error.metadata
    };
  }

  if (error instanceof Error) {
    return {
      code: "UNKNOWN",
      message: jobErrorCopy.UNKNOWN,
      technicalMessage: error.message
    };
  }

  return {
    code: "UNKNOWN",
    message: jobErrorCopy.UNKNOWN,
    technicalMessage: "Unknown non-Error throw"
  };
}
