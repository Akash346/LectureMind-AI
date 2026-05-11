const DEFAULT_AZURE_OPENAI_API_VERSION = "2024-10-21";
const DEFAULT_AZURE_SEARCH_INDEX_NAME = "lecturemind-evidence-dev";
const DEFAULT_AZURE_OPENAI_EMBEDDING_DIMENSIONS = 1536;
const DEFAULT_AZURE_SPEECH_LANGUAGE = "en-US";

type ServerEnvSnapshot = {
  AZURE_OPENAI_ENDPOINT: string | null;
  AZURE_OPENAI_API_KEY: string | null;
  AZURE_OPENAI_API_VERSION: string;
  AZURE_OPENAI_DEPLOYMENT_FAST: string | null;
  AZURE_OPENAI_DEPLOYMENT_STRONG: string | null;
  AZURE_OPENAI_EMBEDDING_DEPLOYMENT: string | null;
  AZURE_OPENAI_EMBEDDING_DIMENSIONS: number;
  AZURE_SEARCH_ENDPOINT: string | null;
  AZURE_SEARCH_API_KEY: string | null;
  AZURE_SEARCH_INDEX_NAME: string;
  AZURE_SEARCH_SOURCE: AzureSearchConfigSource;
  AZURE_STORAGE_CONNECTION_STRING: string | null;
  AZURE_STORAGE_CONTAINER: string | null;
  AZURE_STORAGE_FACULTY_CONTAINER: string;
  AZURE_SPEECH_KEY: string | null;
  AZURE_SPEECH_REGION: string | null;
  AZURE_SPEECH_LANGUAGE: string;
  FACULTY_SESSION_TTL_MINUTES: number;
  FACULTY_HEARTBEAT_INTERVAL_SECONDS: number;
  FACULTY_SWEEP_SECRET: string | null;
  FACULTY_PRIMARY_MODEL_DEPLOYMENT: string | null;
  FACULTY_AZURE_SEARCH_INDEX_NAME: string;
  MISTRAL_OCR_ENDPOINT: string | null;
  MISTRAL_OCR_API_KEY: string | null;
  MISTRAL_OCR_MODEL: string;
  aliasWarnings: string[];
};

export type AzureSearchConfigSource = {
  endpoint: "AZURE_SEARCH_ENDPOINT" | "AZURE_AI_SEARCH_ENDPOINT" | "missing";
  apiKey: "AZURE_SEARCH_API_KEY" | "AZURE_AI_SEARCH_API_KEY" | "missing";
  indexName: "AZURE_SEARCH_INDEX_NAME" | "AZURE_AI_SEARCH_INDEX" | "default";
};

export type CapabilityStatus = {
  aiChatConfigured: boolean;
  embeddingsConfigured: boolean;
  azureSearchConfigured: boolean;
  speechConfigured: boolean;
  storageConfigured: boolean;
};

let cachedEnv: ServerEnvSnapshot | null = null;
let aliasWarningLogged = false;
let searchConfigLogged = false;

export function getAzureOpenAIConfig() {
  const env = getServerEnv();

  return {
    endpoint: env.AZURE_OPENAI_ENDPOINT,
    apiKey: env.AZURE_OPENAI_API_KEY,
    apiVersion: env.AZURE_OPENAI_API_VERSION,
    fastDeployment: env.AZURE_OPENAI_DEPLOYMENT_FAST,
    strongDeployment: env.AZURE_OPENAI_DEPLOYMENT_STRONG,
    configured: getCapabilityStatus().aiChatConfigured
  };
}

export function getEmbeddingConfig() {
  const env = getServerEnv();

  return {
    endpoint: env.AZURE_OPENAI_ENDPOINT,
    apiKey: env.AZURE_OPENAI_API_KEY,
    apiVersion: env.AZURE_OPENAI_API_VERSION,
    deployment: env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
    dimensions: env.AZURE_OPENAI_EMBEDDING_DIMENSIONS,
    configured: getCapabilityStatus().embeddingsConfigured
  };
}

