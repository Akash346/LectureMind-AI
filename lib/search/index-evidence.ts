import type { EvidenceSegment, Notebook } from "@prisma/client";

import {
  EmbeddingError,
  generateEmbeddings,
  getExpectedEmbeddingDimensions,
  isEmbeddingConfigured,
  normalizeEmbeddingError
} from "@/lib/ai/embeddings";
import { prisma } from "@/lib/prisma";
import { ensureEvidenceIndex } from "@/lib/search/index-schema";
import {
  getSearchIndexEnvSource,
  getSearchIndexName,
  isSearchConfigured,
  searchFetch,
  SearchError
} from "@/lib/search/search-client";

const INDEX_BATCH_SIZE = 50;
const DEFAULT_EVIDENCE_LANGUAGE = "en";

type IndexFailurePhase =
  | "ensure_index"
  | "embedding"
  | "upload_documents"
  | "db_update";

type EvidenceForIndex = Pick<
  EvidenceSegment,
  | "id"
  | "notebookId"
  | "videoId"
  | "startSec"
  | "endSec"
  | "text"
  | "sourceType"
  | "language"
  | "extractionEngine"
  | "rawSource"
  | "createdAt"
>;

type NotebookForIndex = Pick<
  Notebook,
  "id" | "userId" | "title" | "videoTitle" | "videoId" | "language"
> & {
  evidenceSegments: EvidenceForIndex[];
};

type IndexDocumentsResponse = {
  value?: Array<{
    key?: string;
    status?: boolean;
    succeeded?: boolean;
    errorMessage?: string;
  }>;
};

export type IndexEvidenceResult = {
  indexedCount: number;
  failedCount: number;
  skipped: boolean;
  retrievalMode: "azure_hybrid" | "local_lexical_fallback";
  indexName: string | null;
  embeddingDimensions?: number;
  errorCode?: string;
  safeErrorMessage?: string;
  firstFailureReason?: string;
  metadata?: Record<string, unknown>;
};

