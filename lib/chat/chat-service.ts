import { Prisma } from "@prisma/client";
import type { z } from "zod";

import { generateJson, isAzureOpenAIConfigured } from "@/lib/ai/azure-openai";
import { normalizeAIGenerationError } from "@/lib/ai/errors";
import { formatTimestamp } from "@/lib/ai/evidence-compiler";
import { normalizeArtifactLanguage } from "@/lib/ai/schemas";
import {
  buildChatMessages,
  buildChatRepairMessages
} from "@/lib/chat/chat-prompts";
import {
  chatRequestSchema,
  modelChatResponseSchema,
  type ChatCitation,
  type ChatFailureCode,
  type ChatFailureResponse,
  type ChatServiceResult,
  type ChatSuccessResponse,
  type ModelChatResponse
} from "@/lib/chat/chat-schemas";
import { prisma } from "@/lib/prisma";
import {
  retrieveLectureContext,
  type LectureEvidenceChunk,
  type RetrieveLectureContextResult
} from "@/lib/retrieval/lecture-retriever";
import { getSearchIndexName } from "@/lib/search/search-client";

const INSUFFICIENT_EVIDENCE_ANSWER =
  "I could not find enough lecture evidence to answer this safely.";

type VerificationFailureReason =
  | "schema_validation_failed"
  | "missing_citations"
  | "unsupported_citation_id";

type VerifiedChatResponse =
  | {
      ok: true;
      response: Pick<ChatSuccessResponse, "answer" | "citations" | "followUps">;
    }
  | {
      ok: false;
      code: ChatFailureCode;
      message: string;
      status: number;
      verificationReason: VerificationFailureReason;
      zodError?: z.ZodError;
    };

