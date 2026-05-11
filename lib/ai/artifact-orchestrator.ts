import { Prisma } from "@prisma/client";

import { runMindMapAgent } from "@/lib/ai/artifacts/mind-map-agent";
import { runOutlineAgent } from "@/lib/ai/artifacts/outline-agent";
import { runPracticeAgent } from "@/lib/ai/artifacts/practice-agent";
import { runStudyGuideAgent } from "@/lib/ai/artifacts/study-guide-agent";
import { runSummaryAgent } from "@/lib/ai/artifacts/summary-agent";
import type { GenerateJsonResult } from "@/lib/ai/azure-openai";
import { isAzureOpenAIConfigured } from "@/lib/ai/azure-openai";
import {
  compileEvidencePacketFromChunks,
  type EvidencePacket
} from "@/lib/ai/evidence-compiler";
import {
  AIGenerationError,
  aiErrorCopy,
  normalizeAIGenerationError
} from "@/lib/ai/errors";
import {
  artifactTypes,
  artifactTypeSchema,
  languageNames,
  normalizeArtifactLanguage,
  type ArtifactJson,
  type ArtifactType,
  type LanguageCode
} from "@/lib/ai/schemas";
import { verifyAndRepairArtifact } from "@/lib/ai/verifier";
import { prisma } from "@/lib/prisma";
import { retrieveLectureContext } from "@/lib/retrieval/lecture-retriever";

const MIN_EVIDENCE_SEGMENTS = 2;
const MIN_EVIDENCE_CHARACTERS = 120;

export type SerializedArtifact = {
  id: string;
  notebookId: string;
  type: ArtifactType;
  language: LanguageCode;
  status: "EMPTY" | "GENERATING" | "READY" | "FAILED";
  json: ArtifactJson | null;
  errorType: string | null;
  errorTitle: string | null;
  errorMessage: string | null;
  generatedBy: string | null;
  verifiedAt: string | null;
  sourceSegmentCount: number | null;
  metadata: Record<string, unknown> | null;
  updatedAt: string;
};

export async function listArtifacts({
  notebookId,
  userId,
  language
}: {
  notebookId: string;
  userId: string;
  language: string;
}) {
  const normalizedLanguage = normalizeArtifactLanguage(language);
  const notebook = await prisma.notebook.findFirst({
    where: {
      id: notebookId,
      userId
    },
    select: {
      id: true,
      artifacts: {
        where: { language: normalizedLanguage }
      }
    }
  });

  if (!notebook) {
    return null;
  }

  const byType = new Map(notebook.artifacts.map((item) => [item.type, item]));

  return artifactTypes.map((type) => {
    const artifact = byType.get(type);

    if (artifact) {
      return serializeArtifact(artifact);
    }

    return serializeEmptyArtifact(notebookId, type, normalizedLanguage);
  });
}

