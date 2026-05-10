import { getExpectedEmbeddingDimensions } from "@/lib/ai/embeddings";
import {
  getSearchIndexName,
  searchFetch,
  SearchError
} from "@/lib/search/search-client";

type SearchIndexField = {
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
};

type SearchIndexDefinition = {
  name?: string;
  fields?: SearchIndexField[];
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

export type EnsureEvidenceIndexResult = {
  indexName: string;
  dimensions: number;
  created: boolean;
  recreated: boolean;
  reused: boolean;
  mismatches: string[];
};

const VECTOR_PROFILE_NAME = "evidence-vector-profile";
const VECTOR_ALGORITHM_NAME = "evidence-hnsw";

const REQUIRED_FIELD_CHECKS: Array<{
  name: string;
  type?: string;
  key?: boolean;
  searchable?: boolean;
  filterable?: boolean;
}> = [
  { name: "id", type: "Edm.String", key: true, filterable: true },
  { name: "notebookId", type: "Edm.String", filterable: true },
  { name: "userId", type: "Edm.String", filterable: true },
  { name: "evidenceSegmentId", type: "Edm.String", filterable: true },
  { name: "lectureTitle", type: "Edm.String", searchable: true },
  { name: "videoId", type: "Edm.String", filterable: true },
  { name: "language", type: "Edm.String", filterable: true },
  { name: "startSec", type: "Edm.Double" },
  { name: "endSec", type: "Edm.Double" },
  { name: "text", type: "Edm.String", searchable: true },
  { name: "extractionEngine", type: "Edm.String", filterable: true },
  { name: "rawSource", type: "Edm.String", filterable: true },
  { name: "createdAt", type: "Edm.DateTimeOffset" },
  { name: "embedding", type: "Collection(Edm.Single)", searchable: true }
];

export function buildEvidenceIndexSchema(
  dimensions = getExpectedEmbeddingDimensions()
) {
  return {
    name: getSearchIndexName(),
    fields: [
      { name: "id", type: "Edm.String", key: true, filterable: true },
      {
        name: "notebookId",
        type: "Edm.String",
        filterable: true,
        facetable: false
      },
      {
        name: "userId",
        type: "Edm.String",
        filterable: true,
        facetable: false
      },
      {
        name: "evidenceSegmentId",
        type: "Edm.String",
        filterable: true
      },
      {
        name: "lectureTitle",
        type: "Edm.String",
        searchable: true,
        filterable: false
      },
      {
        name: "videoId",
        type: "Edm.String",
        filterable: true,
        searchable: false
      },
      {
        name: "language",
        type: "Edm.String",
        filterable: true,
        searchable: false
      },
      {
        name: "startSec",
        type: "Edm.Double",
        filterable: true,
        sortable: true
      },
      {
        name: "endSec",
        type: "Edm.Double",
        filterable: true,
        sortable: true
      },
      {
        name: "text",
        type: "Edm.String",
        searchable: true,
        filterable: false
      },
      {
        name: "extractionEngine",
        type: "Edm.String",
        filterable: true,
        searchable: false
      },
      {
        name: "rawSource",
        type: "Edm.String",
        filterable: true,
        searchable: false
      },
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
        vectorSearchProfile: VECTOR_PROFILE_NAME
      }
    ],
    vectorSearch: {
      algorithms: [
        {
          name: VECTOR_ALGORITHM_NAME,
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
          name: VECTOR_PROFILE_NAME,
          algorithm: VECTOR_ALGORITHM_NAME
        }
      ]
    }
  };
}

export async function ensureEvidenceIndex(
  dimensions?: number
): Promise<EnsureEvidenceIndexResult> {
  const expectedDimensions = dimensions ?? getExpectedEmbeddingDimensions();
  const schema = buildEvidenceIndexSchema(expectedDimensions);
  const forceRecreate = isForceRecreateSearchIndexEnabled();

  try {
    const existing = await searchFetch<SearchIndexDefinition>({
      path: `/indexes/${encodeURIComponent(schema.name)}`,
      method: "GET",
      operation: "index"
    });

    if (forceRecreate) {
      assertForceRecreateAllowed(schema.name);
      console.warn(
        "[index] force_recreate_search_index",
        JSON.stringify({
          indexName: schema.name,
          nodeEnv: process.env.NODE_ENV ?? "development"
        })
      );
      await recreateEvidenceIndex(schema);

      return {
        indexName: schema.name,
        dimensions: expectedDimensions,
        created: true,
        recreated: true,
        reused: false,
        mismatches: []
      };
    }

    const mismatches = getEvidenceIndexMismatches(existing, expectedDimensions);

    if (mismatches.length > 0) {
      throwInvalidIndex(mismatches);
    }

    return {
      indexName: schema.name,
      dimensions: expectedDimensions,
      created: false,
      recreated: false,
      reused: true,
      mismatches: []
    };
  } catch (error) {
    if (error instanceof SearchError && error.statusCode === 404) {
      await searchFetch({
        path: `/indexes/${encodeURIComponent(schema.name)}`,
        method: "PUT",
        operation: "index",
        body: schema
      });

      return {
        indexName: schema.name,
        dimensions: expectedDimensions,
        created: true,
        recreated: false,
        reused: false,
        mismatches: []
      };
    }

    throw error;
  }
}

