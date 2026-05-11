import {
  generateEmbeddings,
  type EmbeddingResult
} from "@/lib/ai/embeddings";
import {
  getDeployment,
  type AIChatMessage
} from "@/lib/ai/azure-openai";
import { AIGenerationError } from "@/lib/ai/errors";
import { getAzureOpenAIConfig, getFacultyConfig } from "@/lib/config/server-env";
import { logFacultyEvent } from "@/lib/faculty/logger";
import { STRICT_JSON_OUTPUT_INSTRUCTION } from "@/lib/faculty/prompts";
import { guardFacultyModelCall } from "@/lib/faculty/retry";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export type FacultyModelOperation =
  | "faculty_chat"
  | "faculty_improvement_report"
  | "faculty_bias_report"
  | "faculty_accessibility_remediation"
  | "faculty_ocr"
  | "faculty_embedding";

export async function generateFacultyJson(input: {
  operation: Exclude<FacultyModelOperation, "faculty_ocr" | "faculty_embedding">;
  sessionId?: string;
  messages: AIChatMessage[];
  temperature?: number;
  timeoutMs?: number;
  structuredOutput?: {
    name: string;
    schema: z.ZodTypeAny;
  };
}) {
  const route = getFacultyModelRoute(input.operation);

  logFacultyEvent("faculty_report_started", {
    sessionId: input.sessionId,
    operation: input.operation,
    modelRoute: route.provider,
    deployment: route.deployment
  });

  return guardFacultyModelCall({
    operation: input.operation,
    sessionId: input.sessionId,
    run: async () => {
      if (route.deployment) {
        return invokeFacultyDeploymentJson({
          deployment: route.deployment,
          operation: input.operation,
          sessionId: input.sessionId,
          messages: input.messages,
          temperature: input.temperature ?? 0.2,
          timeoutMs: input.timeoutMs ?? 90_000,
          structuredOutput: input.structuredOutput
        });
      }

      throw new AIGenerationError({ type: "AI_NOT_CONFIGURED" });
    }
  });
}

export async function generateFacultyStructuredJson<TSchema extends z.ZodTypeAny>(
  input: {
    operation: Exclude<FacultyModelOperation, "faculty_ocr" | "faculty_embedding">;
    outputName: string;
    schema: TSchema;
    sessionId?: string;
    messages: AIChatMessage[];
    temperature?: number;
    timeoutMs?: number;
  }
): Promise<{
  data: z.infer<TSchema>;
  generated: Awaited<ReturnType<typeof generateFacultyJson>>;
}> {
  let lastParseError: FacultyStructuredOutputError | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const generated = await generateFacultyJson({
        operation: input.operation,
        sessionId: input.sessionId,
        messages:
          attempt === 1
            ? input.messages
            : [
                ...input.messages,
                {
                  role: "user",
                  content:
                    "Your previous response did not match the required schema. Return ONLY a JSON object matching the schema exactly. No prose, no fences."
                }
              ],
        temperature: input.temperature,
        timeoutMs: input.timeoutMs,
        structuredOutput: {
          name: input.outputName,
          schema: input.schema
        }
      });

      try {
        return {
          data: input.schema.parse(stripNullObjectProperties(generated.json)),
          generated
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          lastParseError = new FacultyStructuredOutputError({
            cause: error,
            parseStage: "zod",
            rawModelOutput: generated.rawModelOutput,
            responseFormat: generated.responseFormat
          });

          if (attempt === 1) {
            continue;
          }

          throw lastParseError;
        }

        throw error;
      }
    } catch (error) {
      if (error instanceof FacultyModelOutputParseError) {
        lastParseError = new FacultyStructuredOutputError({
          cause: error,
          parseStage: error.parseStage,
          rawModelOutput: error.rawModelOutput,
          responseFormat: error.responseFormat
        });

        if (attempt === 1) {
          continue;
        }

        throw lastParseError;
      }

      throw error;
    }
  }

  throw lastParseError ?? new Error("Faculty structured output parsing failed.");
}

export async function generateFacultyEmbeddings(input: {
  sessionId?: string;
  texts: string[];
}) {
  const route = getFacultyModelRoute("faculty_embedding");
  logFacultyEvent("faculty_index_started", {
    sessionId: input.sessionId,
    operation: "faculty_embedding",
    modelRoute: route.provider,
    deployment: route.deployment
  });

  return generateEmbeddings(input.texts);
}

export function getFacultyModelRoute(operation: FacultyModelOperation): {
  provider: "azure_openai" | "embedding" | "mistral_ocr";
  deployment: string | null;
} {
  if (operation === "faculty_ocr") {
    const config = getFacultyConfig();
    return {
      provider: "mistral_ocr",
      deployment: config.mistralOcrModel
    };
  }

  if (operation === "faculty_embedding") {
    return {
      provider: "embedding",
      deployment: null
    };
  }

  const config = getFacultyConfig();

  return {
    provider: "azure_openai",
    deployment:
      config.primaryModelDeployment ?? getDeployment("strong") ?? getDeployment("fast")
  };
}