export function getAzureSearchConfig() {
  const env = getServerEnv();
  const configured = getCapabilityStatus().azureSearchConfigured;
  const config = {
    endpoint: env.AZURE_SEARCH_ENDPOINT,
    apiKey: env.AZURE_SEARCH_API_KEY,
    indexName: env.AZURE_SEARCH_INDEX_NAME,
    configured,
    source: env.AZURE_SEARCH_SOURCE
  };

  logSearchConfig(config);

  return config;
}

export function getAzureSpeechConfig() {
  const env = getServerEnv();

  return {
    key: env.AZURE_SPEECH_KEY,
    region: env.AZURE_SPEECH_REGION,
    language: env.AZURE_SPEECH_LANGUAGE,
    configured: getCapabilityStatus().speechConfigured
  };
}

export function getAzureStorageConfig() {
  const env = getServerEnv();

  return {
    connectionString: env.AZURE_STORAGE_CONNECTION_STRING,
    container: env.AZURE_STORAGE_CONTAINER,
    facultyContainer: env.AZURE_STORAGE_FACULTY_CONTAINER,
    configured: getCapabilityStatus().storageConfigured
  };
}

export function getFacultyConfig() {
  const env = getServerEnv();

  return {
    sessionTtlMinutes: env.FACULTY_SESSION_TTL_MINUTES,
    heartbeatIntervalSeconds: env.FACULTY_HEARTBEAT_INTERVAL_SECONDS,
    sweepSecret: env.FACULTY_SWEEP_SECRET,
    primaryModelDeployment: env.FACULTY_PRIMARY_MODEL_DEPLOYMENT,
    searchIndexName: env.FACULTY_AZURE_SEARCH_INDEX_NAME,
    storageContainer: env.AZURE_STORAGE_FACULTY_CONTAINER,
    mistralOcrEndpoint: env.MISTRAL_OCR_ENDPOINT,
    mistralOcrApiKey: env.MISTRAL_OCR_API_KEY,
    mistralOcrModel: env.MISTRAL_OCR_MODEL
  };
}

export function getCapabilityStatus(): CapabilityStatus {
  const env = getServerEnv();

  return {
    aiChatConfigured: Boolean(
      env.AZURE_OPENAI_ENDPOINT &&
        env.AZURE_OPENAI_API_KEY &&
        (env.AZURE_OPENAI_DEPLOYMENT_FAST ||
          env.AZURE_OPENAI_DEPLOYMENT_STRONG)
    ),
    embeddingsConfigured: Boolean(
      env.AZURE_OPENAI_ENDPOINT &&
        env.AZURE_OPENAI_API_KEY &&
        env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT
    ),
    azureSearchConfigured: Boolean(
      env.AZURE_SEARCH_ENDPOINT && env.AZURE_SEARCH_API_KEY
    ),
    speechConfigured: Boolean(
      env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION
    ),
    storageConfigured: Boolean(
      env.AZURE_STORAGE_CONNECTION_STRING && env.AZURE_STORAGE_CONTAINER
    )
  };
}