export async function generateArtifact({
  notebookId,
  userId,
  artifactType,
  language
}: {
  notebookId: string;
  userId: string;
  artifactType: ArtifactType;
  language: string;
}) {
  const parsedType = artifactTypeSchema.safeParse(artifactType);

  if (!parsedType.success) {
    throw new AIGenerationError({ type: "ARTIFACT_UNKNOWN" });
  }

  const normalizedLanguage = normalizeArtifactLanguage(language);
  const notebook = await prisma.notebook.findFirst({
    where: {
      id: notebookId,
      userId
    },
    select: {
      id: true,
      title: true,
      videoId: true,
      videoTitle: true,
      durationSec: true,
      sourceUrl: true,
      status: true,
      _count: {
        select: {
          evidenceSegments: true
        }
      }
    }
  });

  if (!notebook) {
    return null;
  }

  await prisma.artifact.upsert({
    where: {
      notebookId_type_language: {
        notebookId,
        type: parsedType.data,
        language: normalizedLanguage
      }
    },
    create: {
      notebookId,
      type: parsedType.data,
      language: normalizedLanguage,
      status: "GENERATING",
      json: Prisma.JsonNull,
      errorType: null,
      errorMessage: null,
      generatedBy: null,
      verifiedAt: null,
      sourceSegmentCount: null,
      metadata: Prisma.JsonNull
    },
    update: {
      status: "GENERATING",
      json: Prisma.JsonNull,
      errorType: null,
      errorMessage: null,
      generatedBy: null,
      verifiedAt: null,
      sourceSegmentCount: null,
      metadata: Prisma.JsonNull
    }
  });

  try {
    if (notebook.status !== "READY") {
      throw new AIGenerationError({ type: "INSUFFICIENT_EVIDENCE" });
    }

    if (notebook._count.evidenceSegments < MIN_EVIDENCE_SEGMENTS) {
      throw new AIGenerationError({ type: "INSUFFICIENT_EVIDENCE" });
    }

    if (!isAzureOpenAIConfigured()) {
      throw new AIGenerationError({ type: "AI_NOT_CONFIGURED" });
    }

    const retrieval = await retrieveLectureContext({
      userId,
      notebookId,
      query: buildArtifactRetrievalQuery(parsedType.data),
      topK: getArtifactRetrievalTopK(parsedType.data)
    });

    if (!retrieval.ok) {
      logArtifactRetrieval({
        notebookId,
        artifactType: parsedType.data,
        language: normalizedLanguage,
        source: "local_lexical_fallback",
        resultCount: 0,
        indexedSegmentCount: 0,
        fallbackReason: retrieval.error.code
      });
      throw new AIGenerationError({ type: "INSUFFICIENT_EVIDENCE" });
    }

    logArtifactRetrieval({
      notebookId,
      artifactType: parsedType.data,
      language: normalizedLanguage,
      source: toRetrievalSource(retrieval.retrievalMode),
      resultCount: retrieval.chunks.length,
      indexedSegmentCount: retrieval.debug.indexedSegmentCount,
      fallbackReason: retrieval.fallbackReason
    });

    const packet = compileEvidencePacketFromChunks({
      notebook: {
        id: notebook.id,
        title: notebook.title,
        videoId: notebook.videoId,
        videoTitle: notebook.videoTitle,
        durationSec: notebook.durationSec,
        sourceUrl: notebook.sourceUrl,
        evidenceSourceType: retrieval.chunks[0]?.source ?? null
      },
      chunks: retrieval.chunks,
      artifactType: parsedType.data,
      preferredLanguage: normalizedLanguage
    });

    assertEvidenceIsUsable(packet);

    logArtifactGenerationStarted({
      notebookId,
      artifactType: parsedType.data,
      language: normalizedLanguage,
      evidenceCount: packet.evidenceSegments.length
    });

    const generated = await runAgentForArtifact(parsedType.data, packet);
    const verified = await verifyAndRepairArtifact({
      artifactType: parsedType.data,
      language: normalizedLanguage,
      artifactJson: generated.json,
      packet
    });

    const artifact = await prisma.artifact.update({
      where: {
        notebookId_type_language: {
          notebookId,
          type: parsedType.data,
          language: normalizedLanguage
        }
      },
      data: {
        status: "READY",
        json: verified.json as Prisma.InputJsonValue,
        errorType: null,
        errorMessage: null,
        generatedBy: generated.deployment,
        verifiedAt: new Date(),
        sourceSegmentCount: packet.evidenceSegments.length,
        metadata: {
          outputLanguageCode: normalizedLanguage,
          outputLanguageLabel: languageNames[normalizedLanguage],
          modelDeployment: generated.deployment,
          generationDurationMs: generated.durationMs,
          generationFallbackUsed: generated.fallbackUsed ?? false,
          usage: generated.usage ?? null,
          verifierModelUnavailable: verified.verifierModelUnavailable,
          modelVerifierWarning: verified.modelVerifierWarning,
          verifierIssues: verified.verifierIssues,
          verifierResult: verified.verifierResult,
          repaired: verified.repaired,
          citationFallbackUsed: verified.citationFallbackUsed,
          transcriptStats: packet.transcriptStats,
          retrievalSource: toRetrievalSource(retrieval.retrievalMode),
          retrievalMode: retrieval.retrievalMode,
          retrievalFallbackReason: retrieval.fallbackReason,
          indexedSegmentCount: retrieval.debug.indexedSegmentCount
        } satisfies Prisma.InputJsonValue
      }
    });

    logArtifactGenerationComplete({
      notebookId,
      artifactType: parsedType.data,
      language: normalizedLanguage
    });
    console.info(
      "[ai:artifact]",
      JSON.stringify({
        event: "succeeded",
        notebookId,
        artifactType: parsedType.data,
        outputLanguageCode: normalizedLanguage,
        outputLanguageLabel: languageNames[normalizedLanguage],
        evidenceCount: packet.evidenceSegments.length,
        deployment: generated.deployment
      })
    );

    return serializeArtifact(artifact);
  } catch (error) {
    const safeError = normalizeAIGenerationError(error);
    const artifact = await prisma.artifact.update({
      where: {
        notebookId_type_language: {
          notebookId,
          type: parsedType.data,
          language: normalizedLanguage
        }
      },
      data: {
        status: "FAILED",
        json: Prisma.JsonNull,
        errorType: safeError.type,
        errorMessage: safeError.userMessage,
        generatedBy: null,
        verifiedAt: null,
        sourceSegmentCount: null,
        metadata: {
          errorTitle: safeError.title,
          outputLanguageCode: normalizedLanguage,
          outputLanguageLabel: languageNames[normalizedLanguage]
        } satisfies Prisma.InputJsonValue
      }
    });

    console.info(
      "[ai:artifact]",
      JSON.stringify({
        event: "failed",
        notebookId,
        artifactType: parsedType.data,
        outputLanguageCode: normalizedLanguage,
        outputLanguageLabel: languageNames[normalizedLanguage],
        evidenceCount: notebook._count.evidenceSegments,
        errorType: safeError.type,
        statusCode: safeError.statusCode,
        providerCode: safeError.providerCode
      })
    );

    return serializeArtifact(artifact);
  }
}