export async function answerNotebookChat({
  userId,
  notebookId,
  body
}: {
  userId: string;
  notebookId: string;
  body: unknown;
}): Promise<ChatServiceResult> {
  const startedAt = Date.now();

  logChatEvent("request_received", { notebookId });
  const parsed = chatRequestSchema.safeParse(body);

  if (!parsed.success) {
    return chatFailure("EMPTY_QUERY", "Enter a question about the lecture.", 400);
  }

  const request = parsed.data;
  let retrieval: Extract<RetrieveLectureContextResult, { ok: true }> | null =
    null;

  try {
    logChatEvent("retrieval_started", { notebookId });
    const retrievalResult = await retrieveLectureContext({
      userId,
      notebookId,
      query: request.message,
      language: request.language,
      topK: 8
    });

    if (!retrievalResult.ok) {
      return chatFailure(
        retrievalResult.error.code,
        retrievalResult.error.message,
        retrievalResult.error.code === "NOTEBOOK_NOT_FOUND" ? 404 : 422
      );
    }

    retrieval = retrievalResult;
    logChatEvent("notebook_validated", {
      notebookId,
      notebookStatus: "READY"
    });
    logChatEvent("retrieval_completed", {
      notebookId,
      retrievalMode: retrieval.retrievalMode,
      retrievedSegmentCount: retrieval.chunks.length,
      fallbackReason: retrieval.fallbackReason,
      searchConfigured: retrieval.debug.searchConfigured,
      embeddingsConfigured: retrieval.debug.embeddingsConfigured,
      indexedSegmentCount: retrieval.debug.indexedSegmentCount,
      searchIndexName: retrieval.debug.searchIndexName,
      indexEnvSource: retrieval.debug.indexEnvSource
    });

    if (!isAzureOpenAIConfigured()) {
      return chatFailure(
        "AI_NOT_CONFIGURED",
        "AI chat is not configured yet.",
        503,
        buildErrorDetails({ retrieval })
      );
    }

    logChatEvent("model_started", {
      operation: "grounded_chat",
      retrievalMode: retrieval.retrievalMode,
      retrievedSegmentCount: retrieval.chunks.length
    });
    const generated = await generateJson({
      modelTier:
        request.mode === "deep" || request.mode === "exam" ? "strong" : "fast",
      operation: "grounded_chat",
      temperature: 0.2,
      timeoutMs: 90_000,
      messages: buildChatMessages({
        question: request.message,
        language: normalizeArtifactLanguage(request.language),
        mode: request.mode,
        responseLength: request.responseLength,
        chunks: retrieval.chunks
      })
    });
    logChatEvent("model_completed", {
      operation: "grounded_chat",
      deployment: generated.deployment,
      durationMs: generated.durationMs
    });

    logChatEvent("json_parse_started", { operation: "grounded_chat" });
    const verified = parseAndVerifyChatResponse({
      candidate: generated.json,
      chunks: retrieval.chunks
    });

    if (!verified.ok) {
      logVerificationFailure(verified, retrieval);
      logChatEvent("repair_started", {
        verificationReason: verified.verificationReason
      });

      const repaired = await repairChatResponse({
        candidate: generated.json,
        chunks: retrieval.chunks
      });

      if (!repaired.ok) {
        logChatEvent("repair_failed", {
          code: repaired.code,
          verificationReason: repaired.verificationReason
        });

        const fallback = createSafeCitedFallback({
          chunks: retrieval.chunks,
          retrievalMode: retrieval.retrievalMode,
          model: generated.deployment,
          retrieval
        });

        await persistChatMessages({
          notebookId,
          userId,
          userMessage: request.message,
          answer: fallback.answer,
          citations: fallback.citations,
          metadata: {
            retrievalMode: retrieval.retrievalMode,
            model: generated.deployment,
            contextSegmentCount: retrieval.chunks.length,
            safeFallback: true,
            verificationReason: repaired.verificationReason
          }
        });
        logChatEvent("response_persisted", {
          notebookId,
          safeFallback: true
        });
        logChatEvent("response_returned", {
          notebookId,
          status: 200,
          durationMs: Date.now() - startedAt
        });

        return {
          ok: true,
          response: fallback
        };
      }

      logChatEvent("repair_completed", {
        citationCount: repaired.response.citations.length
      });

      const repairedBroadFallback = createBroadQuestionFallbackIfNeeded({
        question: request.message,
        response: repaired.response,
        chunks: retrieval.chunks,
        retrievalMode: retrieval.retrievalMode,
        model: generated.deployment,
        retrieval
      });

      if (repairedBroadFallback) {
        await persistChatMessages({
          notebookId,
          userId,
          userMessage: request.message,
          answer: repairedBroadFallback.answer,
          citations: repairedBroadFallback.citations,
          metadata: {
            retrievalMode: retrieval.retrievalMode,
            model: generated.deployment,
            contextSegmentCount: retrieval.chunks.length,
            broadQuestionFallback: true
          }
        });
        logChatEvent("response_persisted", {
          notebookId,
          broadQuestionFallback: true
        });
        logChatEvent("response_returned", {
          notebookId,
          status: 200,
          durationMs: Date.now() - startedAt
        });

        return {
          ok: true,
          response: repairedBroadFallback
        };
      }

      const response = buildChatSuccessResponse({
        response: repaired.response,
        retrieval,
        model: generated.deployment,
        repaired: true
      });

      await persistChatMessages({
        notebookId,
        userId,
        userMessage: request.message,
        answer: response.answer,
        citations: response.citations,
        metadata: {
          retrievalMode: retrieval.retrievalMode,
          model: generated.deployment,
          contextSegmentCount: retrieval.chunks.length,
          repaired: true
        }
      });
      logChatEvent("response_persisted", { notebookId, repaired: true });
      logChatEvent("response_returned", {
        notebookId,
        status: 200,
        durationMs: Date.now() - startedAt
      });

      return {
        ok: true,
        response
      };
    }

    const broadFallback = createBroadQuestionFallbackIfNeeded({
      question: request.message,
      response: verified.response,
      chunks: retrieval.chunks,
      retrievalMode: retrieval.retrievalMode,
      model: generated.deployment,
      retrieval
    });

    if (broadFallback) {
      await persistChatMessages({
        notebookId,
        userId,
        userMessage: request.message,
        answer: broadFallback.answer,
        citations: broadFallback.citations,
        metadata: {
          retrievalMode: retrieval.retrievalMode,
          model: generated.deployment,
          contextSegmentCount: retrieval.chunks.length,
          broadQuestionFallback: true
        }
      });
      logChatEvent("response_persisted", {
        notebookId,
        broadQuestionFallback: true
      });
      logChatEvent("response_returned", {
        notebookId,
        status: 200,
        durationMs: Date.now() - startedAt
      });

      return {
        ok: true,
        response: broadFallback
      };
    }

    const response = buildChatSuccessResponse({
      response: verified.response,
      retrieval,
      model: generated.deployment,
      repaired: false
    });

    await persistChatMessages({
      notebookId,
      userId,
      userMessage: request.message,
      answer: response.answer,
      citations: response.citations,
      metadata: {
        retrievalMode: retrieval.retrievalMode,
        model: generated.deployment,
        contextSegmentCount: retrieval.chunks.length,
        repaired: false
      }
    });
    logChatEvent("response_persisted", { notebookId, repaired: false });
    logChatEvent("response_returned", {
      notebookId,
      status: 200,
      durationMs: Date.now() - startedAt
    });

    return {
      ok: true,
      response
    };
  } catch (error) {
    const safe = normalizeAIGenerationError(error);
    const status = safe.type === "AI_NOT_CONFIGURED" ? 503 : 503;

    logChatEvent("model_failed", {
      errorType: safe.type,
      durationMs: Date.now() - startedAt
    });

    return chatFailure(
      mapAIErrorCode(safe.type),
      safe.userMessage,
      status,
      retrieval ? buildErrorDetails({ retrieval }) : undefined
    );
  }
}

