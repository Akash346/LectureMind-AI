import { getEmbeddingConfig } from "@/lib/config/server-env";

const DEFAULT_API_VERSION = "2024-10-21";
const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 2;
const DEFAULT_BATCH_SIZE = 16;

export type EmbeddingErrorCode =
  | "EMBEDDING_NOT_CONFIGURED"
  | "EMBEDDING_RATE_LIMITED"
  | "EMBEDDING_TIMEOUT"
  | "EMBEDDING_BAD_RESPONSE"
  | "EMBEDDING_UNKNOWN";

export class EmbeddingError extends Error {
  readonly code: EmbeddingErrorCode;
  readonly safeMessage: string;
  readonly statusCode?: number;
  readonly providerCode?: string;
  readonly requestId?: string;
  readonly expectedDimensions?: number;
  readonly actualDimensions?: number;

  constructor({
    code,
    message,
    statusCode,
    providerCode,
    requestId,
    expectedDimensions,
    actualDimensions
  }: {
    code: EmbeddingErrorCode;
    message?: string;
    statusCode?: number;
    providerCode?: string;
    requestId?: string;
    expectedDimensions?: number;
    actualDimensions?: number;
  }) {
    const safeMessage = sanitizeMessage(message ?? embeddingErrorMessage(code));

    super(safeMessage);
    this.name = "EmbeddingError";
    this.code = code;
    this.safeMessage = safeMessage;
    this.statusCode = statusCode;
    this.providerCode = providerCode;
    this.requestId = requestId;
    this.expectedDimensions = expectedDimensions;
    this.actualDimensions = actualDimensions;
  }
}

export type EmbeddingResult = {
  embedding: number[];
  index: number;
};

type AzureEmbeddingResponse = {
  data?: Array<{
    index?: number;
    embedding?: number[];
  }>;
  model?: string;
  usage?: unknown;
};

export function isEmbeddingConfigured() {
  const config = getEmbeddingConfig();

  return Boolean(
    config.endpoint && config.apiKey && config.deployment
  );
}

export function getEmbeddingDeployment() {
  return getEmbeddingConfig().deployment;
}

export function getExpectedEmbeddingDimensions() {
  return getEmbeddingConfig().dimensions;
}

export async function generateEmbeddings(
  inputs: string[],
  options: {
    timeoutMs?: number;
    dimensions?: number;
    expectedDimensions?: number;
    skipDimensionValidation?: boolean;
  } = {}
) {
  const config = getEmbeddingConfig();
  const endpoint = config.endpoint;
  const apiKey = config.apiKey;
  const deployment = config.deployment;
  const requestedDimensions = normalizeDimensions(
    options.dimensions ?? config.dimensions
  );

  if (!endpoint || !apiKey || !deployment) {
    throw new EmbeddingError({ code: "EMBEDDING_NOT_CONFIGURED" });
  }

  const cleanedInputs = inputs.map((input) => input.trim()).filter(Boolean);

  if (cleanedInputs.length === 0) {
    return {
      embeddings: [],
      deployment,
      model: deployment,
      usage: null
    };
  }

  const url = buildAzureEmbeddingUrl(endpoint, deployment);
  const response = await retryEmbeddingFetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "api-key": apiKey
    },
    body: JSON.stringify({
      input: cleanedInputs,
      ...(requestedDimensions ? { dimensions: requestedDimensions } : {})
    }),
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  });
  const raw = (await response.json()) as AzureEmbeddingResponse;
  const data = raw.data ?? [];

  if (data.length !== cleanedInputs.length) {
    throw new EmbeddingError({ code: "EMBEDDING_BAD_RESPONSE" });
  }

  const embeddings = data
    .map((item, index) => ({
      index: typeof item.index === "number" ? item.index : index,
      embedding: Array.isArray(item.embedding) ? item.embedding : []
    }))
    .sort((a, b) => a.index - b.index);

  if (
    embeddings.some(
      (item) =>
        item.embedding.length === 0 ||
        item.embedding.some((value) => !Number.isFinite(value))
    )
  ) {
    throw new EmbeddingError({ code: "EMBEDDING_BAD_RESPONSE" });
  }

  const expectedDimensions =
    options.expectedDimensions ??
    requestedDimensions ??
    getExpectedEmbeddingDimensions();
  const mismatchedEmbedding = embeddings.find(
    (item) => item.embedding.length !== expectedDimensions
  );

  if (!options.skipDimensionValidation && mismatchedEmbedding) {
    throw new EmbeddingError({
      code: "EMBEDDING_BAD_RESPONSE",
      message: `Embedding dimensions were ${mismatchedEmbedding.embedding.length}, expected ${expectedDimensions}.`,
      expectedDimensions,
      actualDimensions: mismatchedEmbedding.embedding.length
    });
  }

  return {
    embeddings,
    deployment,
    model: raw.model ?? deployment,
    usage: raw.usage ?? null
  };
}