export async function generateAllArtifacts({
  notebookId,
  userId,
  language
}: {
  notebookId: string;
  userId: string;
  language: string;
}) {
  const normalizedLanguage = normalizeArtifactLanguage(language);
  const notebook = await prisma.notebook.findFirst({
    where: {
      id: notebookId,
      userId
    },
    select: {
      id: true,
      artifacts: {
        where: {
          language: normalizedLanguage
        }
      }
    }
  });

  if (!notebook) {
    return null;
  }

  const existingByType = new Map(
    notebook.artifacts.map((artifact) => [artifact.type, artifact])
  );
  const results: SerializedArtifact[] = [];

  for (const artifactType of artifactTypes) {
    const existing = existingByType.get(artifactType);

    if (existing?.status === "READY") {
      results.push(serializeArtifact(existing));
      continue;
    }

    const artifact = await generateArtifact({
      notebookId,
      userId,
      artifactType,
      language: normalizedLanguage
    });

    if (!artifact) {
      return null;
    }

    results.push(artifact);
  }

  return results;
}

function logArtifactRetrieval({
  notebookId,
  artifactType,
  language,
  source,
  resultCount,
  indexedSegmentCount,
  fallbackReason
}: {
  notebookId: string;
  artifactType: ArtifactType;
  language: LanguageCode;
  source: "hybrid_search" | "local_lexical_fallback";
  resultCount: number;
  indexedSegmentCount: number;
  fallbackReason: string | null;
}) {
  console.info(
    "[ai:artifact]",
    JSON.stringify({
      event: "artifact_retrieval",
      notebookId,
      artifactType,
      languageCode: language,
      source,
      resultCount,
      indexedSegmentCount,
      fallbackReason
    })
  );
}

function logArtifactGenerationStarted({
  notebookId,
  artifactType,
  language,
  evidenceCount
}: {
  notebookId: string;
  artifactType: ArtifactType;
  language: LanguageCode;
  evidenceCount: number;
}) {
  console.info(
    "[ai:artifact]",
    JSON.stringify({
      event: "artifact_generation_started",
      notebookId,
      artifactType,
      languageCode: language,
      evidenceCount
    })
  );
}

function logArtifactGenerationComplete({
  notebookId,
  artifactType,
  language
}: {
  notebookId: string;
  artifactType: ArtifactType;
  language: LanguageCode;
}) {
  console.info(
    "[ai:artifact]",
    JSON.stringify({
      event: "artifact_generation_complete",
      notebookId,
      artifactType,
      languageCode: language
    })
  );
}

