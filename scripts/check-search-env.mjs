import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_SEARCH_INDEX_NAME = "lecturemind-evidence-dev";
const DEFAULT_SEARCH_API_VERSION = "2024-07-01";
const DEFAULT_OPENAI_API_VERSION = "2024-10-21";
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;
const VECTOR_PROFILE_NAME = "evidence-vector-profile";
const VECTOR_ALGORITHM_NAME = "evidence-hnsw";

loadDotEnvOnly();

const search = resolveSearchConfig();
const embeddings = resolveEmbeddingConfig();
const forceRecreate = process.env.FORCE_RECREATE_SEARCH_INDEX === "true";

console.log(`Azure Search configured: ${search.configured}`);
console.log(`Azure Search endpoint present: ${Boolean(search.endpoint)}`);
console.log(`Azure Search key present: ${Boolean(search.apiKey)}`);
console.log(`Azure Search index: ${search.indexName}`);
console.log(`Index env source: ${search.source.indexName}`);
console.log(`Embeddings configured: ${embeddings.configured}`);
console.log(`Embedding dimensions expected: ${embeddings.dimensions}`);
console.log(`Force recreate search index: ${forceRecreate}`);
console.log(".env.example loaded: false");

for (const warning of search.warnings) {
  console.warn(warning);
}

if (!search.configured) {
  console.error("Azure Search endpoint/API key are missing.");
  process.exit(1);
}

if (!embeddings.configured) {
  console.error("Azure OpenAI embedding config is missing.");
  process.exit(1);
}