export function canonicalizeChatCitations({
  citationIds,
  chunks
}: {
  citationIds: string[];
  chunks: LectureEvidenceChunk[];
}) {
  const chunkById = new Map(
    chunks.map((chunk) => [chunk.evidenceSegmentId, chunk])
  );
  const citations: ChatCitation[] = [];
  const seen = new Set<string>();

  for (const id of citationIds) {
    const chunk = chunkById.get(id);

    if (!chunk) {
      return {
        ok: false as const,
        code: "CITATION_VERIFICATION_FAILED" as const,
        message: "The answer cited unsupported lecture evidence.",
        verificationReason: "unsupported_citation_id" as const
      };
    }

    if (seen.has(id)) {
      continue;
    }

    seen.add(id);
    citations.push({
      evidenceSegmentId: chunk.evidenceSegmentId,
      startSec: chunk.startSec,
      endSec: chunk.endSec,
      label: chunk.label || formatTimestamp(chunk.startSec)
    });
  }

  return {
    ok: true as const,
    citations
  };
}

export function parseAndVerifyChatResponse({
  candidate,
  chunks
}: {
  candidate: unknown;
  chunks: LectureEvidenceChunk[];
}): VerifiedChatResponse {
  const parsed = modelChatResponseSchema.safeParse(candidate);

  if (!parsed.success) {
    logChatEvent("json_parse_failed", { reason: "schema_validation_failed" });
    return {
      ok: false,
      code: "MODEL_SCHEMA_INVALID",
      message: "LectureMind could not safely render this answer.",
      status: 422,
      verificationReason: "schema_validation_failed",
      zodError: parsed.error
    };
  }

  logChatEvent("citation_verification_started", {
    citationCount: parsed.data.citations.length
  });
  return verifyParsedChatResponse(parsed.data, chunks);
}

export function createSafeCitedFallback({
  chunks,
  retrievalMode,
  model,
  retrieval
}: {
  chunks: LectureEvidenceChunk[];
  retrievalMode: ChatSuccessResponse["retrievalMode"];
  model: string;
  retrieval?: Extract<RetrieveLectureContextResult, { ok: true }>;
}): ChatSuccessResponse {
  const topCitationIds = chunks.slice(0, 2).map((chunk) => chunk.evidenceSegmentId);
  const canonical = canonicalizeChatCitations({
    citationIds: topCitationIds,
    chunks
  });

  return {
    answer:
      "I found relevant lecture moments, but I could not verify a fully grounded answer. Use these cited moments to review the source.",
    citations: canonical.ok ? canonical.citations : [],
    followUps: [
      "Ask me to explain one cited moment.",
      "Ask for a simpler summary."
    ],
    retrievalMode,
    metadata: buildSuccessMetadata({
      model,
      contextSegmentCount: chunks.length,
      retrieval,
      safeFallback: true
    })
  };
}

function createBroadQuestionFallbackIfNeeded({
  question,
  response,
  chunks,
  retrievalMode,
  model,
  retrieval
}: {
  question: string;
  response: Pick<ChatSuccessResponse, "answer" | "citations" | "followUps">;
  chunks: LectureEvidenceChunk[];
  retrievalMode: ChatSuccessResponse["retrievalMode"];
  model: string;
  retrieval: Extract<RetrieveLectureContextResult, { ok: true }>;
}) {
  if (
    !isBroadStudyQuestion(question) ||
    !isInsufficientEvidenceAnswer(response.answer) ||
    chunks.length === 0
  ) {
    return null;
  }

  const selected = chunks.slice(0, Math.min(4, chunks.length));
  const canonical = canonicalizeChatCitations({
    citationIds: selected.map((chunk) => chunk.evidenceSegmentId),
    chunks
  });

  if (!canonical.ok || canonical.citations.length === 0) {
    return null;
  }

  return {
    answer: [
      "Review these lecture points:",
      "",
      ...selected.map(
        (chunk) => `- ${chunk.label}: ${summarizeChunkText(chunk.text)}`
      )
    ].join("\n"),
    citations: canonical.citations,
    followUps: [
      "Turn these into flashcards.",
      "Explain the hardest point more simply."
    ],
    retrievalMode,
    metadata: buildSuccessMetadata({
      model,
      contextSegmentCount: chunks.length,
      retrieval,
      safeFallback: true
    })
  } satisfies ChatSuccessResponse;
}