export async function generateEmbeddingsInBatches(
  inputs: string[],
  options: {
    batchSize?: number;
    onBatch?: (result: {
      batchStart: number;
      embeddings: EmbeddingResult[];
      deployment: string;
      model: string;
    }) => Promise<void>;
  } = {}
) {
  const batchSize = Math.max(1, options.batchSize ?? DEFAULT_BATCH_SIZE);
  const results: EmbeddingResult[] = [];
  let deployment = getEmbeddingDeployment() ?? "";
  let model = deployment;

  for (let batchStart = 0; batchStart < inputs.length; batchStart += batchSize) {
    const batchInputs = inputs.slice(batchStart, batchStart + batchSize);
    const batch = await generateEmbeddings(batchInputs);
    deployment = batch.deployment;
    model = batch.model;
    const shifted = batch.embeddings.map((item) => ({
      index: batchStart + item.index,
      embedding: item.embedding
    }));

    results.push(...shifted);
    await options.onBatch?.({
      batchStart,
      embeddings: shifted,
      deployment,
      model
    });
  }

  return {
    embeddings: results.sort((a, b) => a.index - b.index),
    deployment,
    model
  };
}

export function normalizeEmbeddingError(error: unknown): EmbeddingError {
  if (error instanceof EmbeddingError) {
    return error;
  }

  if (error instanceof Error) {
    return new EmbeddingError({
      code: "EMBEDDING_UNKNOWN",
      message: error.message
    });
  }

  return new EmbeddingError({ code: "EMBEDDING_UNKNOWN" });
}

function buildAzureEmbeddingUrl(endpoint: string, deployment: string) {
  const base = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
  const apiVersion = getEmbeddingConfig().apiVersion || DEFAULT_API_VERSION;

  return `${base}/openai/deployments/${encodeURIComponent(
    deployment
  )}/embeddings?api-version=${encodeURIComponent(apiVersion)}`;
}

async function retryEmbeddingFetch(
  url: string,
  init: RequestInit & { timeoutMs: number }
) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), init.timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        signal: controller.signal
      });

      if (response.status === 429) {
        lastError = new EmbeddingError({
          code: "EMBEDDING_RATE_LIMITED",
          statusCode: response.status
        });
      } else if (response.status === 408 || response.status === 504) {
        lastError = new EmbeddingError({
          code: "EMBEDDING_TIMEOUT",
          statusCode: response.status
        });
      } else if (!response.ok) {
        const provider = await parseProviderError(response);
        throw new EmbeddingError({
          code: "EMBEDDING_BAD_RESPONSE",
          message: provider.message,
          statusCode: response.status,
          providerCode: provider.code,
          requestId: provider.requestId
        });
      } else {
        return response;
      }
    } catch (error) {
      lastError = mapFetchError(error);
    } finally {
      clearTimeout(timeout);
    }

    await sleep(300 * 2 ** attempt);
  }

  throw lastError instanceof EmbeddingError
    ? lastError
    : new EmbeddingError({ code: "EMBEDDING_UNKNOWN" });
}

async function parseProviderError(response: Response) {
  const text = await response.text();
  const requestId =
    response.headers.get("x-ms-request-id") ??
    response.headers.get("request-id") ??
    response.headers.get("apim-request-id") ??
    undefined;

  try {
    const parsed = JSON.parse(text) as {
      error?: {
        code?: unknown;
        message?: unknown;
      };
    };

    return {
      code:
        typeof parsed.error?.code === "string" ? parsed.error.code : undefined,
      message:
        typeof parsed.error?.message === "string"
          ? parsed.error.message
          : text.slice(0, 500),
      requestId
    };
  } catch {
    return {
      code: undefined,
      message: text.slice(0, 500),
      requestId
    };
  }
}

function mapFetchError(error: unknown) {
  if (error instanceof EmbeddingError) {
    return error;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return new EmbeddingError({ code: "EMBEDDING_TIMEOUT" });
  }

  if (error instanceof Error && error.name === "AbortError") {
    return new EmbeddingError({ code: "EMBEDDING_TIMEOUT" });
  }

  return new EmbeddingError({
    code: "EMBEDDING_UNKNOWN",
    message: error instanceof Error ? error.message : String(error)
  });
}

function embeddingErrorMessage(code: EmbeddingErrorCode) {
  switch (code) {
    case "EMBEDDING_NOT_CONFIGURED":
      return "Embedding generation is not configured yet.";
    case "EMBEDDING_RATE_LIMITED":
      return "Embedding generation is temporarily rate limited.";
    case "EMBEDDING_TIMEOUT":
      return "Embedding generation took too long.";
    case "EMBEDDING_BAD_RESPONSE":
      return "The embedding service returned an unexpected response.";
    case "EMBEDDING_UNKNOWN":
      return "Embedding generation failed safely.";
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeDimensions(value: number | undefined) {
  return Number.isFinite(value) && value && value > 0
    ? Math.round(value)
    : undefined;
}

function sanitizeMessage(message: string) {
  return message.replace(/\s+/g, " ").trim().slice(0, 500);
}