export function getServerEnvForDiagnostics() {
  const env = getServerEnv();

  return {
    azureOpenAIEndpointConfigured: Boolean(env.AZURE_OPENAI_ENDPOINT),
    azureOpenAIApiVersion: env.AZURE_OPENAI_API_VERSION,
    azureOpenAIFastDeploymentConfigured: Boolean(
      env.AZURE_OPENAI_DEPLOYMENT_FAST
    ),
    azureOpenAIStrongDeploymentConfigured: Boolean(
      env.AZURE_OPENAI_DEPLOYMENT_STRONG
    ),
    azureOpenAIEmbeddingDeploymentConfigured: Boolean(
      env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT
    ),
    azureOpenAIEmbeddingDimensions: env.AZURE_OPENAI_EMBEDDING_DIMENSIONS,
    azureSearchEndpointConfigured: Boolean(env.AZURE_SEARCH_ENDPOINT),
    azureSearchIndexName: env.AZURE_SEARCH_INDEX_NAME,
    azureSearchIndexEnvSource: env.AZURE_SEARCH_SOURCE.indexName,
    azureStorageConfigured: getCapabilityStatus().storageConfigured,
    azureFacultyStorageContainer: env.AZURE_STORAGE_FACULTY_CONTAINER,
    facultySearchIndexName: env.FACULTY_AZURE_SEARCH_INDEX_NAME,
    facultyPrimaryModelConfigured: Boolean(
      env.FACULTY_PRIMARY_MODEL_DEPLOYMENT ||
        env.AZURE_OPENAI_DEPLOYMENT_STRONG ||
        env.AZURE_OPENAI_DEPLOYMENT_FAST
    ),
    mistralOcrConfigured: Boolean(
      env.MISTRAL_OCR_ENDPOINT && env.MISTRAL_OCR_API_KEY
    ),
    azureSpeechConfigured: getCapabilityStatus().speechConfigured,
    aliasWarnings: env.aliasWarnings
  };
}

export function resetServerEnvForTests() {
  cachedEnv = null;
  aliasWarningLogged = false;
  searchConfigLogged = false;
}

function getServerEnv(): ServerEnvSnapshot {
  if (cachedEnv) {
    return cachedEnv;
  }

  const aliasWarnings: string[] = [];
  const searchEndpoint = resolveEnvValue({
    canonical: "AZURE_SEARCH_ENDPOINT",
    alias: "AZURE_AI_SEARCH_ENDPOINT",
    defaultValue: null,
    aliasWarnings
  });
  const searchApiKey = resolveEnvValue({
    canonical: "AZURE_SEARCH_API_KEY",
    alias: "AZURE_AI_SEARCH_API_KEY",
    defaultValue: null,
    aliasWarnings
  });
  const searchIndexName = resolveEnvValue({
    canonical: "AZURE_SEARCH_INDEX_NAME",
    alias: "AZURE_AI_SEARCH_INDEX",
    defaultValue: DEFAULT_AZURE_SEARCH_INDEX_NAME,
    aliasWarnings
  });

  cachedEnv = {
    AZURE_OPENAI_ENDPOINT: normalizeEndpoint(readEnv("AZURE_OPENAI_ENDPOINT")),
    AZURE_OPENAI_API_KEY: readEnv("AZURE_OPENAI_API_KEY"),
    AZURE_OPENAI_API_VERSION:
      readEnv("AZURE_OPENAI_API_VERSION") ??
      DEFAULT_AZURE_OPENAI_API_VERSION,
    AZURE_OPENAI_DEPLOYMENT_FAST: readEnv("AZURE_OPENAI_DEPLOYMENT_FAST"),
    AZURE_OPENAI_DEPLOYMENT_STRONG: readEnv("AZURE_OPENAI_DEPLOYMENT_STRONG"),
    AZURE_OPENAI_EMBEDDING_DEPLOYMENT: readEnv(
      "AZURE_OPENAI_EMBEDDING_DEPLOYMENT"
    ),
    AZURE_OPENAI_EMBEDDING_DIMENSIONS: readPositiveInteger(
      "AZURE_OPENAI_EMBEDDING_DIMENSIONS",
      DEFAULT_AZURE_OPENAI_EMBEDDING_DIMENSIONS
    ),
    AZURE_SEARCH_ENDPOINT: normalizeEndpoint(searchEndpoint.value),
    AZURE_SEARCH_API_KEY: searchApiKey.value,
    AZURE_SEARCH_INDEX_NAME:
      searchIndexName.value ?? DEFAULT_AZURE_SEARCH_INDEX_NAME,
    AZURE_SEARCH_SOURCE: {
      endpoint: searchEndpoint.source as AzureSearchConfigSource["endpoint"],
      apiKey: searchApiKey.source as AzureSearchConfigSource["apiKey"],
      indexName: searchIndexName.source as AzureSearchConfigSource["indexName"]
    },
    AZURE_STORAGE_CONNECTION_STRING: readEnv("AZURE_STORAGE_CONNECTION_STRING"),
    AZURE_STORAGE_CONTAINER: readEnv("AZURE_STORAGE_CONTAINER"),
    AZURE_STORAGE_FACULTY_CONTAINER:
      readEnv("AZURE_STORAGE_FACULTY_CONTAINER") ?? "faculty-sessions",
    AZURE_SPEECH_KEY: readEnv("AZURE_SPEECH_KEY"),
    AZURE_SPEECH_REGION: readEnv("AZURE_SPEECH_REGION"),
    AZURE_SPEECH_LANGUAGE:
      readEnv("AZURE_SPEECH_LANGUAGE") ?? DEFAULT_AZURE_SPEECH_LANGUAGE,
    FACULTY_SESSION_TTL_MINUTES: readPositiveInteger(
      "FACULTY_SESSION_TTL_MINUTES",
      120
    ),
    FACULTY_HEARTBEAT_INTERVAL_SECONDS: readPositiveInteger(
      "FACULTY_HEARTBEAT_INTERVAL_SECONDS",
      30
    ),
    FACULTY_SWEEP_SECRET: readEnv("FACULTY_SWEEP_SECRET"),
    FACULTY_PRIMARY_MODEL_DEPLOYMENT: readEnv("FACULTY_PRIMARY_MODEL_DEPLOYMENT"),
    FACULTY_AZURE_SEARCH_INDEX_NAME:
      readEnv("FACULTY_AZURE_SEARCH_INDEX_NAME") ??
      "lecturemind-faculty-evidence-dev",
    MISTRAL_OCR_ENDPOINT: normalizeEndpoint(readEnv("MISTRAL_OCR_ENDPOINT")),
    MISTRAL_OCR_API_KEY: readEnv("MISTRAL_OCR_API_KEY"),
    MISTRAL_OCR_MODEL:
      readEnv("MISTRAL_OCR_MODEL") ?? "mistral-document-ai-2512",
    aliasWarnings
  };

  if (aliasWarnings.length > 0 && !aliasWarningLogged) {
    aliasWarningLogged = true;
    console.warn(
      "[env]",
      JSON.stringify({
        event: "deprecated_aliases_used",
        aliases: aliasWarnings
      })
    );
  }

  return cachedEnv;
}