try {
  const actualEmbeddingDimensions = await getActualEmbeddingDimensions(embeddings);
  const dimensionOk = actualEmbeddingDimensions === embeddings.dimensions;

  console.log(`Embedding dimensions actual: ${actualEmbeddingDimensions}`);
  console.log(
    `Embedding dimension check: expected ${embeddings.dimensions}, actual ${actualEmbeddingDimensions}, ok ${dimensionOk}`
  );

  let existing = await getIndex({
    endpoint: search.endpoint,
    apiKey: search.apiKey,
    indexName: search.indexName
  });

  if (forceRecreate) {
    assertForceRecreateAllowed();
    console.warn(
      `FORCE_RECREATE_SEARCH_INDEX=true; deleting and recreating ${search.indexName}.`
    );

    if (existing) {
      await deleteIndex({
        endpoint: search.endpoint,
        apiKey: search.apiKey,
        indexName: search.indexName
      });
    }

    await createIndex({
      endpoint: search.endpoint,
      apiKey: search.apiKey,
      indexName: search.indexName,
      dimensions: actualEmbeddingDimensions
    });
    existing = await getIndex({
      endpoint: search.endpoint,
      apiKey: search.apiKey,
      indexName: search.indexName
    });
    console.log("Index recreated: true");
  } else if (existing) {
    const mismatches = getIndexMismatches(existing, actualEmbeddingDimensions);

    if (mismatches.length > 0) {
      throw new Error(`SEARCH_INDEX_SCHEMA_MISMATCH: ${mismatches.join(" ")}`);
    }

    console.log("Index exists: true");
    console.log("Index schema valid: true");
  } else {
    await createIndex({
      endpoint: search.endpoint,
      apiKey: search.apiKey,
      indexName: search.indexName,
      dimensions: actualEmbeddingDimensions
    });
    existing = await getIndex({
      endpoint: search.endpoint,
      apiKey: search.apiKey,
      indexName: search.indexName
    });
    console.log("Index existed: false");
    console.log("Index created: true");
  }

  const finalMismatches = getIndexMismatches(existing, actualEmbeddingDimensions);

  if (finalMismatches.length > 0) {
    throw new Error(`SEARCH_INDEX_SCHEMA_MISMATCH: ${finalMismatches.join(" ")}`);
  }

  console.log("Can connect to Search: true");
  console.log("Can read or create index: true");
  console.log("Vector field exists: true");
  console.log(`Vector dimensions match actual embedding length: ${actualEmbeddingDimensions}`);
  console.log("Required filterable fields exist: true");
} catch (error) {
  console.error(
    `Azure Search check failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
  process.exit(1);
}

function loadDotEnvOnly() {
  const envPath = resolve(process.cwd(), ".env");

  if (!existsSync(envPath)) {
    return;
  }

  const file = readFileSync(envPath, "utf8");

  for (const line of file.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split("=");
    const rawValue = valueParts.join("=").trim();
    process.env[key] ??= rawValue.replace(/^["']|["']$/g, "");
  }
}

function resolveSearchConfig() {
  const endpoint = resolveValue({
    canonical: "AZURE_SEARCH_ENDPOINT",
    alias: "AZURE_AI_SEARCH_ENDPOINT",
    defaultValue: null
  });
  const apiKey = resolveValue({
    canonical: "AZURE_SEARCH_API_KEY",
    alias: "AZURE_AI_SEARCH_API_KEY",
    defaultValue: null
  });
  const indexName = resolveValue({
    canonical: "AZURE_SEARCH_INDEX_NAME",
    alias: "AZURE_AI_SEARCH_INDEX",
    defaultValue: DEFAULT_SEARCH_INDEX_NAME
  });

  return {
    endpoint: normalizeEndpoint(endpoint.value),
    apiKey: apiKey.value,
    indexName: indexName.value ?? DEFAULT_SEARCH_INDEX_NAME,
    configured: Boolean(endpoint.value && apiKey.value),
    source: {
      endpoint: endpoint.source,
      apiKey: apiKey.source,
      indexName: indexName.source
    },
    warnings: [...endpoint.warnings, ...apiKey.warnings, ...indexName.warnings]
  };
}

function resolveEmbeddingConfig() {
  return {
    endpoint: normalizeEndpoint(readEnv("AZURE_OPENAI_ENDPOINT")),
    apiKey: readEnv("AZURE_OPENAI_API_KEY"),
    apiVersion: readEnv("AZURE_OPENAI_API_VERSION") ?? DEFAULT_OPENAI_API_VERSION,
    deployment: readEnv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT"),
    dimensions: readPositiveInteger(
      "AZURE_OPENAI_EMBEDDING_DIMENSIONS",
      DEFAULT_EMBEDDING_DIMENSIONS
    ),
    configured: Boolean(
      readEnv("AZURE_OPENAI_ENDPOINT") &&
        readEnv("AZURE_OPENAI_API_KEY") &&
        readEnv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT")
    )
  };
}

function resolveValue({ canonical, alias, defaultValue }) {
  const canonicalValue = readEnv(canonical);
  const aliasValue = readEnv(alias);
  const warnings = [];

  if (canonicalValue) {
    if (aliasValue && aliasValue !== canonicalValue) {
      warnings.push(
        `Both ${canonical} and ${alias} are set. Using ${canonical}.`
      );
    }

    return { value: canonicalValue, source: canonical, warnings };
  }

  if (aliasValue) {
    warnings.push(`Using legacy alias ${alias}. Consider renaming to ${canonical} later.`);
    return { value: aliasValue, source: alias, warnings };
  }

  return {
    value: defaultValue,
    source: defaultValue === null ? "missing" : "default",
    warnings
  };
}

async function getActualEmbeddingDimensions(config) {
  const base = config.endpoint.endsWith("/")
    ? config.endpoint.slice(0, -1)
    : config.endpoint;
  const url = `${base}/openai/deployments/${encodeURIComponent(
    config.deployment
  )}/embeddings?api-version=${encodeURIComponent(config.apiVersion)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "api-key": config.apiKey
    },
    body: JSON.stringify({
      input: ["LectureMind embedding dimension check"],
      dimensions: config.dimensions
    })
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `Embedding dimension check failed with HTTP ${response.status}: ${safeProviderMessage(text)}`
    );
  }

  const json = JSON.parse(text);
  const embedding = json?.data?.[0]?.embedding;

  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("Embedding dimension check returned no vector.");
  }

  return embedding.length;
}

async function getIndex({ endpoint, apiKey, indexName }) {
  const response = await searchFetch({
    endpoint,
    apiKey,
    path: `/indexes/${encodeURIComponent(indexName)}`,
    method: "GET"
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`GET index failed with HTTP ${response.status}: ${response.text}`);
  }

  return response.json;
}

async function createIndex({ endpoint, apiKey, indexName, dimensions }) {
  const response = await searchFetch({
    endpoint,
    apiKey,
    path: `/indexes/${encodeURIComponent(indexName)}`,
    method: "PUT",
    body: buildSchema(indexName, dimensions)
  });

  if (!response.ok) {
    throw new Error(`PUT index failed with HTTP ${response.status}: ${response.text}`);
  }
}

async function deleteIndex({ endpoint, apiKey, indexName }) {
  const response = await searchFetch({
    endpoint,
    apiKey,
    path: `/indexes/${encodeURIComponent(indexName)}`,
    method: "DELETE"
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`DELETE index failed with HTTP ${response.status}: ${response.text}`);
  }
}