export async function indexEvidenceSegments({
  notebookId,
  userId,
  force = false
}: {
  notebookId: string;
  userId: string;
  force?: boolean;
}): Promise<IndexEvidenceResult> {
  const indexName = getSearchIndexName();
  const embeddingDimensionsExpected = getExpectedEmbeddingDimensions();
  const searchConfigured = isSearchConfigured();
  const embeddingsConfigured = isEmbeddingConfigured();

  logIndexEvent("config_resolved", {
    notebookId,
    force,
    searchConfigured,
    embeddingsConfigured,
    indexName,
    indexEnvSource: getSearchIndexEnvSource(),
    embeddingDimensionsExpected
  });

  if (!searchConfigured) {
    return {
      indexedCount: 0,
      failedCount: 0,
      skipped: true,
      retrievalMode: "local_lexical_fallback",
      indexName: null,
      errorCode: "SEARCH_NOT_CONFIGURED",
      safeErrorMessage: "Azure AI Search is not configured yet.",
      metadata: {
        indexName,
        embeddingDimensionsExpected
      }
    };
  }

  if (!embeddingsConfigured) {
    return {
      indexedCount: 0,
      failedCount: 0,
      skipped: true,
      retrievalMode: "local_lexical_fallback",
      indexName,
      errorCode: "EMBEDDING_NOT_CONFIGURED",
      safeErrorMessage: "Embedding generation is not configured yet.",
      metadata: {
        indexName,
        embeddingDimensionsExpected
      }
    };
  }

  const notebook = await loadNotebookForIndex(notebookId, userId);

  if (!notebook) {
    throw new SearchError({
      code: "SEARCH_INDEX_FAILED",
      message: "Notebook not found."
    });
  }

  if (notebook.evidenceSegments.length === 0) {
    return {
      indexedCount: 0,
      failedCount: 0,
      skipped: true,
      retrievalMode: "local_lexical_fallback",
      indexName,
      errorCode: "INSUFFICIENT_EVIDENCE",
      safeErrorMessage: "No evidence segments are available to index.",
      metadata: {
        indexName,
        embeddingDimensionsExpected
      }
    };
  }

  const { indexableSegments, invalidSegments } =
    partitionIndexableSegments(notebook);
  let indexedCount = 0;
  let failedCount = invalidSegments.length;

  if (invalidSegments.length > 0) {
    await markSegmentsFailed(
      invalidSegments,
      "SEARCH_INDEX_FAILED",
      "Evidence segment text is empty or its search document id is duplicated."
    );
  }

  if (indexableSegments.length === 0) {
    return {
      indexedCount: 0,
      failedCount,
      skipped: false,
      retrievalMode: "local_lexical_fallback",
      indexName,
      errorCode: "SEARCH_INDEX_FAILED",
      safeErrorMessage: "No valid evidence segments were available to index.",
      metadata: {
        indexName,
        embeddingDimensionsExpected,
        failedDocumentCount: failedCount
      }
    };
  }

  const dimensionCheck = await checkEmbeddingDimensions({
    indexName,
    embeddingDimensionsExpected
  });

  if (!dimensionCheck.ok) {
    failedCount += indexableSegments.length;
    await markSegmentsFailed(
      indexableSegments,
      "EMBEDDING_BAD_RESPONSE",
      dimensionCheck.safeErrorMessage
    );

    return buildFailureResult({
      indexedCount,
      failedCount,
      indexName,
      failure: dimensionCheck.failure
    });
  }

  const embeddingDimensionsActual = dimensionCheck.actual;

  logIndexEvent("ensure_index_started", {
    notebookId,
    indexName,
    embeddingDimensionsExpected,
    embeddingDimensionsActual
  });

  try {
    const ensureResult = await ensureEvidenceIndex(embeddingDimensionsActual);

    logIndexEvent("ensure_index_completed", {
      notebookId,
      indexName,
      created: ensureResult.created,
      recreated: ensureResult.recreated,
      reused: ensureResult.reused,
      embeddingDimensionsExpected,
      embeddingDimensionsActual
    });
  } catch (error) {
    const failure = normalizeIndexingError(error, {
      phase: "ensure_index",
      indexName,
      embeddingDimensionsExpected,
      embeddingDimensionsActual,
      batchSize: indexableSegments.length
    });

    logIndexEvent("ensure_index_failed", failure.logFields);
    logIndexEvent("job_failed_with_cause", failure.logFields);
    failedCount += indexableSegments.length;
    await markSegmentsFailed(
      indexableSegments,
      failure.segmentErrorCode,
      failure.safeErrorMessage
    );

    return buildFailureResult({
      indexedCount,
      failedCount,
      indexName,
      failure
    });
  }

  for (
    let batchStart = 0;
    batchStart < indexableSegments.length;
    batchStart += INDEX_BATCH_SIZE
  ) {
    const batch = indexableSegments.slice(batchStart, batchStart + INDEX_BATCH_SIZE);

    await markBatchEmbedding(batch, "GENERATING");
    logIndexEvent("embedding_batch_started", {
      notebookId,
      indexName,
      batchStart,
      batchSize: batch.length,
      embeddingDimensionsExpected,
      embeddingDimensionsActual
    });

    let embeddingResult: Awaited<ReturnType<typeof generateEmbeddings>>;

    try {
      embeddingResult = await generateEmbeddings(
        batch.map((segment) => buildEvidenceEmbeddingText(notebook, segment)),
        {
          expectedDimensions: embeddingDimensionsActual
        }
      );

      logIndexEvent("embedding_batch_completed", {
        notebookId,
        indexName,
        batchStart,
        batchSize: batch.length,
        model: embeddingResult.model,
        embeddingDimensionsExpected,
        embeddingDimensionsActual
      });
    } catch (error) {
      const failure = normalizeIndexingError(error, {
        phase: "embedding",
        indexName,
        embeddingDimensionsExpected,
        embeddingDimensionsActual,
        batchSize: batch.length
      });

      logIndexEvent("embedding_batch_failed", failure.logFields);
      logIndexEvent("job_failed_with_cause", failure.logFields);
      failedCount += batch.length;
      await markSegmentsFailed(batch, failure.segmentErrorCode, failure.safeErrorMessage);

      return buildFailureResult({
        indexedCount,
        failedCount,
        indexName,
        failure
      });
    }

    let documents: ReturnType<typeof buildSearchDocument>[];

    try {
      documents = batch.map((segment, index) => {
        const embedding =
          embeddingResult.embeddings.find((item) => item.index === index)
            ?.embedding ?? [];

        if (embedding.length !== embeddingDimensionsActual) {
          throw new EmbeddingError({
            code: "EMBEDDING_BAD_RESPONSE",
            message: `Embedding dimensions were ${embedding.length}, expected ${embeddingDimensionsActual}.`,
            expectedDimensions: embeddingDimensionsActual,
            actualDimensions: embedding.length
          });
        }

        return buildSearchDocument({
          notebook,
          segment,
          embedding: Array.from(embedding, (value) => Number(value))
        });
      });
    } catch (error) {
      const failure = normalizeIndexingError(error, {
        phase: "embedding",
        indexName,
        embeddingDimensionsExpected,
        embeddingDimensionsActual,
        batchSize: batch.length
      });

      logIndexEvent("embedding_batch_failed", failure.logFields);
      logIndexEvent("job_failed_with_cause", failure.logFields);
      failedCount += batch.length;
      await markSegmentsFailed(batch, failure.segmentErrorCode, failure.safeErrorMessage);

      return buildFailureResult({
        indexedCount,
        failedCount,
        indexName,
        failure
      });
    }

    logIndexEvent("upload_batch_started", {
      notebookId,
      indexName,
      batchStart,
      batchSize: documents.length,
      embeddingDimensionsExpected,
      embeddingDimensionsActual
    });

    let failedDocumentCount = 0;

    try {
      const response = await searchFetch<IndexDocumentsResponse>({
        path: `/indexes/${encodeURIComponent(indexName)}/docs/index`,
        method: "POST",
        operation: "index",
        body: {
          value: documents
        }
      });
      const failedDocuments = (response.value ?? []).filter(
        (item) => item.status === false || item.succeeded === false
      );
      failedDocumentCount = failedDocuments.length;

      if (failedDocuments.length > 0) {
        throw new SearchError({
          code: "SEARCH_INDEX_FAILED",
          message:
            failedDocuments[0]?.errorMessage ??
            "Azure AI Search rejected one or more documents.",
          providerCode: "DOCUMENT_UPLOAD_FAILED"
        });
      }

      logIndexEvent("upload_batch_completed", {
        notebookId,
        indexName,
        batchStart,
        batchSize: documents.length,
        failedDocumentCount: 0,
        embeddingDimensionsExpected,
        embeddingDimensionsActual
      });
    } catch (error) {
      const failure = normalizeIndexingError(error, {
        phase: "upload_documents",
        indexName,
        embeddingDimensionsExpected,
        embeddingDimensionsActual,
        batchSize: documents.length,
        failedDocumentCount: failedDocumentCount || documents.length
      });

      logIndexEvent("upload_batch_failed", failure.logFields);
      logIndexEvent("job_failed_with_cause", failure.logFields);
      failedCount += batch.length;
      await markSegmentsFailed(batch, failure.segmentErrorCode, failure.safeErrorMessage);

      return buildFailureResult({
        indexedCount,
        failedCount,
        indexName,
        failure
      });
    }

    try {
      await prisma.$transaction(
        batch.map((segment) =>
          prisma.evidenceSegment.update({
            where: { id: segment.id },
            data: {
              embeddingStatus: "INDEXED",
              embeddingModel: embeddingResult.model,
              embeddingErrorCode: null,
              embeddingErrorMessage: null,
              indexedAt: new Date(),
              searchDocumentId: createSearchDocumentId(segment)
            }
          })
        )
      );

      indexedCount += batch.length;
      logIndexEvent("evidence_rows_updated", {
        notebookId,
        indexName,
        batchStart,
        batchSize: batch.length,
        indexedCount,
        embeddingDimensionsExpected,
        embeddingDimensionsActual
      });
    } catch (error) {
      const failure = normalizeIndexingError(error, {
        phase: "db_update",
        indexName,
        embeddingDimensionsExpected,
        embeddingDimensionsActual,
        batchSize: batch.length
      });

      logIndexEvent("job_failed_with_cause", failure.logFields);
      failedCount += batch.length;

      return buildFailureResult({
        indexedCount,
        failedCount,
        indexName,
        failure
      });
    }
  }

  return {
    indexedCount,
    failedCount,
    skipped: false,
    retrievalMode:
      indexedCount > 0 && failedCount === 0
        ? "azure_hybrid"
        : "local_lexical_fallback",
    indexName,
    embeddingDimensions: embeddingDimensionsActual,
    metadata: {
      indexName,
      embeddingDimensionsExpected,
      embeddingDimensionsActual,
      indexedCount,
      failedCount
    },
    ...(failedCount > 0
      ? {
          errorCode: "SEARCH_INDEX_FAILED",
          safeErrorMessage: `${failedCount} evidence segments could not be indexed.`
        }
      : {})
  };
}