export function validateEvidenceIndex(
  index: SearchIndexDefinition,
  expectedDimensions = getExpectedEmbeddingDimensions()
) {
  const mismatches = getEvidenceIndexMismatches(index, expectedDimensions);

  if (mismatches.length > 0) {
    throwInvalidIndex(mismatches);
  }
}

export function getEvidenceIndexMismatches(
  index: SearchIndexDefinition,
  expectedDimensions = getExpectedEmbeddingDimensions()
) {
  const mismatches: string[] = [];
  const fields = new Map((index.fields ?? []).map((field) => [field.name, field]));

  for (const required of REQUIRED_FIELD_CHECKS) {
    const field = fields.get(required.name);

    if (!field) {
      mismatches.push(`Missing required field ${required.name}.`);
      continue;
    }

    if (required.type && field.type !== required.type) {
      mismatches.push(
        `Field ${required.name} has type ${field.type ?? "unknown"}, expected ${required.type}.`
      );
    }

    if (required.key !== undefined && field.key !== required.key) {
      mismatches.push(
        `Field ${required.name} key=${String(field.key)}, expected ${String(required.key)}.`
      );
    }

    if (
      required.searchable !== undefined &&
      field.searchable !== required.searchable
    ) {
      mismatches.push(
        `Field ${required.name} searchable=${String(
          field.searchable
        )}, expected ${String(required.searchable)}.`
      );
    }

    if (
      required.filterable !== undefined &&
      field.filterable !== required.filterable
    ) {
      mismatches.push(
        `Field ${required.name} filterable=${String(
          field.filterable
        )}, expected ${String(required.filterable)}.`
      );
    }
  }

  const embeddingField = fields.get("embedding");
  const embeddingDimensions = getVectorDimensions(embeddingField);

  if (embeddingDimensions !== expectedDimensions) {
    mismatches.push(
      `Field embedding dimensions=${String(
        embeddingDimensions ?? "unknown"
      )}, expected ${expectedDimensions}.`
    );
  }

  const vectorProfileName = getVectorProfileName(embeddingField);

  if (!vectorProfileName) {
    mismatches.push("Field embedding is missing a vector search profile.");
  } else {
    const profile = (index.vectorSearch?.profiles ?? []).find(
      (item) => item.name === vectorProfileName
    );

    if (!profile) {
      mismatches.push(
        `Vector profile ${vectorProfileName} is missing from vectorSearch.profiles.`
      );
    } else {
      const algorithmName =
        profile.algorithm ?? profile.algorithmConfigurationName ?? null;
      const algorithm = (index.vectorSearch?.algorithms ?? []).find(
        (item) => item.name === algorithmName
      );

      if (!algorithm) {
        mismatches.push(
          `Vector profile ${vectorProfileName} references missing algorithm ${String(
            algorithmName
          )}.`
        );
      } else if (algorithm.kind !== "hnsw") {
        mismatches.push(
          `Vector algorithm ${algorithm.name ?? "unknown"} has kind ${String(
            algorithm.kind
          )}, expected hnsw.`
        );
      }
    }
  }

  return mismatches;
}

function getVectorDimensions(field?: SearchIndexField) {
  return field?.dimensions ?? field?.vectorSearchDimensions;
}

function getVectorProfileName(field?: SearchIndexField) {
  return field?.vectorSearchProfile ?? field?.vectorSearchProfileName;
}

async function recreateEvidenceIndex(schema: ReturnType<typeof buildEvidenceIndexSchema>) {
  await searchFetch({
    path: `/indexes/${encodeURIComponent(schema.name)}`,
    method: "DELETE",
    operation: "index"
  });
  await searchFetch({
    path: `/indexes/${encodeURIComponent(schema.name)}`,
    method: "PUT",
    operation: "index",
    body: schema
  });
}

function isForceRecreateSearchIndexEnabled() {
  return process.env.FORCE_RECREATE_SEARCH_INDEX === "true";
}

function assertForceRecreateAllowed(indexName: string) {
  if (process.env.NODE_ENV === "production") {
    throw new SearchError({
      code: "SEARCH_INDEX_SCHEMA_MISMATCH",
      message:
        "FORCE_RECREATE_SEARCH_INDEX is not allowed when NODE_ENV=production.",
      statusCode: 409,
      providerCode: "SEARCH_INDEX_SCHEMA_MISMATCH"
    });
  }

  if (!indexName.trim()) {
    throw new SearchError({
      code: "SEARCH_INDEX_SCHEMA_MISMATCH",
      message: "Search index name is empty.",
      statusCode: 409,
      providerCode: "SEARCH_INDEX_SCHEMA_MISMATCH"
    });
  }
}

function throwInvalidIndex(mismatches: string[]): never {
  throw new SearchError({
    code: "SEARCH_INDEX_SCHEMA_MISMATCH",
    message: `SEARCH_INDEX_SCHEMA_MISMATCH: ${mismatches.join(" ")}`,
    statusCode: 409,
    providerCode: "SEARCH_INDEX_SCHEMA_MISMATCH"
  });
}
