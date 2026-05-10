import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_SEARCH_INDEX_NAME = "lecturemind-evidence-dev";
const DEFAULT_OPENAI_API_VERSION = "2024-10-21";
const DEFAULT_EMBEDDING_DIMENSIONS = 1536;

loadDotEnvOnly();

const search = resolveSearchConfig();
const coreRequired = [
  "DATABASE_URL",
  "NEXTAUTH_SECRET",
  "NEXTAUTH_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET"
];
const missingCore = coreRequired.filter((key) => !readEnv(key));
const capabilities = {
  aiChatConfigured: Boolean(
    readEnv("AZURE_OPENAI_ENDPOINT") &&
      readEnv("AZURE_OPENAI_API_KEY") &&
      (readEnv("AZURE_OPENAI_DEPLOYMENT_FAST") ||
        readEnv("AZURE_OPENAI_DEPLOYMENT_STRONG"))
  ),
  embeddingsConfigured: Boolean(
    readEnv("AZURE_OPENAI_ENDPOINT") &&
      readEnv("AZURE_OPENAI_API_KEY") &&
      readEnv("AZURE_OPENAI_EMBEDDING_DEPLOYMENT")
  ),
  azureSearchConfigured: search.configured,
  speechConfigured: Boolean(readEnv("AZURE_SPEECH_KEY") && readEnv("AZURE_SPEECH_REGION")),
  storageConfigured: Boolean(
    readEnv("AZURE_STORAGE_CONNECTION_STRING") &&
      readEnv("AZURE_STORAGE_CONTAINER")
  )
};

console.log("Environment audit");
console.log(`Source .env present: ${existsSync(resolve(process.cwd(), ".env"))}`);
console.log(
  `.env.example present: ${existsSync(
    resolve(process.cwd(), ".env.example")
  )} (documentation only; not loaded)`
);
console.log(`Core app configured: ${missingCore.length === 0}`);
console.log(`AI chat configured: ${capabilities.aiChatConfigured}`);
console.log(`Embeddings configured: ${capabilities.embeddingsConfigured}`);
console.log(`Azure Search configured: ${capabilities.azureSearchConfigured}`);
console.log(`Azure Search endpoint present: ${Boolean(search.endpoint)}`);
console.log(`Azure Search key present: ${Boolean(search.apiKey)}`);
console.log(`Azure Search index: ${search.indexName}`);
console.log(`Index env source: ${search.source.indexName}`);
console.log(`Speech configured: ${capabilities.speechConfigured}`);
console.log(`Storage configured: ${capabilities.storageConfigured}`);
console.log(
  `OpenAI API version: ${readEnv("AZURE_OPENAI_API_VERSION") ?? DEFAULT_OPENAI_API_VERSION}`
);
console.log(
  `Embedding dimensions: ${readPositiveInteger(
    "AZURE_OPENAI_EMBEDDING_DIMENSIONS",
    DEFAULT_EMBEDDING_DIMENSIONS
  )}`
);

printSearchWarnings(search);

if (missingCore.length > 0) {
  console.error("Missing required core environment variables:");
  for (const key of missingCore) {
    console.error(`- ${key}`);
  }
  process.exit(1);
}

if (!readEnv("DATABASE_URL")?.startsWith("postgresql://")) {
  console.error("DATABASE_URL must be a PostgreSQL connection string.");
  process.exit(1);
}

console.log("Environment check complete.");

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

function printSearchWarnings(search) {
  for (const warning of search.warnings) {
    console.warn(warning);
  }
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