export async function generateEmbeddingsForNotebook({
  notebookId,
  userId
}: {
  notebookId: string;
  userId: string;
}) {
  if (!isEmbeddingConfigured()) {
    return {
      embeddedCount: 0,
      failedCount: 0,
      skipped: true,
      errorCode: "EMBEDDING_NOT_CONFIGURED",
      safeErrorMessage: "Embedding generation is not configured yet."
    };
  }

  const notebook = await loadNotebookForIndex(notebookId, userId);

  if (!notebook) {
    return {
      embeddedCount: 0,
      failedCount: 0,
      skipped: true,
      errorCode: "NOTEBOOK_NOT_FOUND",
      safeErrorMessage: "Notebook not found."
    };
  }

  let embeddedCount = 0;
  let failedCount = 0;

  for (
    let batchStart = 0;
    batchStart < notebook.evidenceSegments.length;
    batchStart += INDEX_BATCH_SIZE
  ) {
    const batch = notebook.evidenceSegments.slice(batchStart, batchStart + INDEX_BATCH_SIZE);

    await markBatchEmbedding(batch, "GENERATING");

    try {
      const result = await generateEmbeddings(
        batch.map((segment) => buildEvidenceEmbeddingText(notebook, segment))
      );

      await Promise.all(
        batch.map((segment) =>
          prisma.evidenceSegment.update({
            where: { id: segment.id },
            data: {
              embeddingStatus: "EMBEDDED",
              embeddingModel: result.model,
              embeddingErrorCode: null,
              embeddingErrorMessage: null
            }
          })
        )
      );
      embeddedCount += batch.length;
    } catch (error) {
      const safe = normalizeEmbeddingOrSearchError(error);
      failedCount += batch.length;
      await Promise.all(
        batch.map((segment) =>
          markSegmentFailed(segment.id, safe.code, safe.message)
        )
      );
    }
  }

  return {
    embeddedCount,
    failedCount,
    skipped: false
  };
}

