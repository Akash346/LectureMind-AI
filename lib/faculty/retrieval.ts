import { generateFacultyEmbeddings } from "@/lib/faculty/models";
import {
  buildFacultyNamespaceFilter,
  getFacultySearchIndexName
} from "@/lib/faculty/indexing";
import { logFacultyEvent } from "@/lib/faculty/logger";
import { isSearchConfigured, searchFetch } from "@/lib/search/search-client";

export type FacultyEvidence = {
  id: string;
  text: string;
  sourceType: "lecture" | "document";
  timestamp?: string;
  pageNumber?: number;
  reference: string;
};

type FacultySearchResponse = {
  value?: Array<{
    id?: string;
    text?: string;
    sourceType?: string;
    timestamp?: string;
    pageNumber?: number;
    reference?: string;
  }>;
};

export async function retrieveFacultyEvidence(input: {
  sessionId: string;
  query: string;
  topK?: number;
  sourceTypes?: Array<"lecture" | "document">;
}): Promise<FacultyEvidence[]> {
  if (!input.query.trim()) {
    return [];
  }

  if (!isSearchConfigured()) {
    throw new Error("Azure AI Search is not configured for Faculty retrieval.");
  }

  const topK = Math.max(1, Math.min(input.topK ?? 8, 20));
  const embedding = (
    await generateFacultyEmbeddings({
      sessionId: input.sessionId,
      texts: [input.query]
    })
  ).embeddings[0]?.embedding;

  if (!embedding) {
    throw new Error("Faculty retrieval embedding failed.");
  }

  logFacultyEvent("faculty_retrieval_started", {
    sessionId: input.sessionId,
    topK,
    sourceTypes: input.sourceTypes
  });

  const response = await searchFetch<FacultySearchResponse>({
    path: `/indexes/${encodeURIComponent(getFacultySearchIndexName())}/docs/search`,
    method: "POST",
    operation: "query",
    body: {
      search: input.query,
      top: topK,
      filter: buildFacultyNamespaceFilter(input),
      select: "id,text,sourceType,timestamp,pageNumber,reference",
      vectorQueries: [
        {
          kind: "vector",
          vector: embedding,
          fields: "embedding",
          k: topK
        }
      ]
    }
  });

  const evidence = (response.value ?? [])
    .filter(
      (item) =>
        typeof item.id === "string" &&
        typeof item.text === "string" &&
        (item.sourceType === "lecture" || item.sourceType === "document")
    )
    .map((item) => ({
      id: item.id!,
      text: item.text!,
      sourceType: item.sourceType as "lecture" | "document",
      timestamp: item.timestamp || undefined,
      pageNumber:
        typeof item.pageNumber === "number" ? item.pageNumber : undefined,
      reference: item.reference || item.id!
    }));

  logFacultyEvent("faculty_retrieval_complete", {
    sessionId: input.sessionId,
    resultCount: evidence.length
  });

  return evidence;
}
