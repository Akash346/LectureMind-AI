import { generateEmbeddings, isEmbeddingConfigured } from "@/lib/ai/embeddings";
import {
  escapeODataString,
  getSearchIndexName,
  isSearchConfigured,
  searchFetch,
  SearchError
} from "@/lib/search/search-client";

export type RetrievalMode = "azure_hybrid" | "local_lexical_fallback";

export type SearchEvidenceInput = {
  notebookId: string;
  userId: string;
  query: string;
  topK?: number;
};

export type EvidenceSearchHit = {
  evidenceSegmentId: string;
  notebookId: string;
  startSec: number;
  endSec: number;
  text: string;
  score: number;
  source: string;
  retrievalMode: RetrievalMode;
};

type AzureSearchResponse = {
  value?: Array<{
    "@search.score"?: number;
    evidenceSegmentId?: string;
    notebookId?: string;
    startSec?: number;
    endSec?: number;
    text?: string;
    rawSource?: string;
    extractionEngine?: string;
  }>;
};

export async function searchEvidence({
  notebookId,
  userId,
  query,
  topK = 8
}: SearchEvidenceInput): Promise<EvidenceSearchHit[]> {
  if (!isSearchConfigured()) {
    throw new SearchError({ code: "SEARCH_NOT_CONFIGURED" });
  }

  if (!isEmbeddingConfigured()) {
    throw new SearchError({
      code: "SEARCH_QUERY_FAILED",
      message: "Embedding generation is not configured."
    });
  }

  const embedding = (await generateEmbeddings([query])).embeddings[0]?.embedding;

  if (!embedding) {
    throw new SearchError({ code: "SEARCH_QUERY_FAILED" });
  }

  const filters = [
    `notebookId eq '${escapeODataString(notebookId)}'`,
    `userId eq '${escapeODataString(userId)}'`
  ].filter(Boolean);
  const response = await searchFetch<AzureSearchResponse>({
    path: `/indexes/${encodeURIComponent(getSearchIndexName())}/docs/search`,
    method: "POST",
    operation: "query",
    body: {
      search: query,
      top: topK,
      filter: filters.join(" and "),
      select:
        "evidenceSegmentId,notebookId,startSec,endSec,text,rawSource,extractionEngine",
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

  return (response.value ?? [])
    .filter(
      (item) =>
        typeof item.evidenceSegmentId === "string" &&
        item.notebookId === notebookId &&
        typeof item.text === "string"
    )
    .map((item) => ({
      evidenceSegmentId: item.evidenceSegmentId!,
      notebookId,
      startSec: Number(item.startSec ?? 0),
      endSec: Number(item.endSec ?? item.startSec ?? 0),
      text: item.text!,
      score: Number(item["@search.score"] ?? 0),
      source: item.rawSource || item.extractionEngine || "azure-search",
      retrievalMode: "azure_hybrid" as const
    }));
}

export type LocalEvidenceSegment = {
  id: string;
  notebookId: string;
  startSec: number;
  endSec: number;
  text: string;
  sourceType?: string | null;
  extractionEngine?: string | null;
  rawSource?: string | null;
};

export function localLexicalSearchEvidence({
  query,
  segments,
  topK = 8
}: {
  query: string;
  segments: LocalEvidenceSegment[];
  topK?: number;
}): EvidenceSearchHit[] {
  const normalizedQuery = query.trim();
  const queryTerms = getSearchTerms(normalizedQuery);
  const requestedTimestamp = parseTimestamp(normalizedQuery);
  const broadQuery = isBroadRetrievalQuery(normalizedQuery);

  if (queryTerms.length === 0 && requestedTimestamp === null && !broadQuery) {
    return [];
  }

  const lexicalHits = segments
    .map((segment) => {
      const text = segment.text.toLowerCase();
      const scoreFromTerms = queryTerms.reduce((score, term) => {
        const exact = countOccurrences(text, term);
        const partial = exact === 0 && text.includes(term.slice(0, 5)) ? 0.25 : 0;

        return score + exact + partial;
      }, 0);
      const timestampScore =
        requestedTimestamp === null
          ? 0
          : scoreTimestamp(segment, requestedTimestamp);

      return {
        evidenceSegmentId: segment.id,
        notebookId: segment.notebookId,
        startSec: segment.startSec,
        endSec: segment.endSec,
        text: segment.text,
        score: scoreFromTerms + timestampScore,
        source: segment.rawSource || segment.extractionEngine || segment.sourceType || "local",
        retrievalMode: "local_lexical_fallback" as const
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.startSec - b.startSec)
    .slice(0, topK);

  if (!broadQuery || lexicalHits.length >= Math.min(4, topK)) {
    return lexicalHits;
  }

  return mergeHits(
    lexicalHits,
    representativeEvidenceHits({ segments, topK })
  ).slice(0, topK);
}

export function validateRetrievalQuery(query: string) {
  return query.trim().length > 0;
}

function getSearchTerms(query: string) {
  const stopWords = new Set([
    "about",
    "after",
    "again",
    "also",
    "before",
    "being",
    "could",
    "explain",
    "from",
    "have",
    "lecture",
    "main",
    "more",
    "quiz",
    "review",
    "should",
    "summarize",
    "that",
    "the",
    "this",
    "what",
    "when",
    "where",
    "which",
    "with",
    "would"
  ]);

  return Array.from(
    new Set(
      query
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((term) => term.length >= 3 && !stopWords.has(term))
    )
  ).slice(0, 16);
}

export function isBroadRetrievalQuery(query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return false;
  }

  return (
    /^(summari[sz]e|overview|quiz me|test me|explain|what is|what's|what should)/.test(
      normalized
    ) ||
    normalized.includes("main idea") ||
    normalized.includes("main concept") ||
    normalized.includes("what is this lecture about") ||
    normalized.includes("what's this lecture about") ||
    normalized.includes("review before an exam") ||
    normalized.includes("study for an exam") ||
    normalized === "quiz me"
  );
}

function representativeEvidenceHits({
  segments,
  topK
}: {
  segments: LocalEvidenceSegment[];
  topK: number;
}): EvidenceSearchHit[] {
  const earlyWindow = segments.slice(0, Math.max(topK * 4, 12));

  return earlyWindow
    .map((segment, index) => ({
      evidenceSegmentId: segment.id,
      notebookId: segment.notebookId,
      startSec: segment.startSec,
      endSec: segment.endSec,
      text: segment.text,
      score:
        0.5 +
        Math.min(segment.text.length / 300, 2) +
        Math.max(0, 1 - index / Math.max(earlyWindow.length, 1)),
      source: segment.rawSource || segment.extractionEngine || segment.sourceType || "local",
      retrievalMode: "local_lexical_fallback" as const
    }))
    .sort((a, b) => b.score - a.score || a.startSec - b.startSec)
    .slice(0, topK)
    .sort((a, b) => a.startSec - b.startSec);
}

function mergeHits(
  primary: EvidenceSearchHit[],
  fallback: EvidenceSearchHit[]
) {
  const seen = new Set<string>();
  const merged: EvidenceSearchHit[] = [];

  for (const hit of [...primary, ...fallback]) {
    if (seen.has(hit.evidenceSegmentId)) {
      continue;
    }

    seen.add(hit.evidenceSegmentId);
    merged.push(hit);
  }

  return merged.sort((a, b) => b.score - a.score || a.startSec - b.startSec);
}

function countOccurrences(text: string, term: string) {
  let count = 0;
  let index = text.indexOf(term);

  while (index >= 0) {
    count += 1;
    index = text.indexOf(term, index + term.length);
  }

  return count;
}

function scoreTimestamp(segment: LocalEvidenceSegment, timestamp: number) {
  if (timestamp >= segment.startSec && timestamp <= segment.endSec) {
    return 8;
  }

  const distance = Math.min(
    Math.abs(timestamp - segment.startSec),
    Math.abs(timestamp - segment.endSec)
  );

  return distance <= 90 ? Math.max(0.5, 5 - distance / 18) : 0;
}

function parseTimestamp(query: string) {
  const match = query.match(/(?:^|\D)(\d{1,2}:)?(\d{1,2}):(\d{2})(?:\D|$)/);

  if (!match) {
    return null;
  }

  const hours = match[1] ? Number(match[1].replace(":", "")) : 0;
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);

  if ([hours, minutes, seconds].some((value) => !Number.isFinite(value))) {
    return null;
  }

  return hours * 3600 + minutes * 60 + seconds;
}