export async function deleteNotebookFromIndex(notebookId: string) {
  if (!isSearchConfigured()) {
    return {
      deleted: false,
      errorCode: "SEARCH_NOT_CONFIGURED"
    };
  }

  const segments = await prisma.evidenceSegment.findMany({
    where: { notebookId },
    select: {
      id: true,
      notebookId: true,
      searchDocumentId: true
    }
  });
  const documents = segments.map((segment) => ({
    "@search.action": "delete",
    id: segment.searchDocumentId ?? createSearchDocumentId(segment)
  }));

  if (documents.length === 0) {
    return { deleted: true };
  }

  await searchFetch({
    path: `/indexes/${encodeURIComponent(getSearchIndexName())}/docs/index`,
    method: "POST",
    operation: "index",
    body: {
      value: documents
    }
  });

  await prisma.evidenceSegment.updateMany({
    where: { notebookId },
    data: {
      indexedAt: null,
      searchDocumentId: null,
      embeddingStatus: "PENDING"
    }
  });

  return { deleted: true };
}

export function buildEvidenceEmbeddingText(
  notebook: Pick<NotebookForIndex, "title" | "videoTitle">,
  segment: Pick<EvidenceForIndex, "startSec" | "endSec" | "text">
) {
  return [
    `Lecture: ${notebook.videoTitle ?? notebook.title}`,
    `Time: ${segment.startSec}-${segment.endSec}`,
    `Text: ${segment.text}`
  ].join("\n");
}

export function createSearchDocumentId(
  segment: Pick<EvidenceSegment, "id" | "notebookId">
) {
  return `${segment.notebookId}_${segment.id}`.replace(/[^A-Za-z0-9_-]/g, "_");
}

async function checkEmbeddingDimensions({
  indexName,
  embeddingDimensionsExpected
}: {
  indexName: string;
  embeddingDimensionsExpected: number;
}): Promise<
  | {
      ok: true;
      actual: number;
    }
  | {
      ok: false;
      safeErrorMessage: string;
      failure: NormalizedIndexingFailure;
    }
