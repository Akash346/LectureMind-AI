import { formatTimestamp } from "@/lib/ai/evidence-compiler";
import { isEmbeddingConfigured } from "@/lib/ai/embeddings";
import { prisma } from "@/lib/prisma";
import {
  localLexicalSearchEvidence,
  searchEvidence,
  validateRetrievalQuery,
  type RetrievalMode
} from "@/lib/search/retriever";
import {
  getSearchIndexEnvSource,
  getSearchIndexName,
  isSearchConfigured,
  SearchError
} from "@/lib/search/search-client";

const DEFAULT_TOP_K = 8;
const MAX_CONTEXT_CHARACTERS = 12_000;

export type LectureEvidenceChunk = {
  evidenceSegmentId: string;
  startSec: number;
  endSec: number;
  label: string;
  text: string;
  score: number;
  source: string;
  retrievalMode: RetrievalMode;
};

export type RetrieveLectureContextResult =
  | {
      ok: true;
      notebook: {
        id: string;
        title: string;
        videoTitle: string | null;
        language: string;
      };
      chunks: LectureEvidenceChunk[];
      retrievalMode: RetrievalMode;
      fallbackReason: string | null;
      debug: {
        retrievalMode: RetrievalMode;
        retrievedSegmentCount: number;
        topEvidenceIds: string[];
        fallbackReason: string | null;
        searchIndexName: string;
        indexEnvSource: string;
        searchConfigured: boolean;
        embeddingsConfigured: boolean;
        indexedSegmentCount: number;
      };
    }
  | {
      ok: false;
      error: {
        code:
          | "NOTEBOOK_NOT_FOUND"
          | "EMPTY_QUERY"
          | "INSUFFICIENT_EVIDENCE";
        message: string;
      };
    };

export async function retrieveLectureContext({
  userId,
  notebookId,
  query,
  topK = DEFAULT_TOP_K
}: {
  userId: string;
  notebookId: string;
  query: string;
  topK?: number;
}): Promise<RetrieveLectureContextResult> {
  if (!validateRetrievalQuery(query)) {
    return {
      ok: false,
      error: {
        code: "EMPTY_QUERY",
        message: "Enter a question about the lecture."
      }
    };
  }

  const notebook = await prisma.notebook.findFirst({
    where: {
      id: notebookId,
      userId
    },
    select: {
      id: true,
      title: true,
      videoTitle: true,
      language: true,
      status: true,
      evidenceSegments: {
        orderBy: { startSec: "asc" },
        select: {
          id: true,
          notebookId: true,
          startSec: true,
          endSec: true,
          text: true,
          sourceType: true,
          extractionEngine: true,
          rawSource: true,
          indexedAt: true,
          searchDocumentId: true,
          language: true
        }
      },
      jobs: {
        where: {
          type: "INDEX_EVIDENCE",
          status: "SUCCEEDED"
        },
        orderBy: {
          updatedAt: "desc"
        },
        take: 1,
        select: {
          metadata: true
        }
      }
    }
  });

  if (!notebook) {
    return {
      ok: false,
      error: {
        code: "NOTEBOOK_NOT_FOUND",
        message: "Notebook not found."
      }
    };
  }

  if (notebook.status !== "READY" || notebook.evidenceSegments.length === 0) {
    return {
      ok: false,
      error: {
        code: "INSUFFICIENT_EVIDENCE",
        message: "I could not find enough lecture evidence to answer this safely."
      }
    };
  }

  const normalizedTopK = Math.max(1, Math.min(topK, 16));
  const indexedSegmentCount = notebook.evidenceSegments.filter(
    (segment) => segment.indexedAt && segment.searchDocumentId
  ).length;
  const currentIndexName = getSearchIndexName();
  const latestIndexedIndexName = getLatestIndexedIndexName(
    notebook.jobs[0]?.metadata
  );
  const indexed =
    indexedSegmentCount > 0 &&
    (!latestIndexedIndexName || latestIndexedIndexName === currentIndexName);
  const searchConfigured = isSearchConfigured();
  const embeddingsConfigured = isEmbeddingConfigured();
  let fallbackReason: string | null = null;

  if (searchConfigured && embeddingsConfigured && indexed) {
    try {
      const hits = await searchEvidence({
        notebookId,
        userId,
        query,
        topK: normalizedTopK
      });
      const chunks = canonicalizeHits({
        hits,
        segments: notebook.evidenceSegments,
        retrievalMode: "azure_hybrid"
      });

      if (chunks.length > 0) {
        const capped = capContextCharacters(chunks);
        logRetrievalSourceSelected({
          notebookId,
          source: "hybrid_search",
          indexedSegmentCount,
          fallbackReason: null
        });

        return {
          ok: true,
          notebook,
          chunks: capped,
          retrievalMode: "azure_hybrid",
          fallbackReason: null,
          debug: buildRetrievalDebug({
            chunks: capped,
            retrievalMode: "azure_hybrid",
            fallbackReason: null,
            searchConfigured,
            embeddingsConfigured,
            indexedSegmentCount
          })
        };
      }

      fallbackReason = "azure_search_query_returned_zero_results";
    } catch (error) {
      fallbackReason = "azure_search_query_failed";
      console.warn(
        "[retrieval]",
        JSON.stringify({
          event: "azure_search_query_failed",
          notebookId,
          searchIndexName: currentIndexName,
          indexEnvSource: getSearchIndexEnvSource(),
          ...getSafeRetrievalErrorDetails(error)
        })
      );
    }
  } else {
    fallbackReason = !searchConfigured
      ? "search_not_configured"
      : !embeddingsConfigured
        ? "embeddings_not_configured"
        : indexed
          ? null
          : "not_indexed_yet";
  }

  if (fallbackReason) {
    console.warn(
      "[retrieval]",
      JSON.stringify({
        event: "retrieval_fallback_reason",
        notebookId,
        retrievalMode: "local_lexical_fallback",
        fallbackReason,
        searchConfigured,
        embeddingsConfigured,
        indexedSegmentCount,
        searchIndexName: currentIndexName,
        indexEnvSource: getSearchIndexEnvSource()
      })
    );
  }

  const localHits = localLexicalSearchEvidence({
    query,
    topK: normalizedTopK,
    segments: notebook.evidenceSegments
  });
  const chunks = canonicalizeHits({
    hits: localHits,
    segments: notebook.evidenceSegments,
    retrievalMode: "local_lexical_fallback"
  });

  if (chunks.length === 0) {
    return {
      ok: false,
      error: {
        code: "INSUFFICIENT_EVIDENCE",
        message: "I could not find enough lecture evidence to answer this safely."
      }
    };
  }

  const capped = capContextCharacters(chunks);
  logRetrievalSourceSelected({
    notebookId,
    source: "local_lexical_fallback",
    indexedSegmentCount,
    fallbackReason
  });

  return {
    ok: true,
    notebook,
    chunks: capped,
    retrievalMode: "local_lexical_fallback",
    fallbackReason,
    debug: buildRetrievalDebug({
      chunks: capped,
      retrievalMode: "local_lexical_fallback",
      fallbackReason,
      searchConfigured,
      embeddingsConfigured,
      indexedSegmentCount
    })
  };
}

