import { AIGenerationError } from "@/lib/ai/errors";
import {
  getAzureOpenAIConfig,
  resetServerEnvForTests
} from "@/lib/config/server-env";

const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_RETRIES = 2;

export type AzureModelTier = "fast" | "strong";

export type AIChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type GenerateJsonInput = {
  messages: AIChatMessage[];
  modelTier: AzureModelTier;
  temperature?: number;
  timeoutMs?: number;
  operation: string;
};

export type GenerateJsonResult = {
  json: unknown;
  deployment: string;
  durationMs: number;
  usage?: unknown;
  fallbackUsed?: boolean;
};

type AzureChatResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: unknown;
};

export function isAzureOpenAIConfigured() {
  const config = getAzureOpenAIConfig();

  return Boolean(
    config.endpoint && config.apiKey && getDeployment("fast")
  );
}

export function getDeployment(tier: AzureModelTier) {
  const config = getAzureOpenAIConfig();
  const fast = config.fastDeployment;
  const strong = config.strongDeployment;

  if (tier === "strong") {
    return strong || fast || null;
  }

  return fast || strong || null;
}

function getDeploymentCandidates(tier: AzureModelTier) {
  const config = getAzureOpenAIConfig();
  const fast = config.fastDeployment;
  const strong = config.strongDeployment;
  const ordered = tier === "strong" ? [strong, fast] : [fast, strong];

  return ordered.filter(
    (deployment, index, allDeployments): deployment is string =>
      Boolean(deployment) && allDeployments.indexOf(deployment) === index
  );
}

export async function generateJson({
  messages,
  modelTier,
  temperature = 0.2,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  operation
}: GenerateJsonInput): Promise<GenerateJsonResult> {
  const config = getAzureOpenAIConfig();
  const endpoint = config.endpoint;
  const apiKey = config.apiKey;
  const deployments = getDeploymentCandidates(modelTier);

  if (!endpoint || !apiKey || deployments.length === 0) {
    throw new AIGenerationError({ type: "AI_NOT_CONFIGURED" });
  }

  const startedAt = Date.now();
  const body = {
    messages,
    temperature,
    response_format: { type: "json_object" }
  };
  let lastError: AIGenerationError | null = null;

  for (const [index, deployment] of deployments.entries()) {
    try {
      const result = await invokeJsonDeployment({
        endpoint,
        apiKey,
        deployment,
        body,
        timeoutMs,
        startedAt,
        operation
      });

      return {
        ...result,
        fallbackUsed: index > 0
      };
    } catch (error) {
      if (!(error instanceof AIGenerationError)) {
        throw new AIGenerationError({
          type: "UNKNOWN",
          technicalMessage: error instanceof Error ? error.message : String(error)
        });
      }

      lastError = error;
      logAIEvent("failed", {
        operation,
        deployment,
        durationMs: Date.now() - startedAt,
        errorType: error.type,
        statusCode: error.statusCode,
        providerCode: error.providerCode,
        reason: sanitizeProviderMessage(error.technicalMessage),
        fallbackAvailable: index < deployments.length - 1
      });

      if (error.type === "AI_NOT_CONFIGURED" || index === deployments.length - 1) {
        throw error;
      }

      logAIEvent("fallback", {
        operation,
        fromDeployment: deployment,
        toDeployment: deployments[index + 1],
        reason: error.providerCode ?? error.type
      });
    }
  }

  throw lastError ?? new AIGenerationError({ type: "UNKNOWN" });
}

async function invokeJsonDeployment({
  endpoint,
  apiKey,
  deployment,
  body,
  timeoutMs,
  startedAt,
  operation
}: {
  endpoint: string;
  apiKey: string;
  deployment: string;
  body: Record<string, unknown>;
  timeoutMs: number;
  startedAt: number;
  operation: string;
}): Promise<GenerateJsonResult> {
  const url = buildAzureChatUrl(endpoint, deployment);
  let response: Response;

  try {
    response = await invokeAzureChat({
      url,
      apiKey,
      body,
      timeoutMs
    });
  } catch (error) {
    if (
      error instanceof AIGenerationError &&
      error.providerCode === "unsupported_value" &&
      error.technicalMessage?.toLowerCase().includes("temperature") &&
      "temperature" in body
    ) {
      const defaultTemperatureBody = { ...body };
      delete defaultTemperatureBody.temperature;
      logAIEvent("retry_default_temperature", {
        operation,
        deployment,
        reason: sanitizeProviderMessage(error.technicalMessage)
      });
      response = await invokeAzureChat({
        url,
        apiKey,
        body: defaultTemperatureBody,
        timeoutMs
      });
    } else {
      throw error;
    }
  }

  const raw = (await response.json()) as AzureChatResponse;
  const content = raw.choices?.[0]?.message?.content;

  if (!content) {
    throw new AIGenerationError({
      type: "MODEL_BAD_JSON",
      technicalMessage: "Azure OpenAI response did not include content."
    });
  }

  try {
    const json = JSON.parse(content);
    logAIEvent("completed", {
      operation,
      deployment,
      durationMs: Date.now() - startedAt,
      usage: raw.usage
    });

    return {
      json,
      deployment,
      durationMs: Date.now() - startedAt,
      usage: raw.usage
    };
  } catch {
    const repaired = await repairJsonContent(content, deployment, timeoutMs);
    logAIEvent("json_repaired", {
      operation,
      deployment,
      durationMs: Date.now() - startedAt
    });

    return {
      json: repaired,
      deployment,
      durationMs: Date.now() - startedAt,
      usage: raw.usage
    };
  }
}