> {
  try {
    const probe = await generateEmbeddings(["LectureMind embedding dimension check"], {
      skipDimensionValidation: true
    });
    const actual = probe.embeddings[0]?.embedding.length ?? 0;

    if (actual <= 0) {
      throw new EmbeddingError({
        code: "EMBEDDING_BAD_RESPONSE",
        message: "Embedding dimension check returned no vector."
      });
    }

    logIndexEvent("embedding_dimension_check", {
      expected: embeddingDimensionsExpected,
      actual,
      ok: actual === embeddingDimensionsExpected,
      indexName
    });

    return {
      ok: true,
      actual
    };
  } catch (error) {
    const failure = normalizeIndexingError(error, {
      phase: "embedding",
      indexName,
      embeddingDimensionsExpected,
      batchSize: 1
    });

    logIndexEvent("embedding_batch_failed", failure.logFields);
    logIndexEvent("job_failed_with_cause", failure.logFields);

    return {
      ok: false,
      safeErrorMessage: failure.safeErrorMessage,
      failure
    };
  }
}

async function loadNotebookForIndex(
  notebookId: string,
  userId: string
): Promise<NotebookForIndex | null> {
  return prisma.notebook.findFirst({
    where: {
      id: notebookId,
      userId
    },
    select: {
      id: true,
      userId: true,
      title: true,
      videoTitle: true,
      videoId: true,
      language: true,
      evidenceSegments: {
        orderBy: { startSec: "asc" },
        select: {
          id: true,
          notebookId: true,
          videoId: true,
          startSec: true,
          endSec: true,
          text: true,
          sourceType: true,
          language: true,
          extractionEngine: true,
          rawSource: true,
          createdAt: true
        }
      }
    }
  });
}

function partitionIndexableSegments(notebook: NotebookForIndex) {
  const seenDocumentIds = new Set<string>();
  const indexableSegments: EvidenceForIndex[] = [];
  const invalidSegments: EvidenceForIndex[] = [];

  for (const segment of notebook.evidenceSegments) {
    const documentId = createSearchDocumentId(segment);

    if (!segment.text.trim() || seenDocumentIds.has(documentId)) {
      invalidSegments.push(segment);
      continue;
    }

    seenDocumentIds.add(documentId);
    indexableSegments.push(segment);
  }

  return {
    indexableSegments,
    invalidSegments
  };
}

function buildSearchDocument({
  notebook,
  segment,
  embedding
}: {
  notebook: NotebookForIndex;
  segment: EvidenceForIndex;
  embedding: number[];
}) {
  return {
    "@search.action": "mergeOrUpload",
    id: createSearchDocumentId(segment),
    notebookId: notebook.id,
    userId: notebook.userId,
    evidenceSegmentId: segment.id,
    lectureTitle: notebook.videoTitle ?? notebook.title,
    videoId: segment.videoId || notebook.videoId || "",
    language: segment.language ?? DEFAULT_EVIDENCE_LANGUAGE,
    startSec: segment.startSec,
    endSec: segment.endSec,
    text: segment.text.trim(),
    extractionEngine: segment.extractionEngine ?? "",
    rawSource: segment.rawSource ?? segment.sourceType ?? "",
    createdAt: segment.createdAt.toISOString(),
    embedding
  };
}

async function markBatchEmbedding(
  segments: EvidenceForIndex[],
  status: "GENERATING" | "INDEXED" | "FAILED"
) {
  if (segments.length === 0) {
    return;
  }

  await prisma.evidenceSegment.updateMany({
    where: {
      id: {
        in: segments.map((segment) => segment.id)
      }
    },
    data: {
      embeddingStatus: status
    }
  });
}

async function markSegmentsFailed(
  segments: EvidenceForIndex[],
  code: string,
  message: string
) {
  await Promise.all(
    segments.map((segment) => markSegmentFailed(segment.id, code, message))
  );
}

async function markSegmentFailed(id: string, code: string, message: string) {
  await prisma.evidenceSegment.update({
    where: { id },
    data: {
      embeddingStatus: "FAILED",
      embeddingErrorCode: code,
      embeddingErrorMessage: message.slice(0, 500)
    }
  });
}

