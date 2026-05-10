import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getExpectedEmbeddingDimensions,
  isEmbeddingConfigured
} from "@/lib/ai/embeddings";
import { getApiUser } from "@/lib/api-auth";
import { logNotebookOwnerDebug } from "@/lib/auth-debug";
import { getAzureSearchConfig } from "@/lib/config/server-env";
import { enqueueJob, serializeJob } from "@/lib/jobs/job-store";
import { runJobById } from "@/lib/jobs/job-runner";
import { prisma } from "@/lib/prisma";
import { getEvidenceIndexMismatches } from "@/lib/search/index-schema";
import {
  getSearchIndexName,
  isSearchConfigured,
  searchFetch,
  SearchError
} from "@/lib/search/search-client";

const paramsSchema = z.object({
  notebookId: z.string().min(1)
});
const indexRequestSchema = z
  .object({
    force: z.boolean().optional().default(false)
  })
  .optional();

type SearchIndexDefinition = {
  name?: string;
  fields?: Array<{
    name?: string;
    type?: string;
    key?: boolean;
    searchable?: boolean;
    filterable?: boolean;
    sortable?: boolean;
    dimensions?: number;
    vectorSearchDimensions?: number;
    vectorSearchProfile?: string;
    vectorSearchProfileName?: string;
  }>;
  vectorSearch?: {
    algorithms?: Array<{
      name?: string;
      kind?: string;
    }>;
    profiles?: Array<{
      name?: string;
      algorithm?: string;
      algorithmConfigurationName?: string;
    }>;
  };
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ notebookId: string }> }
) {
  const user = await getApiUser();

  if (!user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
      { status: 401 }
    );
  }

  const parsedParams = paramsSchema.safeParse(await params);

  if (!parsedParams.success) {
    return NextResponse.json(
      { error: { code: "INVALID_NOTEBOOK", message: "Invalid notebook." } },
      { status: 400 }
    );
  }

  const notebook = await prisma.notebook.findFirst({
    where: {
      id: parsedParams.data.notebookId,
      userId: user.id
    },
    select: {
      id: true,
      userId: true,
      status: true,
      _count: {
        select: {
          evidenceSegments: true
        }
      }
    }
  });

  if (!notebook) {
    return NextResponse.json(
      { error: { code: "NOTEBOOK_NOT_FOUND", message: "Notebook not found." } },
      { status: 404 }
    );
  }

  logNotebookOwnerDebug({
    event: "api_notebook_index_post",
    sessionUserId: user.id,
    notebookId: notebook.id,
    notebookOwnerId: notebook.userId
  });

  if (notebook.status !== "READY" || notebook._count.evidenceSegments === 0) {
    return NextResponse.json(
      {
        error: {
          code: "INSUFFICIENT_EVIDENCE",
          message: "Evidence is not ready to index yet."
        }
      },
      { status: 422 }
    );
  }

  const body = indexRequestSchema.safeParse(await readJsonBody(request));
  const force = body.success ? body.data?.force === true : false;
  const searchConfig = getAzureSearchConfig();
  const searchConfigured = isSearchConfigured();
  const embeddingsConfigured = isEmbeddingConfigured();

  if (!searchConfigured || !embeddingsConfigured) {
    return NextResponse.json(
      {
        error: {
          code: !searchConfigured
            ? "SEARCH_NOT_CONFIGURED"
            : "EMBEDDING_NOT_CONFIGURED",
          message: !searchConfigured
            ? "Azure AI Search is not configured yet."
            : "Embedding generation is not configured yet.",
          details: {
            searchConfigured,
            embeddingsConfigured,
            indexName: searchConfig.indexName,
            indexEnvSource: searchConfig.source.indexName
          }
        }
      },
      { status: 503 }
    );
  }

  console.info(
    "[index]",
    JSON.stringify({
      event: "index_request",
      notebookId: notebook.id,
      force,
      searchConfigured,
      embeddingsConfigured,
      indexName: searchConfig.indexName,
      indexEnvSource: searchConfig.source.indexName
    })
  );

  const existing = await prisma.job.findFirst({
    where: {
      notebookId: notebook.id,
      userId: user.id,
      type: "INDEX_EVIDENCE",
      status: {
        in: ["QUEUED", "RUNNING"]
      }
    },
    orderBy: {
      updatedAt: "desc"
    }
  });

  if (existing) {
    const counts = await getIndexCounts(notebook.id);

    return NextResponse.json(
      buildIndexResponse({
        notebookId: notebook.id,
        jobId: existing.id,
        indexedCount: counts.indexed,
        failedCount: counts.failed,
        totalEvidenceSegments: counts.total,
        searchConfigured,
        embeddingsConfigured,
        indexEnvSource: searchConfig.source.indexName
      }),
      { status: 202 }
    );
  }

  if (!force) {
    const readiness = await getIndexReadiness({
      notebookId: notebook.id,
      notebookStatus: notebook.status,
      searchConfigured,
      embeddingsConfigured,
      indexName: searchConfig.indexName
    });

    if (!readiness.shouldIndex) {
      console.info(
        "[index]",
        JSON.stringify({
          event: "index_request_skipped",
          notebookId: notebook.id,
          reason: "already_indexed",
          indexedSegmentCount: readiness.indexedSegmentCount,
          totalEvidenceSegments: readiness.totalEvidenceSegments,
          indexName: searchConfig.indexName,
          schemaCompatible: readiness.schemaCompatible
        })
      );

      return NextResponse.json(
        buildIndexResponse({
          notebookId: notebook.id,
          jobId: readiness.latestJob?.id ?? null,
          indexedCount: readiness.indexedSegmentCount,
          failedCount: readiness.failedSegmentCount,
          totalEvidenceSegments: readiness.totalEvidenceSegments,
          searchConfigured,
          embeddingsConfigured,
          indexEnvSource: searchConfig.source.indexName,
          latestJob: readiness.latestJob ? serializeJob(readiness.latestJob) : null,
          skipped: true,
          indexingRequiredReason: readiness.indexingRequiredReason,
          schemaCompatible: readiness.schemaCompatible
        })
      );
    }
  }

  if (force) {
    await prisma.evidenceSegment.updateMany({
      where: { notebookId: notebook.id },
      data: {
        embeddingStatus: "PENDING",
        indexedAt: null,
        searchDocumentId: null,
        embeddingErrorCode: null,
        embeddingErrorMessage: null
      }
    });
  }

  const job = await enqueueJob({
    notebookId: notebook.id,
    userId: user.id,
    type: "INDEX_EVIDENCE",
    currentStep: "Queued evidence indexing",
    maxAttempts: 2,
    metadata: {
      force
    }
  });

  await runJobById(job.id);

  const counts = await getIndexCounts(notebook.id);
  const latestJob = await prisma.job.findUnique({
    where: { id: job.id }
  });

  return NextResponse.json(
    buildIndexResponse({
      notebookId: notebook.id,
      jobId: job.id,
      indexedCount: counts.indexed,
      failedCount: counts.failed,
      totalEvidenceSegments: counts.total,
      searchConfigured,
      embeddingsConfigured,
      indexEnvSource: searchConfig.source.indexName,
      latestJob: latestJob ? serializeJob(latestJob) : null
    })
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ notebookId: string }> }
) {
  const user = await getApiUser();

  if (!user?.id) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Unauthorized" } },
      { status: 401 }
    );
  }

  const parsedParams = paramsSchema.safeParse(await params);

  if (!parsedParams.success) {
    return NextResponse.json(
      { error: { code: "INVALID_NOTEBOOK", message: "Invalid notebook." } },
      { status: 400 }
    );
  }

  const notebook = await prisma.notebook.findFirst({
    where: {
      id: parsedParams.data.notebookId,
      userId: user.id
    },
    select: {
      id: true,
      userId: true,
      status: true,
      evidenceSegments: {
        select: {
          indexedAt: true,
          embeddingStatus: true
        }
      },
      jobs: {
        where: {
          type: "INDEX_EVIDENCE"
        },
        orderBy: {
          updatedAt: "desc"
        },
        take: 1
      }
    }
  });

  if (!notebook) {
    return NextResponse.json(
      { error: { code: "NOTEBOOK_NOT_FOUND", message: "Notebook not found." } },
      { status: 404 }
    );
  }

  logNotebookOwnerDebug({
    event: "api_notebook_index_get",
    sessionUserId: user.id,
    notebookId: notebook.id,
    notebookOwnerId: notebook.userId
  });

  const searchConfig = getAzureSearchConfig();
  const searchConfigured = isSearchConfigured();
  const embeddingsConfigured = isEmbeddingConfigured();
  const readiness = await getIndexReadiness({
    notebookId: notebook.id,
    notebookStatus: notebook.status,
    searchConfigured,
    embeddingsConfigured,
    indexName: searchConfig.indexName
  });
  const latestJob = readiness.latestJob;

  return NextResponse.json({
    searchConfigured,
    embeddingsConfigured,
    embeddingConfigured: embeddingsConfigured,
    indexName: searchConfig.indexName,
    indexEnvSource: searchConfig.source.indexName,
    totalEvidenceSegments: readiness.totalEvidenceSegments,
    totalSegmentCount: readiness.totalEvidenceSegments,
    indexedSegmentCount: readiness.indexedSegmentCount,
    failedSegmentCount: readiness.failedSegmentCount,
    schemaCompatible: readiness.schemaCompatible,
    schemaMismatchReasons: readiness.schemaMismatchReasons,
    shouldIndex: readiness.shouldIndex,
    indexingRequiredReason: readiness.indexingRequiredReason,
    latestIndexJob: latestJob
      ? {
          id: latestJob.id,
          status: latestJob.status,
          progress: latestJob.progress,
          progressPercent: latestJob.progressPercent,
          currentStep: latestJob.currentStep,
          errorCode: latestJob.errorCode,
          safeErrorMessage: latestJob.safeErrorMessage,
          metadata: toRecord(latestJob.metadata)
        }
      : null,
    job: latestJob
      ? {
          id: latestJob.id,
          status: latestJob.status,
          progress: latestJob.progress,
          progressPercent: latestJob.progressPercent,
          currentStep: latestJob.currentStep,
          errorCode: latestJob.errorCode,
          safeErrorMessage: latestJob.safeErrorMessage,
          metadata: toRecord(latestJob.metadata)
        }
      : null,
    chatReady: readiness.chatReady,
    retrievalMode: readiness.retrievalMode,
    fallbackReason: readiness.fallbackReason,
    status: readiness.status
  });
}