function resolveEnvValue({
  canonical,
  alias,
  defaultValue,
  aliasWarnings
}: {
  canonical: string;
  alias: string;
  defaultValue: string | null;
  aliasWarnings: string[];
}) {
  const canonicalValue = readEnv(canonical);
  const aliasValue = readEnv(alias);

  if (canonicalValue) {
    if (aliasValue && aliasValue !== canonicalValue) {
      aliasWarnings.push(`${canonical}+${alias}:using_${canonical}`);
    }

    return {
      value: canonicalValue,
      source: canonical
    };
  }

  if (aliasValue) {
    aliasWarnings.push(`${alias}->${canonical}`);
    return {
      value: aliasValue,
      source: alias
    };
  }

  return {
    value: defaultValue,
    source: defaultValue === null ? "missing" : "default"
  };
}

function readEnv(key: string) {
  const value = process.env[key]?.trim();

  return value ? value : null;
}

function normalizeEndpoint(value: string | null) {
  if (!value) {
    return null;
  }

  return value.replace(/\/+$/, "");
}

function readPositiveInteger(key: string, fallback: number) {
  const parsed = Number(readEnv(key));

  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function logSearchConfig(config: {
  endpoint: string | null;
  apiKey: string | null;
  indexName: string;
  configured: boolean;
  source: AzureSearchConfigSource;
}) {
  if (searchConfigLogged) {
    return;
  }

  searchConfigLogged = true;
  console.info(
    "[search-config]",
    JSON.stringify({
      endpointPresent: Boolean(config.endpoint),
      apiKeyPresent: Boolean(config.apiKey),
      indexName: config.indexName,
      indexEnvSource: config.source.indexName,
      configured: config.configured
    })
  );
}
