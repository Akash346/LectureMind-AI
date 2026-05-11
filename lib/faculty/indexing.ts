import { getExpectedEmbeddingDimensions } from "@/lib/ai/embeddings";
import { getFacultyConfig } from "@/lib/config/server-env";
import { logFacultyEvent } from "@/lib/faculty/logger";
import { generateFacultyEmbeddings } from "@/lib/faculty/models";
import { getFacultyNamespace } from "@/lib/faculty/session";
import {
  escapeODataString,
  isSearchConfigured,
  searchFetch
} from "@/lib/search/search-client";

const FACULTY_VECTOR_PROFILE_NAME = "faculty-evidence-vector-profile";
const FACULTY_VECTOR_ALGORITHM_NAME = "faculty-evidence-hnsw";
const INDEX_BATCH_SIZE = 50;

type FacultySearchDocument = {
  "@search.action": "mergeOrUpload" | "delete";
  id: string;
  namespace?: string;
  sessionId?: string;
  sourceType?: "lecture" | "document";
  sourceId?: string;
  text?: string;
  timestamp?: string;
  pageNumber?: number | null;
  heading?: string;
  reference?: string;
  createdAt?: string;
  embedding?: number[];
};

export async function indexFacultyTranscript(input: {
  sessionId: string;
  transcript: string;
  segments: Array<{
    id: string;
    text: string;
    startSeconds?: number;
    endSeconds?: number;
  }>;
}): Promise<{ indexedCount: number }> {
  await ensureFacultyEvidenceIndex();
  const namespace = getFacultyNamespace(input.sessionId);
  const documents = await buildFacultyDocuments({
    sessionId: input.sessionId,
    namespace,
    chunks: input.segments.map((segment, index) => ({
      sourceType: "lecture" as const,
      sourceId: segment.id,
      text: segment.text,
      timestamp: formatSeconds(segment.startSeconds),
      reference: `C${index + 1}`,
      id: createFacultySearchDocumentId(input.sessionId, "lecture", segment.id)
    }))
  });

  const indexedCount = await uploadFacultyDocuments(input.sessionId, documents);
  logFacultyEvent("faculty_index_complete", {
    sessionId: input.sessionId,
    sourceType: "lecture",
    indexedCount
  });

  return { indexedCount };
}

export async function indexFacultyDocument(input: {
  sessionId: string;
  uploadId: string;
  chunks: Array<{
    id: string;
    text: string;
    pageNumber?: number;
    heading?: string;
  }>;
}): Promise<{ indexedCount: number }> {
  await ensureFacultyEvidenceIndex();
  const namespace = getFacultyNamespace(input.sessionId);
  const documents = await buildFacultyDocuments({
    sessionId: input.sessionId,
    namespace,
    chunks: input.chunks.map((chunk, index) => ({
      sourceType: "document" as const,
      sourceId: input.uploadId,
      text: chunk.text,
      pageNumber: chunk.pageNumber ?? null,
      heading: chunk.heading,
      reference: `D${index + 1}`,
      id: createFacultySearchDocumentId(
        input.sessionId,
        "document",
        `${input.uploadId}_${chunk.id}`
      )
    }))
  });

  const indexedCount = await uploadFacultyDocuments(input.sessionId, documents);
  logFacultyEvent("faculty_index_complete", {
    sessionId: input.sessionId,
    sourceType: "document",
    indexedCount
  });

  return { indexedCount };
}

export async function deleteFacultyNamespace(input: {
  sessionId: string;
}): Promise<{ deletedCount: number }> {
  if (!isSearchConfigured()) {
    return { deletedCount: 0 };
  }

  const indexName = getFacultySearchIndexName();
  const namespace = getFacultyNamespace(input.sessionId);
  const search = await searchFetch<{
    value?: Array<{ id?: string }>;
  }>({
    path: `/indexes/${encodeURIComponent(indexName)}/docs/search`,
    method: "POST",
    operation: "query",
    body: {
      search: "*",
      top: 1000,
      filter: `namespace eq '${escapeODataString(namespace)}'`,
      select: "id"
    }
  });
  const docs = (search.value ?? [])
    .map((item) => item.id)
    .filter((id): id is string => Boolean(id))
    .map((id) => ({ "@search.action": "delete", id }));

  if (docs.length === 0) {
    return { deletedCount: 0 };
  }

  await searchFetch({
    path: `/indexes/${encodeURIComponent(indexName)}/docs/index`,
    method: "POST",
    operation: "index",
    body: {
      value: docs
    }
  });

  return { deletedCount: docs.length };
}

export function getFacultySearchIndexName() {
  return getFacultyConfig().searchIndexName;
}