async function getIndexCounts(notebookId: string) {
  const segments = await prisma.evidenceSegment.findMany({
    where: { notebookId },
    select: {
      indexedAt: true,
      embeddingStatus: true,
      searchDocumentId: true
    }
  });

  return {
    total: segments.length,
    indexed: segments.filter((segment) => segment.indexedAt && segment.searchDocumentId)
      .length,
    failed: segments.filter((segment) => segment.embeddingStatus === "FAILED")
      .length
  };
}

async function getIndexReadiness({
  notebookId,
  notebookStatus,
  searchConfigured,
  embeddingsConfigured,
  indexName
}: {
  notebookId: string;
  notebookStatus: "READY" | string;
  searchConfigured: boolean;
  embeddingsConfigured: boolean;
  indexName: string;
}) {
  const [segments, latestJob, schemaStatus] = await Promise.all([
    prisma.evidenceSegment.findMany({
      where: { notebookId },
      select: {
        indexedAt: true,
        embeddingStatus: true,
        searchDocumentId: true
      }
    }),
    prisma.job.findFirst({
      where: {
        notebookId,
        type: "INDEX_EVIDENCE"
      },
      orderBy: {
        updatedAt: "desc"
      }
    }),
    getSearchIndexSchemaStatus({
      indexName,
      enabled: searchConfigured && embeddingsConfigured
    })
  ]);
  const totalEvidenceSegments = segments.length;
  const indexedRows = segments.filter(
    (segment) => segment.indexedAt && segment.searchDocumentId
  ).length;
  const failedSegmentCount = segments.filter(
    (segment) => segment.embeddingStatus === "FAILED"
  ).length;
  const latestIndexedIndexName = getLatestIndexedIndexName(latestJob?.metadata);
  const latestEmbeddingDimensionsExpected =
    getLatestEmbeddingDimensionsExpected(latestJob?.metadata);
  const expectedEmbeddingDimensions = getExpectedEmbeddingDimensions();
  const currentIndexMatches =
    !latestIndexedIndexName || latestIndexedIndexName === indexName;
  const embeddingDimensionsMatch =
    !latestEmbeddingDimensionsExpected ||
    latestEmbeddingDimensionsExpected === expectedEmbeddingDimensions;
  const indexedSegmentCount =
    currentIndexMatches && embeddingDimensionsMatch && schemaStatus.compatible === true
      ? indexedRows
      : 0;
  const indexingRequiredReason = getIndexingRequiredReason({
    notebookStatus,
    totalEvidenceSegments,
    indexedSegmentCount,
    failedSegmentCount,
    searchConfigured,
    embeddingsConfigured,
    schemaCompatible: schemaStatus.compatible,
    schemaCheckFailed: schemaStatus.checkFailed,
    currentIndexMatches,
    embeddingDimensionsMatch
  });
  const shouldIndex = Boolean(
    indexingRequiredReason &&
      searchConfigured &&
      embeddingsConfigured &&
      notebookStatus === "READY" &&
      totalEvidenceSegments > 0 &&
      schemaStatus.checkFailed === false
  );
  const retrievalMode =
    searchConfigured &&
    embeddingsConfigured &&
    schemaStatus.compatible === true &&
    indexedSegmentCount > 0
      ? "azure_hybrid"
      : "local_lexical_fallback";
  const fallbackReason =
    retrievalMode === "azure_hybrid"
      ? null
      : !searchConfigured
        ? "search_not_configured"
        : !embeddingsConfigured
          ? "embeddings_not_configured"
          : schemaStatus.checkFailed
            ? "index_schema_check_failed"
            : schemaStatus.compatible === false
              ? "index_schema_changed"
              : "not_indexed_yet";
  const chatReady =
    searchConfigured && embeddingsConfigured
      ? retrievalMode === "azure_hybrid"
      : notebookStatus === "READY" && totalEvidenceSegments > 0;

  return {
    latestJob,
    totalEvidenceSegments,
    indexedSegmentCount,
    failedSegmentCount,
    schemaCompatible: schemaStatus.compatible,
    schemaMismatchReasons: schemaStatus.mismatches,
    shouldIndex,
    indexingRequiredReason,
    chatReady,
    retrievalMode,
    fallbackReason,
    status:
      indexedSegmentCount > 0
        ? ("READY" as const)
        : latestJob?.status === "FAILED"
          ? ("FAILED" as const)
          : latestJob?.status === "QUEUED" || latestJob?.status === "RUNNING"
            ? latestJob.status
            : notebookStatus === "READY" && totalEvidenceSegments > 0
              ? ("FALLBACK" as const)
              : ("NOT_STARTED" as const)
  };
}