async function repairChatResponse({
  candidate,
  chunks
}: {
  candidate: unknown;
  chunks: LectureEvidenceChunk[];
}): Promise<VerifiedChatResponse> {
  try {
    const repaired = await generateJson({
      modelTier: "strong",
      operation: "repair_grounded_chat",
      temperature: 0,
      timeoutMs: 60_000,
      messages: buildChatRepairMessages({
        invalidJson: candidate,
        allowedEvidenceIds: chunks.map((chunk) => chunk.evidenceSegmentId)
      })
    });

    return parseAndVerifyChatResponse({
      candidate: repaired.json,
      chunks
    });
  } catch (error) {
    const safe = normalizeAIGenerationError(error);

    return {
      ok: false,
      code: mapAIErrorCode(safe.type),
      message: safe.userMessage,
      status: safe.type === "AI_NOT_CONFIGURED" ? 503 : 503,
      verificationReason: "schema_validation_failed"
    };
  }
}

function verifyParsedChatResponse(
  parsed: ModelChatResponse,
  chunks: LectureEvidenceChunk[]
): VerifiedChatResponse {
  if (isInsufficientEvidenceAnswer(parsed.answer) && parsed.citations.length === 0) {
    return {
      ok: true,
      response: {
        answer: INSUFFICIENT_EVIDENCE_ANSWER,
        citations: [],
        followUps: []
      }
    };
  }

  if (parsed.citations.length === 0) {
    return {
      ok: false,
      code: "CITATION_VERIFICATION_FAILED",
      message: "The answer did not include verifiable lecture citations.",
      status: 422,
      verificationReason: "missing_citations"
    };
  }

  const canonical = canonicalizeChatCitations({
    citationIds: parsed.citations.map((citation) => citation.evidenceSegmentId),
    chunks
  });

  if (!canonical.ok) {
    return {
      ok: false,
      code: canonical.code,
      message: canonical.message,
      status: 422,
      verificationReason: canonical.verificationReason
    };
  }

  return {
    ok: true,
    response: {
      answer: stripCitationPlaceholders(parsed.answer),
      citations: canonical.citations,
      followUps: parsed.followUps.slice(0, 3)
    }
  };
}

function buildChatSuccessResponse({
  response,
  retrieval,
  model,
  repaired
}: {
  response: Pick<ChatSuccessResponse, "answer" | "citations" | "followUps">;
  retrieval: Extract<RetrieveLectureContextResult, { ok: true }>;
  model: string;
  repaired: boolean;
}): ChatSuccessResponse {
  return {
    ...response,
    retrievalMode: retrieval.retrievalMode,
    metadata: buildSuccessMetadata({
      model,
      contextSegmentCount: retrieval.chunks.length,
      retrieval,
      repaired
    })
  };
}

function buildSuccessMetadata({
  model,
  contextSegmentCount,
  retrieval,
  repaired,
  safeFallback
}: {
  model: string;
  contextSegmentCount: number;
  retrieval?: Extract<RetrieveLectureContextResult, { ok: true }>;
  repaired?: boolean;
  safeFallback?: boolean;
}): ChatSuccessResponse["metadata"] {
  return {
    model,
    contextSegmentCount,
    ...(isDebugAIEnabled() && retrieval
      ? {
          retrievalMode: retrieval.debug.retrievalMode,
          retrievedSegmentCount: retrieval.debug.retrievedSegmentCount,
          topEvidenceIds: retrieval.debug.topEvidenceIds,
          fallbackReason: retrieval.debug.fallbackReason,
          searchIndexName: retrieval.debug.searchIndexName,
          indexEnvSource: retrieval.debug.indexEnvSource,
          searchConfigured: retrieval.debug.searchConfigured,
          embeddingsConfigured: retrieval.debug.embeddingsConfigured,
          indexedSegmentCount: retrieval.debug.indexedSegmentCount,
          repaired,
          safeFallback
        }
      : {})
  };
}