export function assertMistralOnlyForOcr(operation: FacultyModelOperation) {
  if (operation !== "faculty_ocr") {
    throw new Error(`Mistral may only be used for Faculty OCR, not ${operation}.`);
  }
}

async function invokeFacultyDeploymentJson(input: {
  deployment: string;
  operation: string;
  sessionId?: string;
  messages: AIChatMessage[];
  temperature: number;
  timeoutMs: number;
  structuredOutput?: {
    name: string;
    schema: z.ZodTypeAny;
  };
}) {
  const config = getAzureOpenAIConfig();

  if (!config.endpoint || !config.apiKey) {
    throw new AIGenerationError({ type: "AI_NOT_CONFIGURED" });
  }

  const startedAt = Date.now();
  const url = `${config.endpoint}/openai/deployments/${encodeURIComponent(
    input.deployment
  )}/chat/completions?api-version=${encodeURIComponent(config.apiVersion)}`;
  let responseFormat = input.structuredOutput
    ? buildJsonSchemaResponseFormat(input.structuredOutput)
    : ({ type: "json_object" } as FacultyResponseFormat);
  let messages = input.messages;
  let response: Response;

  try {
    response = await invokeFacultyChat({
      url,
      apiKey: config.apiKey,
      body: buildFacultyChatBody({
        messages,
        temperature: input.temperature,
        responseFormat
      }),
      timeoutMs: input.timeoutMs
    });
  } catch (error) {
    if (!input.structuredOutput || !isJsonSchemaUnsupported(error)) {
      throw error;
    }

    responseFormat = { type: "json_object" };
    messages = appendStrictJsonInstructionToSystemMessages(input.messages);
    logFacultyEvent("faculty_model_output_format_fallback", {
      sessionId: input.sessionId,
      operation: input.operation,
      deployment: input.deployment,
      reason: error instanceof Error ? error.message : String(error)
    });
    response = await invokeFacultyChat({
      url,
      apiKey: config.apiKey,
      body: buildFacultyChatBody({
        messages,
        temperature: input.temperature,
        responseFormat
      }),
      timeoutMs: input.timeoutMs
    });
  }

  const raw = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: unknown;
  };
  const content = raw.choices?.[0]?.message?.content;

  if (!content) {
      throw new AIGenerationError({ type: "MODEL_BAD_JSON" });
  }

  const parsed = parseFacultyModelOutput(content, responseFormat.type);
  logFacultyEvent("faculty_model_output", {
    sessionId: input.sessionId,
    operation: input.operation,
    deployment: input.deployment,
    responseFormat: responseFormat.type,
    parseStage: "success",
    rawModelOutputFirst500Chars: content.slice(0, 500),
    rawModelOutputLast200Chars: content.slice(-200)
  });

  return {
    json: parsed.json,
    rawModelOutput: content,
    sanitizedModelOutput: parsed.sanitized,
    responseFormat: responseFormat.type,
    deployment: input.deployment,
    durationMs: Date.now() - startedAt,
    usage: raw.usage
  };
}

export type FacultyEmbeddingResult = EmbeddingResult;

type FacultyResponseFormat =
  | { type: "json_object" }
  | {
      type: "json_schema";
      json_schema: {
        name: string;
        schema: unknown;
        strict: true;
      };
    };

type ParseStage = "sanitize" | "JSON.parse" | "zod";

export class FacultyModelOutputParseError extends Error {
  readonly parseStage: Exclude<ParseStage, "zod">;
  readonly rawModelOutput: string;
  readonly rawModelOutputFirst500Chars: string;
  readonly rawModelOutputLast200Chars: string;
  readonly responseFormat: FacultyResponseFormat["type"];

  constructor(input: {
    parseStage: Exclude<ParseStage, "zod">;
    rawModelOutput: string;
    message: string;
    responseFormat: FacultyResponseFormat["type"];
  }) {
    super(input.message);
    this.name = "FacultyModelOutputParseError";
    this.parseStage = input.parseStage;
    this.rawModelOutput = input.rawModelOutput;
    this.rawModelOutputFirst500Chars = input.rawModelOutput.slice(0, 500);
    this.rawModelOutputLast200Chars = input.rawModelOutput.slice(-200);
    this.responseFormat = input.responseFormat;
  }
}

export class FacultyStructuredOutputError extends Error {
  readonly parseStage: ParseStage;
  readonly rawModelOutput: string;
  readonly rawModelOutputFirst500Chars: string;
  readonly rawModelOutputLast200Chars: string;
  readonly responseFormat?: FacultyResponseFormat["type"];

  constructor(input: {
    cause: Error;
    parseStage: ParseStage;
    rawModelOutput: string;
    responseFormat?: FacultyResponseFormat["type"];
  }) {
    super(input.cause.message);
    this.name = input.cause instanceof z.ZodError ? "ZodError" : input.cause.name;
    this.cause = input.cause;
    this.parseStage = input.parseStage;
    this.rawModelOutput = input.rawModelOutput;
    this.rawModelOutputFirst500Chars = input.rawModelOutput.slice(0, 500);
    this.rawModelOutputLast200Chars = input.rawModelOutput.slice(-200);
    this.responseFormat = input.responseFormat;
  }
}

