import { getAzureSearchConfig } from "@/lib/config/server-env";

const DEFAULT_SEARCH_API_VERSION = "2024-07-01";
const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 2;

export type SearchErrorCode =
  | "SEARCH_NOT_CONFIGURED"
  | "SEARCH_INDEX_FAILED"
  | "SEARCH_INDEX_SCHEMA_MISMATCH"
  | "SEARCH_QUERY_FAILED"
  | "SEARCH_BAD_RESPONSE";

export class SearchError extends Error {
  readonly code: SearchErrorCode;
  readonly safeMessage: string;
  readonly statusCode?: number;
  readonly providerCode?: string;
  readonly requestId?: string;

  constructor({
    code,
    message,
    statusCode,
    providerCode,
    requestId
  }: {
    code: SearchErrorCode;
    message?: string;
    statusCode?: number;
    providerCode?: string;
    requestId?: string;
  }) {
    const safeMessage = sanitizeMessage(message ?? searchErrorMessage(code));

    super(safeMessage);
    this.name = "SearchError";
    this.code = code;
    this.safeMessage = safeMessage;
    this.statusCode = statusCode;
    this.providerCode = providerCode;
    this.requestId = requestId;
  }
}

export function isSearchConfigured() {
  const config = getAzureSearchConfig();

  return Boolean(config.endpoint && config.apiKey);
}

export function getSearchIndexName() {
  return getAzureSearchConfig().indexName;
}

export function getSearchIndexEnvSource() {
  return getAzureSearchConfig().source.indexName;
}

export async function searchFetch<T>({
  path,
  method = "GET",
  body,
  operation,
  timeoutMs = DEFAULT_TIMEOUT_MS
}: {
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  operation: "index" | "query";
  timeoutMs?: number;
}): Promise<T> {
  const config = getAzureSearchConfig();
  const endpoint = config.endpoint;
  const apiKey = config.apiKey;

  if (!endpoint || !apiKey) {
    throw new SearchError({ code: "SEARCH_NOT_CONFIGURED" });
  }

  const base = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
  const separator = path.includes("?") ? "&" : "?";
  const url = `${base}${path}${separator}api-version=${encodeURIComponent(
    DEFAULT_SEARCH_API_VERSION
  )}`;
  let lastError: SearchError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "content-type": "application/json",
          "api-key": apiKey
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const provider = await parseSearchProviderError(response);
        const mapped = new SearchError({
          code:
            operation === "index" ? "SEARCH_INDEX_FAILED" : "SEARCH_QUERY_FAILED",
          message: provider.message,
          statusCode: response.status,
          providerCode: provider.code,
          requestId: provider.requestId
        });

        if (!isTransientStatus(response.status) || attempt === MAX_RETRIES) {
          throw mapped;
        }

        lastError = mapped;
      } else {
        if (response.status === 204) {
          return {} as T;
        }

        return (await response.json()) as T;
      }
    } catch (error) {
      if (error instanceof SearchError) {
        if (!isTransientStatus(error.statusCode) || attempt === MAX_RETRIES) {
          throw error;
        }

        lastError = error;
      } else {
        lastError = new SearchError({
          code:
            operation === "index" ? "SEARCH_INDEX_FAILED" : "SEARCH_QUERY_FAILED",
          message: error instanceof Error ? error.message : String(error)
        });

        if (attempt === MAX_RETRIES) {
          throw lastError;
        }
      }
    } finally {
      clearTimeout(timeout);
    }

    await sleep(250 * 2 ** attempt);
  }

  throw lastError ?? new SearchError({ code: "SEARCH_BAD_RESPONSE" });
}

export function normalizeSearchError(error: unknown): SearchError {
  if (error instanceof SearchError) {
    return error;
  }

  return new SearchError({
    code: "SEARCH_QUERY_FAILED",
    message: error instanceof Error ? error.message : String(error)
  });
}

export function escapeODataString(value: string) {
  return value.replace(/'/g, "''");
}

function searchErrorMessage(code: SearchErrorCode) {
  switch (code) {
    case "SEARCH_NOT_CONFIGURED":
      return "Azure AI Search is not configured yet.";
    case "SEARCH_INDEX_FAILED":
      return "Evidence indexing failed safely.";
    case "SEARCH_INDEX_SCHEMA_MISMATCH":
      return "Azure AI Search index schema is incompatible.";
    case "SEARCH_QUERY_FAILED":
      return "Search failed safely.";
    case "SEARCH_BAD_RESPONSE":
      return "Azure AI Search returned an unexpected response.";
  }
}

async function parseSearchProviderError(response: Response) {
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
      code: typeof parsed.error?.code === "string" ? parsed.error.code : undefined,
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

function sanitizeMessage(message: string) {
  return message.replace(/\s+/g, " ").trim().slice(0, 500);
}

function isTransientStatus(statusCode?: number) {
  return (
    statusCode === undefined ||
    statusCode === 408 ||
    statusCode === 429 ||
    statusCode >= 500
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