export function buildFacultyNamespaceFilter(input: {
  sessionId: string;
  sourceTypes?: Array<"lecture" | "document">;
}) {
  const filters = [
    `namespace eq '${escapeODataString(getFacultyNamespace(input.sessionId))}'`
  ];

  if (input.sourceTypes?.length) {
    filters.push(
      `(${input.sourceTypes
        .map((type) => `sourceType eq '${escapeODataString(type)}'`)
        .join(" or ")})`
    );
  }

  return filters.join(" and ");
}

async function ensureFacultyEvidenceIndex() {
  if (!isSearchConfigured()) {
    throw new Error("Azure AI Search is not configured for Faculty indexing.");
  }

  const indexName = getFacultySearchIndexName();
  const dimensions = getExpectedEmbeddingDimensions();
  const schema = {
    name: indexName,
    fields: [
      { name: "id", type: "Edm.String", key: true, filterable: true },
      { name: "namespace", type: "Edm.String", filterable: true },
      { name: "sessionId", type: "Edm.String", filterable: true },
      { name: "sourceType", type: "Edm.String", filterable: true },
      { name: "sourceId", type: "Edm.String", filterable: true },
      { name: "text", type: "Edm.String", searchable: true },
      { name: "timestamp", type: "Edm.String", filterable: true },
      { name: "pageNumber", type: "Edm.Int32", filterable: true, sortable: true },
      { name: "heading", type: "Edm.String", searchable: true },
      { name: "reference", type: "Edm.String", filterable: true },
      {
        name: "createdAt",
        type: "Edm.DateTimeOffset",
        filterable: true,
        sortable: true
      },
      {
        name: "embedding",
        type: "Collection(Edm.Single)",
        searchable: true,
        dimensions,
        vectorSearchProfile: FACULTY_VECTOR_PROFILE_NAME
      }
    ],
    vectorSearch: {
      algorithms: [
        {
          name: FACULTY_VECTOR_ALGORITHM_NAME,
          kind: "hnsw",
          hnswParameters: {
            metric: "cosine",
            m: 4,
            efConstruction: 400,
            efSearch: 500
          }
        }
      ],
      profiles: [
        {
          name: FACULTY_VECTOR_PROFILE_NAME,
          algorithm: FACULTY_VECTOR_ALGORITHM_NAME
        }
      ]
    }
  };

  try {
    await searchFetch({
      path: `/indexes/${encodeURIComponent(indexName)}`,
      method: "GET",
      operation: "index"
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "statusCode" in error &&
      (error as { statusCode?: number }).statusCode === 404
    ) {
      await searchFetch({
        path: `/indexes/${encodeURIComponent(indexName)}`,
        method: "PUT",
        operation: "index",
        body: schema
      });
      return;
    }

    throw error;
  }
}

async function buildFacultyDocuments(input: {
  sessionId: string;
  namespace: string;
  chunks: Array<{
    id: string;
    sourceType: "lecture" | "document";
    sourceId: string;
    text: string;
    timestamp?: string;
    pageNumber?: number | null;
    heading?: string;
    reference: string;
  }>;
}): Promise<FacultySearchDocument[]> {
  const cleanChunks = input.chunks.filter((chunk) => chunk.text.trim());
  const embeddings = await generateFacultyEmbeddings({
    sessionId: input.sessionId,
    texts: cleanChunks.map((chunk) => chunk.text)
  });

  return cleanChunks.map((chunk, index) => ({
    "@search.action": "mergeOrUpload",
    id: chunk.id,
    namespace: input.namespace,
    sessionId: input.sessionId,
    sourceType: chunk.sourceType,
    sourceId: chunk.sourceId,
    text: chunk.text.trim(),
    timestamp: chunk.timestamp,
    pageNumber: chunk.pageNumber ?? null,
    heading: chunk.heading ?? "",
    reference: chunk.reference,
    createdAt: new Date().toISOString(),
    embedding: embeddings.embeddings[index]?.embedding ?? []
  }));
}

async function uploadFacultyDocuments(
  sessionId: string,
  documents: FacultySearchDocument[]
) {
  const indexName = getFacultySearchIndexName();
  let indexedCount = 0;

  for (let start = 0; start < documents.length; start += INDEX_BATCH_SIZE) {
    const batch = documents.slice(start, start + INDEX_BATCH_SIZE);
    await searchFetch({
      path: `/indexes/${encodeURIComponent(indexName)}/docs/index`,
      method: "POST",
      operation: "index",
      body: {
        value: batch
      }
    });
    indexedCount += batch.length;
  }

  logFacultyEvent("faculty_index_complete", {
    sessionId,
    indexName,
    indexedCount
  });

  return indexedCount;
}

function createFacultySearchDocumentId(
  sessionId: string,
  sourceType: "lecture" | "document",
  id: string
) {
  return `${sessionId}_${sourceType}_${id}`.replace(/[^A-Za-z0-9_-]/g, "_");
}

function formatSeconds(seconds?: number) {
  if (seconds === undefined || !Number.isFinite(seconds)) {
    return undefined;
  }

  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remaining = rounded % 60;

  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
}