async function persistChatMessages({
  notebookId,
  userId,
  userMessage,
  answer,
  citations,
  metadata
}: {
  notebookId: string;
  userId: string;
  userMessage: string;
  answer: string;
  citations: Prisma.InputJsonValue;
  metadata: Record<string, unknown>;
}) {
  await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        notebookId,
        userId,
        role: "USER",
        content: userMessage
      }
    }),
    prisma.chatMessage.create({
      data: {
        notebookId,
        userId,
        role: "ASSISTANT",
        content: answer,
        citationsJson: {
          citations,
          ...metadata
        } satisfies Prisma.InputJsonValue
      }
    })
  ]);
}

function chatFailure(
  code: ChatFailureCode,
  message: string,
  status: number,
  details?: ChatFailureResponse["error"]["details"]
): ChatServiceResult {
  logChatEvent("response_returned", { status, code });

  return {
    ok: false,
    status,
    response: {
      error: {
        code,
        message,
        ...(details ? { details } : {})
      }
    }
  };
}

function buildErrorDetails({
  retrieval,
  verificationReason
}: {
  retrieval: Extract<RetrieveLectureContextResult, { ok: true }>;
  verificationReason?: VerificationFailureReason;
}): ChatFailureResponse["error"]["details"] {
  return {
    retrievalMode: retrieval.retrievalMode,
    retrievedSegmentCount: retrieval.chunks.length,
    verificationReason,
    indexName: getSearchIndexName(),
    indexEnvSource: retrieval.debug.indexEnvSource,
    fallbackReason: retrieval.fallbackReason
  };
}

function logVerificationFailure(
  failure: Exclude<VerifiedChatResponse, { ok: true }>,
  retrieval: Extract<RetrieveLectureContextResult, { ok: true }>
) {
  if (failure.verificationReason === "schema_validation_failed") {
    logChatEvent("schema_validation_failed", {
      code: failure.code,
      issues: failure.zodError?.issues.map((issue) => issue.path.join("."))
    });
    return;
  }

  logChatEvent("citation_verification_failed", {
    code: failure.code,
    verificationReason: failure.verificationReason,
    retrievalMode: retrieval.retrievalMode,
    retrievedSegmentCount: retrieval.chunks.length
  });
}

function isInsufficientEvidenceAnswer(answer: string) {
  return answer.trim() === INSUFFICIENT_EVIDENCE_ANSWER;
}

function isBroadStudyQuestion(question: string) {
  const normalized = question.trim().toLowerCase();

  return (
    normalized.includes("review before an exam") ||
    normalized.includes("before an exam") ||
    normalized.includes("important ideas") ||
    normalized.includes("important points") ||
    normalized.includes("main ideas") ||
    normalized.includes("main points") ||
    normalized.includes("study for") ||
    normalized.includes("what should i review") ||
    normalized.includes("what should we review") ||
    normalized.includes("what is the video about") ||
    normalized.includes("what are the important")
  );
}

function summarizeChunkText(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= 220) {
    return normalized;
  }

  return `${normalized.slice(0, 217).trim()}...`;
}

function stripCitationPlaceholders(answer: string) {
  return answer
    .replace(/\s*\[(?:citation|citations?|source|sources?)\]\s*/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function mapAIErrorCode(type: string): ChatFailureCode {
  switch (type) {
    case "AI_NOT_CONFIGURED":
      return "AI_NOT_CONFIGURED";
    case "MODEL_TIMEOUT":
      return "MODEL_TIMEOUT";
    case "MODEL_RATE_LIMITED":
      return "MODEL_RATE_LIMITED";
    case "MODEL_BAD_JSON":
      return "MODEL_BAD_JSON";
    case "MODEL_SCHEMA_INVALID":
      return "MODEL_SCHEMA_INVALID";
    case "INSUFFICIENT_EVIDENCE":
      return "INSUFFICIENT_EVIDENCE";
    default:
      return "UNKNOWN";
  }
}

function logChatEvent(event: string, fields: Record<string, unknown> = {}) {
  const safeFields = { ...fields };

  if (!isDebugAIEnabled()) {
    delete safeFields.prompt;
    delete safeFields.evidence;
    delete safeFields.fullTranscript;
  }

  console.info("[chat]", JSON.stringify({ event, ...safeFields }));
}

function isDebugAIEnabled() {
  return process.env.DEBUG_AI === "true";
}