async function getSearchIndexSchemaStatus({
  indexName,
  enabled
}: {
  indexName: string;
  enabled: boolean;
}) {
  if (!enabled) {
    return {
      compatible: null as boolean | null,
      mismatches: [] as string[],
      checkFailed: false
    };
  }

  try {
    const index = await searchFetch<SearchIndexDefinition>({
      path: `/indexes/${encodeURIComponent(indexName)}`,
      method: "GET",
      operation: "index"
    });
    const mismatches = getEvidenceIndexMismatches(
      index,
      getExpectedEmbeddingDimensions()
    );

    return {
      compatible: mismatches.length === 0,
      mismatches,
      checkFailed: false
    };
  } catch (error) {
    if (error instanceof SearchError && error.statusCode === 404) {
      return {
        compatible: false,
        mismatches: [`Search index ${indexName} does not exist.`],
        checkFailed: false
      };
    }

    console.warn(
      "[index]",
      JSON.stringify({
        event: "index_schema_check_failed",
        indexName,
        name: error instanceof Error ? error.name : "UnknownError",
        code: error instanceof SearchError ? error.code : "UNKNOWN",
        statusCode: error instanceof SearchError ? error.statusCode : undefined,
        message:
          error instanceof SearchError
            ? error.safeMessage
            : error instanceof Error
              ? error.message.slice(0, 300)
              : "unknown"
      })
    );

    return {
      compatible: null as boolean | null,
      mismatches: [] as string[],
      checkFailed: true
    };
  }
}