async function searchFetch({ endpoint, apiKey, path, method, body }) {
  const base = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
  const separator = path.includes("?") ? "&" : "?";
  const url = `${base}${path}${separator}api-version=${encodeURIComponent(
    DEFAULT_SEARCH_API_VERSION
  )}`;
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      "api-key": apiKey
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  let json = {};

  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = {};
  }

  return {
    ok: response.ok,
    status: response.status,
    text: safeProviderMessage(text),
    json
  };
}

function getIndexMismatches(index, dimensions) {
  const mismatches = [];
  const fields = new Map((index?.fields ?? []).map((field) => [field.name, field]));
  const required = [
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

  for (const expected of required) {
    const field = fields.get(expected.name);

    if (!field) {
      mismatches.push(`Missing required field ${expected.name}.`);
      continue;
    }

    if (expected.type && field.type !== expected.type) {
      mismatches.push(
        `Field ${expected.name} has type ${field.type ?? "unknown"}, expected ${expected.type}.`
      );
    }

    if (expected.key !== undefined && field.key !== expected.key) {
      mismatches.push(
        `Field ${expected.name} key=${String(field.key)}, expected ${String(expected.key)}.`
      );
    }

    if (expected.searchable !== undefined && field.searchable !== expected.searchable) {
      mismatches.push(
        `Field ${expected.name} searchable=${String(
          field.searchable
        )}, expected ${String(expected.searchable)}.`
      );
    }

    if (expected.filterable !== undefined && field.filterable !== expected.filterable) {
      mismatches.push(
        `Field ${expected.name} filterable=${String(
          field.filterable
        )}, expected ${String(expected.filterable)}.`
      );
    }
  }

  const embeddingField = fields.get("embedding");
  const vectorDimensions =
    embeddingField?.dimensions ?? embeddingField?.vectorSearchDimensions;

  if (vectorDimensions !== dimensions) {
    mismatches.push(
      `Field embedding dimensions=${String(vectorDimensions ?? "unknown")}, expected ${dimensions}.`
    );
  }

  const profileName =
    embeddingField?.vectorSearchProfile ?? embeddingField?.vectorSearchProfileName;

  if (!profileName) {
    mismatches.push("Field embedding is missing a vector search profile.");
  } else {
    const profile = (index?.vectorSearch?.profiles ?? []).find(
      (item) => item.name === profileName
    );

    if (!profile) {
      mismatches.push(`Vector profile ${profileName} is missing.`);
    } else {
      const algorithmName =
        profile.algorithm ?? profile.algorithmConfigurationName ?? null;
      const algorithm = (index?.vectorSearch?.algorithms ?? []).find(
        (item) => item.name === algorithmName
      );

      if (!algorithm) {
        mismatches.push(
          `Vector profile ${profileName} references missing algorithm ${String(
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

function buildSchema(indexName, dimensions) {
  return {
    name: indexName,
    fields: [
      { name: "id", type: "Edm.String", key: true, filterable: true },
      { name: "notebookId", type: "Edm.String", filterable: true },
      { name: "userId", type: "Edm.String", filterable: true },
      { name: "evidenceSegmentId", type: "Edm.String", filterable: true },
      { name: "lectureTitle", type: "Edm.String", searchable: true },
      { name: "videoId", type: "Edm.String", filterable: true },
      { name: "language", type: "Edm.String", filterable: true },
      { name: "startSec", type: "Edm.Double", filterable: true, sortable: true },
      { name: "endSec", type: "Edm.Double", filterable: true, sortable: true },
      { name: "text", type: "Edm.String", searchable: true },
      { name: "extractionEngine", type: "Edm.String", filterable: true },
      { name: "rawSource", type: "Edm.String", filterable: true },
      { name: "createdAt", type: "Edm.DateTimeOffset", filterable: true, sortable: true },
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

function assertForceRecreateAllowed() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "FORCE_RECREATE_SEARCH_INDEX is not allowed when NODE_ENV=production."
    );
  }
}

function safeProviderMessage(text) {
  try {
    const parsed = JSON.parse(text);
    const message = parsed?.error?.message;

    if (typeof message === "string") {
      return message.replace(/\s+/g, " ").trim().slice(0, 500);
    }
  } catch {
    // Fall through to plain text sanitization.
  }

  return text.replace(/\s+/g, " ").trim().slice(0, 500);
}

function readEnv(key) {
  const value = process.env[key]?.trim();

  return value ? value : null;
}

function normalizeEndpoint(value) {
  return value ? value.replace(/\/+$/, "") : null;
}

function readPositiveInteger(key, fallback) {
  const parsed = Number(readEnv(key));

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}