function invokeAzureChat({
  url,
  apiKey,
  body,
  timeoutMs
}: {
  url: string;
  apiKey: string;
  body: unknown;
  timeoutMs: number;
}) {
  return retryFetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "api-key": apiKey
    },
    body: JSON.stringify(body),
    timeoutMs
  });
}

function buildAzureChatUrl(endpoint: string, deployment: string) {
  const base = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
  const apiVersion = getAzureOpenAIConfig().apiVersion;

  return `${base}/openai/deployments/${encodeURIComponent(
    deployment
  )}/chat/completions?api-version=${encodeURIComponent(apiVersion)}`;
}

async function retryFetch(
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
        lastError = new AIGenerationError({
          type: "MODEL_RATE_LIMITED",
          technicalMessage: "Azure OpenAI returned HTTP 429."
        });
      } else if (response.status >= 500) {
        lastError = new AIGenerationError({
          type: "UNKNOWN",
          technicalMessage: `Azure OpenAI returned HTTP ${response.status}.`
        });
      } else if (!response.ok) {
        const text = await response.text();
        throw createAzureHttpError(response.status, text);
      } else {
        return response;
      }
    } catch (error) {
      const mapped = mapFetchError(error);
      lastError = mapped;

      if (
        mapped.type === "UNKNOWN" &&
        mapped.technicalMessage?.includes("HTTP 4")
      ) {
        throw mapped;
      }
    } finally {
      clearTimeout(timeout);
    }

    await sleep(300 * 2 ** attempt);
  }

  throw lastError instanceof AIGenerationError
    ? lastError
    : new AIGenerationError({ type: "UNKNOWN" });
}

function createAzureHttpError(statusCode: number, body: string) {
  const providerError = parseAzureError(body);
  const message = providerError.message || body.slice(0, 300);
  const providerCode = providerError.code;

  if (statusCode === 429) {
    return new AIGenerationError({
      type: "MODEL_RATE_LIMITED",
      technicalMessage: message,
      statusCode,
      providerCode
    });
  }

  if (statusCode === 408 || statusCode === 504) {
    return new AIGenerationError({
      type: "MODEL_TIMEOUT",
      technicalMessage: message,
      statusCode,
      providerCode
    });
  }

  return new AIGenerationError({
    type: "UNKNOWN",
    technicalMessage: message,
    statusCode,
    providerCode
  });
}

function parseAzureError(body: string) {
  try {
    const parsed = JSON.parse(body) as {
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
          : undefined
    };
  } catch {
    return {};
  }
}

async function repairJsonContent(
  content: string,
  currentDeployment: string,
  timeoutMs: number
) {
  const config = getAzureOpenAIConfig();
  const endpoint = config.endpoint;
  const apiKey = config.apiKey;

  if (!endpoint || !apiKey) {
    throw new AIGenerationError({ type: "AI_NOT_CONFIGURED" });
  }

  const deployment = getDeployment("fast") ?? currentDeployment;
  const response = await retryFetch(buildAzureChatUrl(endpoint, deployment), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "api-key": apiKey
    },
    body: JSON.stringify({
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Return valid JSON only. Repair the user's malformed JSON without changing its meaning."
        },
        {
          role: "user",
          content
        }
      ]
    }),
    timeoutMs
  });
  const raw = (await response.json()) as AzureChatResponse;
  const repairedContent = raw.choices?.[0]?.message?.content;

  if (!repairedContent) {
    throw new AIGenerationError({
      type: "MODEL_BAD_JSON",
      technicalMessage: "JSON repair response did not include content."
    });
  }

  try {
    return JSON.parse(repairedContent);
  } catch {
    throw new AIGenerationError({
      type: "MODEL_BAD_JSON",
      technicalMessage: "JSON repair still returned malformed JSON."
    });
  }
}

export { resetServerEnvForTests };

function mapFetchError(error: unknown) {
  if (error instanceof AIGenerationError) {
    return error;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return new AIGenerationError({ type: "MODEL_TIMEOUT" });
  }

  if (error instanceof Error && error.name === "AbortError") {
    return new AIGenerationError({ type: "MODEL_TIMEOUT" });
  }

  return new AIGenerationError({
    type: "UNKNOWN",
    technicalMessage: error instanceof Error ? error.message : String(error)
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logAIEvent(event: string, fields: Record<string, unknown>) {
  const safeFields = { ...fields };

  if (process.env.DEBUG_AI !== "true") {
    delete safeFields.prompt;
    delete safeFields.evidence;
  }

  console.info("[ai:generation]", JSON.stringify({ event, ...safeFields }));
}

function sanitizeProviderMessage(message?: string) {
  if (!message) {
    return undefined;
  }

  return message.replace(/api[-_ ]?key[^\s,;]*/gi, "api-key:[redacted]").slice(0, 240);
}
