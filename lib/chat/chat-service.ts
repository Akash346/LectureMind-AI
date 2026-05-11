import { Prisma } from "@prisma/client";
import type { z } from "zod";

import { generateJson, isAzureOpenAIConfigured } from "@/lib/ai/azure-openai";
import { normalizeAIGenerationError } from "@/lib/ai/errors";
import { formatTimestamp } from "@/lib/ai/evidence-compiler";
import {
  languageNames,
  normalizeArtifactLanguage,
  type LanguageCode
} from "@/lib/ai/schemas";
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

const localizedChatCopy: Record<
  LanguageCode,
  {
    insufficientEvidence: string;
    safeFallbackAnswer: string;
    broadIntro: string;
    followUps: string[];
  }
> = {
  en: {
    insufficientEvidence: INSUFFICIENT_EVIDENCE_ANSWER,
    safeFallbackAnswer:
      "I found relevant lecture moments, but I could not verify a fully grounded answer. Use these cited moments to review the source.",
    broadIntro: "Review these lecture points:",
    followUps: ["Ask me to explain one cited moment.", "Ask for a simpler summary."]
  },
  es: {
    insufficientEvidence:
      "No pude encontrar suficiente evidencia de la clase para responder con seguridad.",
    safeFallbackAnswer:
      "Encontre momentos relevantes de la clase, pero no pude verificar una respuesta completamente fundamentada. Usa estos momentos citados para revisar la fuente.",
    broadIntro: "Repasa estos puntos de la clase:",
    followUps: ["Pideme que explique un momento citado.", "Pide un resumen mas simple."]
  },
  hi: {
    insufficientEvidence:
      "मुझे सुरक्षित रूप से उत्तर देने के लिए पर्याप्त lecture evidence नहीं मिला.",
    safeFallbackAnswer:
      "मुझे lecture के कुछ relevant moments मिले, लेकिन मैं पूरी तरह grounded answer verify नहीं कर सका. Source review करने के लिए इन cited moments का उपयोग करें.",
    broadIntro: "इन lecture points को review करें:",
    followUps: ["किसी एक cited moment को explain करने को कहें.", "एक simpler summary मांगें."]
  },
  te: {
    insufficientEvidence:
      "సురక్షితంగా సమాధానం ఇవ్వడానికి సరిపడా lecture evidence దొరకలేదు.",
    safeFallbackAnswer:
      "Lectureలో సంబంధిత moments దొరికాయి, కానీ పూర్తిగా grounded answerను verify చేయలేకపోయాను. Source review కోసం ఈ cited moments ఉపయోగించండి.",
    broadIntro: "ఈ lecture pointsను review చేయండి:",
    followUps: ["ఒక cited moment explain చేయమని అడగండి.", "సులభమైన summary అడగండి."]
  },
  fr: {
    insufficientEvidence:
      "Je n'ai pas trouve assez d'elements du cours pour repondre de facon sure.",
    safeFallbackAnswer:
      "J'ai trouve des passages pertinents du cours, mais je n'ai pas pu verifier une reponse entierement fondee. Utilise ces passages cites pour revoir la source.",
    broadIntro: "Revise ces points du cours :",
    followUps: ["Demande moi d'expliquer un passage cite.", "Demande un resume plus simple."]
  },
  de: {
    insufficientEvidence:
      "Ich konnte nicht genug Belege aus der Vorlesung finden, um sicher zu antworten.",
    safeFallbackAnswer:
      "Ich habe relevante Stellen in der Vorlesung gefunden, konnte aber keine vollstaendig belegte Antwort pruefen. Nutze diese zitierten Stellen, um die Quelle zu wiederholen.",
    broadIntro: "Wiederhole diese Punkte aus der Vorlesung:",
    followUps: [
      "Bitte erklaere eine zitierte Stelle.",
      "Bitte gib eine einfachere Zusammenfassung."
    ]
  },
  ar: {
    insufficientEvidence:
      "لم أجد أدلة كافية من المحاضرة للإجابة بأمان.",
    safeFallbackAnswer:
      "وجدت مواضع ذات صلة في المحاضرة، لكنني لم أتمكن من التحقق من إجابة مدعومة بالكامل. استخدم هذه المواضع المقتبسة لمراجعة المصدر.",
    broadIntro: "راجع نقاط المحاضرة هذه:",
    followUps: ["اطلب مني شرح موضع مقتبس.", "اطلب ملخصا أبسط."]
  },
  zh: {
    insufficientEvidence: "我没有找到足够的课程证据来安全回答。",
    safeFallbackAnswer:
      "我找到了相关的课程片段，但无法验证一个完全有依据的回答。请用这些引用片段回看来源。",
    broadIntro: "复习这些课程要点：",
    followUps: ["请我解释某个引用片段。", "请求更简单的总结。"]
  }
};

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
    const targetLanguage =
      detectExplicitAnswerLanguage(request.message) ??
      normalizeArtifactLanguage(retrieval.notebook.language);
    const chatCopy = localizedChatCopy[targetLanguage];

    logChatEvent("notebook_validated", {
      notebookId,
      notebookStatus: "READY",
      outputLanguageCode: targetLanguage,
      outputLanguageLabel: languageNames[targetLanguage]
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
        language: targetLanguage,
        insufficientEvidenceAnswer: chatCopy.insufficientEvidence,
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
      chunks: retrieval.chunks,
      insufficientEvidenceAnswer: chatCopy.insufficientEvidence
    });

    if (!verified.ok) {
      logVerificationFailure(verified, retrieval);
      logChatEvent("repair_started", {
        verificationReason: verified.verificationReason
      });

      const repaired = await repairChatResponse({
        candidate: generated.json,
        chunks: retrieval.chunks,
        language: targetLanguage,
        insufficientEvidenceAnswer: chatCopy.insufficientEvidence
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
          retrieval,
          language: targetLanguage
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
            outputLanguageCode: targetLanguage,
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
        retrieval,
        language: targetLanguage
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
            broadQuestionFallback: true,
            outputLanguageCode: targetLanguage
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
          repaired: true,
          outputLanguageCode: targetLanguage
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
      retrieval,
      language: targetLanguage
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
          broadQuestionFallback: true,
          outputLanguageCode: targetLanguage
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
        repaired: false,
        outputLanguageCode: targetLanguage
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
  chunks,
  insufficientEvidenceAnswer = INSUFFICIENT_EVIDENCE_ANSWER
}: {
  candidate: unknown;
  chunks: LectureEvidenceChunk[];
  insufficientEvidenceAnswer?: string;
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
  return verifyParsedChatResponse(parsed.data, chunks, insufficientEvidenceAnswer);
}

export function createSafeCitedFallback({
  chunks,
  retrievalMode,
  model,
  retrieval,
  language = "en"
}: {
  chunks: LectureEvidenceChunk[];
  retrievalMode: ChatSuccessResponse["retrievalMode"];
  model: string;
  retrieval?: Extract<RetrieveLectureContextResult, { ok: true }>;
  language?: LanguageCode;
}): ChatSuccessResponse {
  const topCitationIds = chunks.slice(0, 2).map((chunk) => chunk.evidenceSegmentId);
  const canonical = canonicalizeChatCitations({
    citationIds: topCitationIds,
    chunks
  });

  return {
    answer: localizedChatCopy[language].safeFallbackAnswer,
    citations: canonical.ok ? canonical.citations : [],
    followUps: localizedChatCopy[language].followUps,
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
  retrieval,
  language = "en"
}: {
  question: string;
  response: Pick<ChatSuccessResponse, "answer" | "citations" | "followUps">;
  chunks: LectureEvidenceChunk[];
  retrievalMode: ChatSuccessResponse["retrievalMode"];
  model: string;
  retrieval: Extract<RetrieveLectureContextResult, { ok: true }>;
  language?: LanguageCode;
}) {
  if (
    !isBroadStudyQuestion(question) ||
    !isInsufficientEvidenceAnswer(response.answer, language) ||
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
      localizedChatCopy[language].broadIntro,
      "",
      ...selected.map(
        (chunk) => `- ${chunk.label}: ${summarizeChunkText(chunk.text)}`
      )
    ].join("\n"),
    citations: canonical.citations,
    followUps: localizedChatCopy[language].followUps,
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
  chunks,
  language,
  insufficientEvidenceAnswer
}: {
  candidate: unknown;
  chunks: LectureEvidenceChunk[];
  language: LanguageCode;
  insufficientEvidenceAnswer: string;
}): Promise<VerifiedChatResponse> {
  try {
    const repaired = await generateJson({
      modelTier: "strong",
      operation: "repair_grounded_chat",
      temperature: 0,
      timeoutMs: 60_000,
      messages: buildChatRepairMessages({
        invalidJson: candidate,
        allowedEvidenceIds: chunks.map((chunk) => chunk.evidenceSegmentId),
        language
      })
    });

    return parseAndVerifyChatResponse({
      candidate: repaired.json,
      chunks,
      insufficientEvidenceAnswer
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
  chunks: LectureEvidenceChunk[],
  insufficientEvidenceAnswer = INSUFFICIENT_EVIDENCE_ANSWER
): VerifiedChatResponse {
  if (
    isInsufficientEvidenceAnswer(parsed.answer, undefined, insufficientEvidenceAnswer) &&
    parsed.citations.length === 0
  ) {
    return {
      ok: true,
      response: {
        answer: insufficientEvidenceAnswer,
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

function isInsufficientEvidenceAnswer(
  answer: string,
  language?: LanguageCode,
  expectedAnswer?: string
) {
  const normalized = answer.trim();

  if (expectedAnswer && normalized === expectedAnswer.trim()) {
    return true;
  }

  if (language && normalized === localizedChatCopy[language].insufficientEvidence) {
    return true;
  }

  return (
    normalized === INSUFFICIENT_EVIDENCE_ANSWER ||
    Object.values(localizedChatCopy).some(
      (copy) => normalized === copy.insufficientEvidence
    )
  );
}

function detectExplicitAnswerLanguage(message: string): LanguageCode | null {
  const normalized = message.toLowerCase();
  const asksForLanguage =
    /\b(answer|respond|reply|explain|summarize|write)\b/.test(normalized) &&
    /\bin\b/.test(normalized);

  if (!asksForLanguage) {
    return null;
  }

  for (const [code, label] of Object.entries(languageNames) as Array<
    [LanguageCode, string]
  >) {
    if (normalized.includes(label.toLowerCase())) {
      return code;
    }
  }

  return null;
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