function canonicalizeHits({
  hits,
  segments,
  retrievalMode
}: {
  hits: Array<{
    evidenceSegmentId: string;
    score: number;
    source: string;
  }>;
  segments: Array<{
    id: string;
    notebookId: string;
    startSec: number;
    endSec: number;
    text: string;
    sourceType: string;
    extractionEngine: string | null;
    rawSource: string | null;
  }>;
  retrievalMode: RetrievalMode;
}): LectureEvidenceChunk[] {
  const segmentById = new Map(segments.map((segment) => [segment.id, segment]));
  const seen = new Set<string>();
  const chunks: LectureEvidenceChunk[] = [];

  for (const hit of hits) {
    if (seen.has(hit.evidenceSegmentId)) {
      continue;
    }

    const segment = segmentById.get(hit.evidenceSegmentId);

    if (!segment) {
      continue;
    }

    seen.add(segment.id);
    chunks.push({
      evidenceSegmentId: segment.id,
      startSec: segment.startSec,
      endSec: segment.endSec,
      label: formatTimestamp(segment.startSec),
      text: segment.text,
      score: hit.score,
      source:
        segment.rawSource ??
        segment.extractionEngine ??
        hit.source ??
        segment.sourceType,
      retrievalMode
    });
  }

  return chunks;
}

function capContextCharacters(chunks: LectureEvidenceChunk[]) {
  const capped: LectureEvidenceChunk[] = [];
  let total = 0;

  for (const chunk of chunks) {
    if (total + chunk.text.length > MAX_CONTEXT_CHARACTERS && capped.length > 0) {
      break;
    }

    capped.push(chunk);
    total += chunk.text.length;
  }

  return capped;
}

function buildRetrievalDebug({
  chunks,
  retrievalMode,
  fallbackReason,
  searchConfigured,
  embeddingsConfigured,
  indexedSegmentCount
}: {
  chunks: LectureEvidenceChunk[];
  retrievalMode: RetrievalMode;
  fallbackReason: string | null;
  searchConfigured: boolean;
  embeddingsConfigured: boolean;
  indexedSegmentCount: number;
}) {
  return {
    retrievalMode,
    retrievedSegmentCount: chunks.length,
    topEvidenceIds: chunks.map((chunk) => chunk.evidenceSegmentId).slice(0, 8),
    fallbackReason,
    searchIndexName: getSearchIndexName(),
    indexEnvSource: getSearchIndexEnvSource(),
    searchConfigured,
    embeddingsConfigured,
    indexedSegmentCount
  };
}

function getLatestIndexedIndexName(metadata: unknown) {
  const record = toRecord(metadata);
  const result = toRecord(record?.result);
  const indexName = result?.indexName;

  return typeof indexName === "string" && indexName.trim()
    ? indexName.trim()
    : null;
}

function toRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getSafeRetrievalErrorDetails(error: unknown) {
  if (error instanceof SearchError) {
    return {
      name: error.name,
      code: error.code,
      azureErrorCode: error.providerCode,
      statusCode: error.statusCode,
      message: error.safeMessage,
      requestId: error.requestId
    };
  }

  return {
    name: error instanceof Error ? error.name : "UnknownError",
    code: "UNKNOWN",
    message: error instanceof Error ? error.message.slice(0, 300) : "unknown"
  };
}

function logRetrievalSourceSelected({
  notebookId,
  source,
  indexedSegmentCount,
  fallbackReason
}: {
  notebookId: string;
  source: "hybrid_search" | "local_lexical_fallback";
  indexedSegmentCount: number;
  fallbackReason: string | null;
}) {
  console.info(
    "[retrieval]",
    JSON.stringify({
      event: "retrieval_source_selected",
      notebookId,
      source,
      indexedSegmentCount,
      fallbackReason
    })
  );
}