function getIndexingRequiredReason({
  notebookStatus,
  totalEvidenceSegments,
  indexedSegmentCount,
  failedSegmentCount,
  searchConfigured,
  embeddingsConfigured,
  schemaCompatible,
  schemaCheckFailed,
  currentIndexMatches,
  embeddingDimensionsMatch
}: {
  notebookStatus: string;
  totalEvidenceSegments: number;
  indexedSegmentCount: number;
  failedSegmentCount: number;
  searchConfigured: boolean;
  embeddingsConfigured: boolean;
  schemaCompatible: boolean | null;
  schemaCheckFailed: boolean;
  currentIndexMatches: boolean;
  embeddingDimensionsMatch: boolean;
}) {
  if (notebookStatus !== "READY" || totalEvidenceSegments === 0) {
    return null;
  }

  if (!searchConfigured) {
    return "search_not_configured";
  }

  if (!embeddingsConfigured) {
    return "embeddings_not_configured";
  }

  if (schemaCheckFailed) {
    return "index_schema_check_failed";
  }

  if (schemaCompatible === false) {
    return "index_schema_changed";
  }

  if (!currentIndexMatches) {
    return "index_name_changed";
  }

  if (!embeddingDimensionsMatch) {
    return "embedding_dimensions_changed";
  }

  if (failedSegmentCount > 0) {
    return "failed_segments";
  }

  if (indexedSegmentCount < totalEvidenceSegments) {
    return "not_fully_indexed";
  }

  return null;
}