function buildArtifactRetrievalQuery(artifactType: ArtifactType) {
  switch (artifactType) {
    case "OUTLINE":
      return "Create a structured outline from the main lecture topics and transitions.";
    case "SUMMARY_SHORT":
      return "Summarize the most important lecture ideas concisely.";
    case "SUMMARY_MEDIUM":
      return "Summarize the lecture with deeper context, examples, and key details.";
    case "STUDY_GUIDE":
      return "Find the main concepts, definitions, examples, and review points in this lecture.";
    case "FLASHCARDS":
      return "Find important concepts, definitions, comparisons, and facts for flashcards.";
    case "QUIZ":
      return "Find important concepts, distinctions, and facts suitable for quiz questions.";
    case "MIND_MAP":
      return "Find the main concepts and relationships between ideas in this lecture.";
  }
}

function getArtifactRetrievalTopK(artifactType: ArtifactType) {
  return artifactType === "SUMMARY_SHORT" ? 8 : 16;
}

function toRetrievalSource(retrievalMode: string) {
  return retrievalMode === "azure_hybrid"
    ? "hybrid_search"
    : "local_lexical_fallback";
}

async function runAgentForArtifact(
  artifactType: ArtifactType,
  packet: EvidencePacket
): Promise<GenerateJsonResult> {
  switch (artifactType) {
    case "OUTLINE":
      return runOutlineAgent(packet);
    case "SUMMARY_SHORT":
    case "SUMMARY_MEDIUM":
      return runSummaryAgent(packet, artifactType);
    case "STUDY_GUIDE":
      return runStudyGuideAgent(packet);
    case "FLASHCARDS":
    case "QUIZ":
      return runPracticeAgent(packet, artifactType);
    case "MIND_MAP":
      return runMindMapAgent(packet);
  }
}

function assertEvidenceIsUsable(packet: EvidencePacket) {
  if (
    packet.evidenceSegments.length < MIN_EVIDENCE_SEGMENTS ||
    packet.transcriptStats.totalCharacters < MIN_EVIDENCE_CHARACTERS
  ) {
    throw new AIGenerationError({ type: "INSUFFICIENT_EVIDENCE" });
  }

  if (
    packet.transcriptStats.estimatedTokens > packet.maxEvidenceTokensEstimate
  ) {
    throw new AIGenerationError({
      type: "INSUFFICIENT_EVIDENCE",
      technicalMessage:
        "Transcript is too large for the Phase 4 synchronous generation path."
    });
  }
}

function serializeArtifact(artifact: {
  id: string;
  notebookId: string;
  type: string;
  language: string;
  status: string;
  json: Prisma.JsonValue | null;
  errorType?: string | null;
  errorMessage?: string | null;
  generatedBy?: string | null;
  verifiedAt?: Date | null;
  sourceSegmentCount?: number | null;
  metadata?: Prisma.JsonValue | null;
  updatedAt: Date;
}): SerializedArtifact {
  const errorType = artifact.errorType ?? null;
  const copy =
    errorType && errorType in aiErrorCopy
      ? aiErrorCopy[errorType as keyof typeof aiErrorCopy]
      : null;

  return {
    id: artifact.id,
    notebookId: artifact.notebookId,
    type: artifact.type as ArtifactType,
    language: normalizeArtifactLanguage(artifact.language),
    status: artifact.status as SerializedArtifact["status"],
    json:
      artifact.json && typeof artifact.json === "object"
        ? (artifact.json as ArtifactJson)
        : null,
    errorType,
    errorTitle: copy?.title ?? null,
    errorMessage: artifact.errorMessage ?? copy?.message ?? null,
    generatedBy: artifact.generatedBy ?? null,
    verifiedAt: artifact.verifiedAt?.toISOString() ?? null,
    sourceSegmentCount: artifact.sourceSegmentCount ?? null,
    metadata: toRecord(artifact.metadata),
    updatedAt: artifact.updatedAt.toISOString()
  };
}

function serializeEmptyArtifact(
  notebookId: string,
  type: ArtifactType,
  language: LanguageCode
): SerializedArtifact {
  return {
    id: `${notebookId}-${type}-${language}-empty`,
    notebookId,
    type,
    language,
    status: "EMPTY",
    json: null,
    errorType: null,
    errorTitle: null,
    errorMessage: null,
    generatedBy: null,
    verifiedAt: null,
    sourceSegmentCount: null,
    metadata: null,
    updatedAt: new Date(0).toISOString()
  };
}

function toRecord(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