export function getFacultyStructuredOutputLogFields(error: unknown) {
  if (
    error instanceof FacultyStructuredOutputError ||
    error instanceof FacultyModelOutputParseError
  ) {
    return {
      parseStage: error.parseStage,
      responseFormat: error.responseFormat,
      rawModelOutputFirst500Chars: error.rawModelOutputFirst500Chars,
      rawModelOutputLast200Chars: error.rawModelOutputLast200Chars
    };
  }

  return {};
}

function buildJsonSchemaResponseFormat(input: {
  name: string;
  schema: z.ZodTypeAny;
}): FacultyResponseFormat {
  const jsonSchema = zodToJsonSchema(input.schema, {
    target: "openAi",
    $refStrategy: "none"
  }) as Record<string, unknown>;

  delete jsonSchema.$schema;

  return {
    type: "json_schema",
    json_schema: {
      name: input.name,
      schema: jsonSchema,
      strict: true
    }
  };
}

function buildFacultyChatBody(input: {
  messages: AIChatMessage[];
  temperature: number;
  responseFormat: FacultyResponseFormat;
}) {
  return {
    messages: input.messages,
    temperature: input.temperature,
    response_format: input.responseFormat
  };
}

async function invokeFacultyChat(input: {
  url: string;
  apiKey: string;
  body: Record<string, unknown>;
  timeoutMs: number;
}) {
  let response = await postFacultyChat(input);

  if (response.ok) {
    return response;
  }

  let error = await createFacultyAzureHttpError(response);

  if (
    error.providerCode === "unsupported_value" &&
    error.technicalMessage?.toLowerCase().includes("temperature") &&
    "temperature" in input.body
  ) {
    const body = { ...input.body };
    delete body.temperature;
    response = await postFacultyChat({ ...input, body });

    if (response.ok) {
      return response;
    }

    error = await createFacultyAzureHttpError(response);
  }

  throw error;
}

function postFacultyChat(input: {
  url: string;
  apiKey: string;
  body: Record<string, unknown>;
  timeoutMs: number;
}) {
  return fetch(input.url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "api-key": input.apiKey
    },
    body: JSON.stringify(input.body),
    signal: AbortSignal.timeout(input.timeoutMs)
  });
}

async function createFacultyAzureHttpError(response: Response) {
  const body = await response.text();
  const providerError = parseAzureErrorBody(body);

  return new AIGenerationError({
    type: response.status === 429 ? "MODEL_RATE_LIMITED" : "UNKNOWN",
    statusCode: response.status,
    providerCode: providerError.code,
    technicalMessage: providerError.message ?? body.slice(0, 500)
  });
}

function parseAzureErrorBody(body: string) {
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

function isJsonSchemaUnsupported(error: unknown) {
  if (!(error instanceof AIGenerationError)) {
    return false;
  }

  const message = error.technicalMessage?.toLowerCase() ?? "";

  return (
    error.statusCode === 400 &&
    (message.includes("json_schema") ||
      message.includes("response_format") ||
      message.includes("schema") ||
      error.providerCode === "unsupported_value" ||
      error.providerCode === "invalid_request_error")
  );
}

function parseFacultyModelOutput(
  rawModelOutput: string,
  responseFormat: FacultyResponseFormat["type"]
) {
  const sanitized = sanitizeRawModelOutput(rawModelOutput, responseFormat);

  try {
    return {
      sanitized,
      json: JSON.parse(sanitized) as unknown
    };
  } catch (error) {
    throw new FacultyModelOutputParseError({
      parseStage: "JSON.parse",
      rawModelOutput,
      responseFormat,
      message:
        error instanceof Error
          ? error.message
          : "Model output was not valid JSON."
    });
  }
}

function sanitizeRawModelOutput(
  rawModelOutput: string,
  responseFormat: FacultyResponseFormat["type"]
) {
  let sanitized = rawModelOutput
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const firstBrace = sanitized.indexOf("{");
  const lastBrace = sanitized.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
    throw new FacultyModelOutputParseError({
      parseStage: "sanitize",
      rawModelOutput,
      responseFormat,
      message: "Model output did not contain a JSON object envelope."
    });
  }

  sanitized = sanitized.slice(firstBrace, lastBrace + 1).trim();

  return sanitized;
}

function appendStrictJsonInstructionToSystemMessages(messages: AIChatMessage[]) {
  return messages.map((message) => {
    if (message.role !== "system") {
      return message;
    }

    if (message.content.includes(STRICT_JSON_OUTPUT_INSTRUCTION)) {
      return message;
    }

    return {
      ...message,
      content: `${message.content.trim()}\n\n${STRICT_JSON_OUTPUT_INSTRUCTION}`
    };
  });
}

function stripNullObjectProperties(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripNullObjectProperties);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== null)
      .map(([key, child]) => [key, stripNullObjectProperties(child)])
  );
}