function buildIndexResponse({
  jobId,
  indexedCount,
  failedCount,
  totalEvidenceSegments,
  searchConfigured,
  embeddingsConfigured,
  indexEnvSource,
  latestJob,
  skipped = false,
  indexingRequiredReason = null,
  schemaCompatible
}: {
  notebookId: string;
  jobId: string | null;
  indexedCount: number;
  failedCount: number;
  totalEvidenceSegments: number;
  searchConfigured: boolean;
  embeddingsConfigured: boolean;
  indexEnvSource: string;
  latestJob?: ReturnType<typeof serializeJob> | null;
  skipped?: boolean;
  indexingRequiredReason?: string | null;
  schemaCompatible?: boolean | null;
}) {
  const retrievalMode =
    searchConfigured && embeddingsConfigured && indexedCount > 0
      ? "azure_hybrid"
      : "local_lexical_fallback";

  return {
    ok: true,
    jobId,
    indexName: getSearchIndexName(),
    indexEnvSource,
    indexedCount,
    failedCount,
    searchConfigured,
    embeddingsConfigured,
    totalEvidenceSegments,
    chatReady: retrievalMode === "azure_hybrid",
    retrievalMode,
    skipped,
    indexingRequiredReason,
    schemaCompatible,
    latestIndexJob: latestJob ?? null
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

function getLatestEmbeddingDimensionsExpected(metadata: unknown) {
  const record = toRecord(metadata);
  const result = toRecord(record?.result);
  const resultMetadata = toRecord(result?.metadata);
  const dimensions =
    resultMetadata?.embeddingDimensionsExpected ??
    result?.embeddingDimensions ??
    record?.embeddingDimensionsExpected;

  return typeof dimensions === "number" && Number.isFinite(dimensions)
    ? Math.round(dimensions)
    : null;
}

function toRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