type NormalizedIndexingFailure = {
  safeErrorMessage: string;
  firstFailureReason: string;
  segmentErrorCode: string;
  metadata: Record<string, unknown>;
  logFields: Record<string, unknown>;
};

function normalizeIndexingError(
  error: unknown,
  context: {
    phase: IndexFailurePhase;
    indexName: string;
    embeddingDimensionsExpected?: number;
    embeddingDimensionsActual?: number;
    batchSize?: number;
    failedDocumentCount?: number;
  }
): NormalizedIndexingFailure {
  const details = getSafeErrorDetails(error);
  const actualDimensions =
    context.embeddingDimensionsActual ?? details.actualDimensions;
  const expectedDimensions =
    context.embeddingDimensionsExpected ?? details.expectedDimensions;
  const metadata = compactObject({
    failurePhase: context.phase,
    azureStatusCode: details.statusCode,
    azureErrorCode: details.providerCode ?? details.code,
    azureRequestId: details.requestId,
    embeddingDimensionsExpected: expectedDimensions,
    embeddingDimensionsActual: actualDimensions,
    indexName: context.indexName,
    batchSize: context.batchSize,
    failedDocumentCount: context.failedDocumentCount,
    firstFailureReason: details.message
  });
  const logFields = compactObject({
    phase: context.phase,
    indexName: context.indexName,
    embeddingDimensionsExpected: expectedDimensions,
    embeddingDimensionsActual: actualDimensions,
    batchSize: context.batchSize,
    failedDocumentCount: context.failedDocumentCount,
    name: details.name,
    code: details.code,
    statusCode: details.statusCode,
    message: details.message,
    requestId: details.requestId
  });

  return {
    safeErrorMessage: details.message,
    firstFailureReason: details.message,
    segmentErrorCode: details.providerCode ?? details.code,
    metadata,
    logFields
  };
}

function getSafeErrorDetails(error: unknown) {
  if (error instanceof SearchError) {
    return {
      name: error.name,
      code: error.code,
      providerCode: error.providerCode,
      statusCode: error.statusCode,
      message: error.safeMessage,
      requestId: error.requestId,
      expectedDimensions: undefined,
      actualDimensions: undefined
    };
  }

  if (error instanceof EmbeddingError) {
    return {
      name: error.name,
      code: error.code,
      providerCode: error.providerCode,
      statusCode: error.statusCode,
      message: error.safeMessage,
      requestId: error.requestId,
      expectedDimensions: error.expectedDimensions,
      actualDimensions: error.actualDimensions
    };
  }

  const normalized = normalizeEmbeddingError(error);

  return {
    name: normalized.name,
    code: normalized.code,
    providerCode: normalized.providerCode,
    statusCode: normalized.statusCode,
    message: normalized.safeMessage,
    requestId: normalized.requestId,
    expectedDimensions: normalized.expectedDimensions,
    actualDimensions: normalized.actualDimensions
  };
}

function buildFailureResult({
  indexedCount,
  failedCount,
  indexName,
  failure
}: {
  indexedCount: number;
  failedCount: number;
  indexName: string;
  failure: NormalizedIndexingFailure;
}): IndexEvidenceResult {
  return {
    indexedCount,
    failedCount,
    skipped: false,
    retrievalMode: "local_lexical_fallback",
    indexName,
    embeddingDimensions:
      typeof failure.metadata.embeddingDimensionsActual === "number"
        ? failure.metadata.embeddingDimensionsActual
        : undefined,
    errorCode: "SEARCH_INDEX_FAILED",
    safeErrorMessage: failure.safeErrorMessage,
    firstFailureReason: failure.firstFailureReason,
    metadata: {
      ...failure.metadata,
      indexedCount,
      failedCount
    }
  };
}

function normalizeEmbeddingOrSearchError(error: unknown) {
  if (error instanceof SearchError) {
    return {
      code: error.providerCode ?? error.code,
      message: error.safeMessage
    };
  }

  const embedding = normalizeEmbeddingError(error);

  return {
    code: embedding.providerCode ?? embedding.code,
    message: embedding.safeMessage
  };
}

function logIndexEvent(event: string, fields: Record<string, unknown>) {
  console.info("[index]", event, JSON.stringify(compactObject(fields)));
}

function compactObject(fields: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined)
  );
}
