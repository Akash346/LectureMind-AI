import { z } from "zod";

import { generateJson } from "@/lib/ai/azure-openai";
import { AIGenerationError, isAIGenerationError } from "@/lib/ai/errors";
import {
  formatEvidenceIndexForPrompt,
  formatEvidencePacketForPrompt,
  formatTimestamp,
  getCitationIdByEvidenceSegmentId,
  getEvidenceByCitationId,
  type CompiledEvidenceSegment,
  type EvidencePacket
} from "@/lib/ai/evidence-compiler";
import { buildRepairMessages, buildVerifierMessages } from "@/lib/ai/prompts";
import {
  getArtifactSchema,
  getModelArtifactSchema,
  parseArtifactJson,
  type ArtifactCitation,
  type ArtifactJson,
  type ArtifactType,
  type LanguageCode,
  type ModelArtifactJson,
  verifierResultSchema,
  type VerifierResult
} from "@/lib/ai/schemas";

const TIMESTAMP_TOLERANCE_SEC = 1.0;

type VerificationReason =
  | "missingCitation"
  | "invalidCitationId"
  | "emptyCitationArray"
  | "timestampMismatch"
  | "schemaInvalid"
  | "verifierModelFail";

type VerificationIssue = {
  path: string;
  problem: string;
  reason: VerificationReason;
  suggestedAction: "remove" | "soften" | "addCitation" | "regenerate";
};

export type VerifiedArtifactResult = {
  json: ArtifactJson;
  verifierResult: VerifierResult | null;
  verifierModelUnavailable: boolean;
  modelVerifierWarning: boolean;
  verifierIssues: VerificationIssue[];
  repaired: boolean;
  citationFallbackUsed: boolean;
};

export async function verifyAndRepairArtifact({
  artifactType,
  language,
  artifactJson,
  packet
}: {
  artifactType: ArtifactType;
  language: LanguageCode;
  artifactJson: unknown;
  packet: EvidencePacket;
}): Promise<VerifiedArtifactResult> {
  let current = artifactJson;
  let repaired = false;
  let citationFallbackUsed = false;
  let lastIssues: VerificationIssue[] = [];

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const normalized = normalizeArtifactCandidate({
      artifactType,
      language,
      artifactJson: current,
      packet
    });
    const parsedModel = getModelArtifactSchema(artifactType).safeParse(
      normalized
    );

    if (!parsedModel.success) {
      const issues = zodIssuesToVerifierIssues(parsedModel.error);
      lastIssues = issues;
      logVerificationIssues("schema", artifactType, language, issues);

      if (!repaired) {
        current = await repairArtifact({
          artifactType,
          language,
          artifactJson: normalized,
          packet,
          issues
        });
        repaired = true;
        continue;
      }

      const fallback = applyFallbackCitationIds(normalized, packet);

      if (fallback.changed) {
        citationFallbackUsed = true;
        current = fallback.json;
        continue;
      }

      throw new AIGenerationError({
        type: "MODEL_SCHEMA_INVALID",
        technicalMessage: JSON.stringify(issues)
      });
    }

    const expansion = expandCitationHandles(parsedModel.data, packet);

    if (expansion.issues.length > 0) {
      lastIssues = expansion.issues;
      logVerificationIssues("citation", artifactType, language, expansion.issues);

      if (!repaired) {
        current = await repairArtifact({
          artifactType,
          language,
          artifactJson: parsedModel.data,
          packet,
          issues: expansion.issues
        });
        repaired = true;
        continue;
      }

      const fallback = applyFallbackCitationIds(parsedModel.data, packet);

      if (fallback.changed) {
        citationFallbackUsed = true;
        current = fallback.json;
        continue;
      }

      throw new AIGenerationError({
        type: "VERIFICATION_FAILED",
        technicalMessage: JSON.stringify(expansion.issues)
      });
    }

    const parsedFinal = getArtifactSchema(artifactType).safeParse(
      expansion.json
    );

    if (!parsedFinal.success) {
      const issues = zodIssuesToVerifierIssues(parsedFinal.error);
      lastIssues = issues;
      logVerificationIssues("schema", artifactType, language, issues);
      throw new AIGenerationError({
        type: "MODEL_SCHEMA_INVALID",
        technicalMessage: JSON.stringify(issues)
      });
    }

    const deterministicIssues = runDeterministicVerification({
      artifactType,
      artifactJson: parsedFinal.data as ArtifactJson,
      packet
    });

    if (deterministicIssues.length > 0) {
      lastIssues = deterministicIssues;
      logVerificationIssues(
        "deterministic",
        artifactType,
        language,
        deterministicIssues
      );
      throw new AIGenerationError({
        type: "VERIFICATION_FAILED",
        technicalMessage: JSON.stringify(deterministicIssues)
      });
    }

    return runAdvisoryModelVerifier({
      artifactType,
      language,
      artifactJson: parsedFinal.data as ArtifactJson,
      packet,
      repaired,
      citationFallbackUsed
    });
  }

  throw new AIGenerationError({
    type: "VERIFICATION_FAILED",
    technicalMessage: JSON.stringify(lastIssues)
  });
}

export function parseStoredArtifact(
  artifactType: ArtifactType,
  json: unknown
) {
  return parseArtifactJson(artifactType, json);
}

function runDeterministicVerification({
  artifactType,
  artifactJson,
  packet
}: {
  artifactType: ArtifactType;
  artifactJson: ArtifactJson;
  packet: EvidencePacket;
}) {
  const issues: VerificationIssue[] = [];
  const evidenceMap = new Map(
    packet.evidenceSegments.map((segment) => [segment.id, segment])
  );

  collectCitations(artifactJson).forEach(({ path, citation }) => {
    const evidence = evidenceMap.get(citation.evidenceSegmentId);

    if (!evidence) {
      issues.push({
        path,
        problem: "Citation evidenceSegmentId does not exist.",
        reason: "invalidCitationId",
        suggestedAction: "addCitation"
      });
      return;
    }

    if (
      Math.abs(citation.startSec - evidence.startSec) >
        TIMESTAMP_TOLERANCE_SEC ||
      Math.abs(citation.endSec - evidence.endSec) > TIMESTAMP_TOLERANCE_SEC
    ) {
      issues.push({
        path,
        problem: "Citation timestamps do not match the EvidenceSegment.",
        reason: "timestampMismatch",
        suggestedAction: "addCitation"
      });
    }
  });

  if (artifactType === "QUIZ" && "questions" in artifactJson) {
    artifactJson.questions.forEach((question, index) => {
      const ids = question.choices.map((choice) => choice.id);

      if (!ids.includes(question.correctChoiceId)) {
        issues.push({
          path: `questions.${index}.correctChoiceId`,
          problem: "Quiz correctChoiceId must match one of the choices.",
          reason: "schemaInvalid",
          suggestedAction: "regenerate"
        });
      }
    });
  }

  if (artifactType === "MIND_MAP" && "nodes" in artifactJson) {
    const nodeIds = new Set(artifactJson.nodes.map((node) => node.id));

    artifactJson.edges.forEach((edge, index) => {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        issues.push({
          path: `edges.${index}`,
          problem: "Mind map edge references an unknown node.",
          reason: "schemaInvalid",
          suggestedAction: "regenerate"
        });
      }
    });
  }

  return issues;
}

async function runAdvisoryModelVerifier({
  artifactType,
  language,
  artifactJson,
  packet,
  repaired,
  citationFallbackUsed
}: {
  artifactType: ArtifactType;
  language: LanguageCode;
  artifactJson: ArtifactJson;
  packet: EvidencePacket;
  repaired: boolean;
  citationFallbackUsed: boolean;
}): Promise<VerifiedArtifactResult> {
  try {
    const verifierResult = await runModelVerifier({
      artifactType,
      language,
      artifactJson,
      packet
    });

    if (verifierResult.verdict === "pass") {
      return {
        json: artifactJson,
        verifierResult,
        verifierModelUnavailable: false,
        modelVerifierWarning: false,
        verifierIssues: [],
        repaired,
        citationFallbackUsed
      };
    }

    const issues = verifierResult.issues.map((issue) => ({
      ...issue,
      reason: "verifierModelFail" as const
    }));
    logVerificationIssues("model", artifactType, language, issues);

    return {
      json: artifactJson,
      verifierResult,
      verifierModelUnavailable: false,
      modelVerifierWarning: true,
      verifierIssues: issues,
      repaired,
      citationFallbackUsed
    };
  } catch (error) {
    if (isAIGenerationError(error)) {
      return {
        json: artifactJson,
        verifierResult: null,
        verifierModelUnavailable: true,
        modelVerifierWarning: false,
        verifierIssues: [],
        repaired,
        citationFallbackUsed
      };
    }

    throw error;
  }
}

async function runModelVerifier({
  artifactType,
  language,
  artifactJson,
  packet
}: {
  artifactType: ArtifactType;
  language: LanguageCode;
  artifactJson: ArtifactJson;
  packet: EvidencePacket;
}) {
  const response = await generateJson({
    modelTier: "strong",
    operation: `verifier_${artifactType.toLowerCase()}`,
    temperature: 0,
    timeoutMs: 120_000,
    messages: buildVerifierMessages({
      artifactType,
      language,
      artifactJson,
      evidenceIndex: formatEvidenceIndexForPrompt(packet)
    })
  });
  const parsed = verifierResultSchema.safeParse(response.json);

  if (!parsed.success) {
    throw new AIGenerationError({
      type: "MODEL_SCHEMA_INVALID",
      technicalMessage: parsed.error.message
    });
  }

  return parsed.data;
}

async function repairArtifact({
  artifactType,
  language,
  artifactJson,
  packet,
  issues
}: {
  artifactType: ArtifactType;
  language: LanguageCode;
  artifactJson: unknown;
  packet: EvidencePacket;
  issues: unknown;
}) {
  const response = await generateJson({
    modelTier: "strong",
    operation: `repair_${artifactType.toLowerCase()}`,
    temperature: 0,
    timeoutMs: 120_000,
    messages: buildRepairMessages({
      artifactType,
      language,
      artifactJson,
      evidenceText: formatEvidencePacketForPrompt(packet),
      issues
    })
  });

  return response.json;
}

function normalizeArtifactCandidate({
  artifactType,
  language,
  artifactJson,
  packet
}: {
  artifactType: ArtifactType;
  language: LanguageCode;
  artifactJson: unknown;
  packet: EvidencePacket;
}) {
  if (!isRecord(artifactJson)) {
    return artifactJson;
  }

  switch (artifactType) {
    case "OUTLINE":
      return {
        title: getString(artifactJson.title, "Structured Outline"),
        language,
        sections: getArray(artifactJson.sections).map((section) => ({
          heading: getString(getRecordValue(section, "heading"), "Section"),
          summary: getString(getRecordValue(section, "summary"), ""),
          citations: normalizeCitationIdArray(
            getRecordValue(section, "citations"),
            packet
          ),
          children: getArray(getRecordValue(section, "children")).map(
            (child) => ({
              heading: getString(getRecordValue(child, "heading"), "Topic"),
              summary: getString(getRecordValue(child, "summary"), ""),
              citations: normalizeCitationIdArray(
                getRecordValue(child, "citations"),
                packet
              )
            })
          )
        }))
      };
    case "SUMMARY_SHORT":
      return {
        title: getString(artifactJson.title, "90-second summary"),
        language,
        bullets: getArray(artifactJson.bullets).map((bullet) => ({
          text: getString(getRecordValue(bullet, "text"), ""),
          citations: normalizeCitationIdArray(
            getRecordValue(bullet, "citations"),
            packet
          )
        }))
      };
    case "SUMMARY_MEDIUM":
      return {
        title: getString(artifactJson.title, "5-minute summary"),
        language,
        sections: getArray(artifactJson.sections).map((section) => ({
          heading: getString(getRecordValue(section, "heading"), "Section"),
          text: getString(getRecordValue(section, "text"), ""),
          citations: normalizeCitationIdArray(
            getRecordValue(section, "citations"),
            packet
          )
        }))
      };
    case "STUDY_GUIDE":
      return {
        title: getString(artifactJson.title, "Study Guide"),
        language,
        overview: normalizeCitedTextItem(artifactJson.overview, packet),
        keyConcepts: getArray(artifactJson.keyConcepts).map((concept) => ({
          term: getString(getRecordValue(concept, "term"), "Concept"),
          explanation: getString(getRecordValue(concept, "explanation"), ""),
          whyItMatters: getString(getRecordValue(concept, "whyItMatters"), ""),
          citations: normalizeCitationIdArray(
            getRecordValue(concept, "citations"),
            packet
          )
        })),
        importantDetails: getArray(artifactJson.importantDetails).map((item) =>
          normalizeCitedTextItem(item, packet)
        ),
        examples: getArray(artifactJson.examples).map((item) =>
          normalizeCitedTextItem(item, packet)
        ),
        commonMistakes: getArray(artifactJson.commonMistakes).map((mistake) => ({
          mistake: getString(getRecordValue(mistake, "mistake"), ""),
          correction: getString(getRecordValue(mistake, "correction"), ""),
          citations: normalizeCitationIdArray(
            getRecordValue(mistake, "citations"),
            packet
          )
        })),
        reviewPlan: getArray(artifactJson.reviewPlan).map((step) => ({
          step: getString(getRecordValue(step, "step"), ""),
          citations: normalizeCitationIdArray(
            getRecordValue(step, "citations"),
            packet
          )
        }))
      };
    case "FLASHCARDS":
      return {
        title: getString(artifactJson.title, "Flashcards"),
        language,
        cards: dedupeBy(
          getArray(artifactJson.cards)
            .map((card) => ({
              front: getString(getRecordValue(card, "front"), ""),
              back: getString(getRecordValue(card, "back"), ""),
              difficulty: normalizeDifficulty(getRecordValue(card, "difficulty")),
              citations: normalizeCitationIdArray(
                getRecordValue(card, "citations"),
                packet
              )
            }))
            .filter((card) => card.front && card.back),
          (card) => card.front.toLowerCase()
        ).slice(0, 20)
      };
    case "QUIZ":
      return {
        title: getString(artifactJson.title, "Quiz"),
        language,
        questions: getArray(artifactJson.questions)
          .map((question) => normalizeQuizQuestion(question, packet))
          .filter((question) => question.question && question.choices.length === 4)
          .slice(0, 12)
      };
    case "MIND_MAP":
      return normalizeMindMapArtifact(artifactJson, language, packet);
  }
}

function normalizeCitedTextItem(value: unknown, packet: EvidencePacket) {
  return {
    text: getString(getRecordValue(value, "text"), ""),
    citations: normalizeCitationIdArray(getRecordValue(value, "citations"), packet)
  };
}

function normalizeQuizQuestion(question: unknown, packet: EvidencePacket) {
  const choices = getArray(getRecordValue(question, "choices"))
    .slice(0, 4)
    .map((choice, index) => ({
      id: normalizeChoiceId(getRecordValue(choice, "id"), index),
      text:
        typeof choice === "string"
          ? choice.trim()
          : getString(getRecordValue(choice, "text"), "")
    }));
  const validChoiceIds = new Set(choices.map((choice) => choice.id));
  const requestedCorrectChoiceId = normalizeChoiceId(
    getRecordValue(question, "correctChoiceId"),
    0
  );

  return {
    question: getString(getRecordValue(question, "question"), ""),
    choices,
    correctChoiceId: validChoiceIds.has(requestedCorrectChoiceId)
      ? requestedCorrectChoiceId
      : choices[0]?.id ?? "A",
    explanation: getString(getRecordValue(question, "explanation"), ""),
    difficulty: normalizeDifficulty(getRecordValue(question, "difficulty")),
    citations: normalizeCitationIdArray(
      getRecordValue(question, "citations"),
      packet
    )
  };
}

function normalizeMindMapArtifact(
  artifactJson: Record<string, unknown>,
  language: LanguageCode,
  packet: EvidencePacket
) {
  const nodes = dedupeBy(
    getArray(artifactJson.nodes)
      .map((node, index) => ({
        id: getString(getRecordValue(node, "id"), `node-${index + 1}`),
        label: getString(getRecordValue(node, "label"), ""),
        type: normalizeNodeType(getRecordValue(node, "type"), index),
        citations: normalizeCitationIdArray(
          getRecordValue(node, "citations"),
          packet
        )
      }))
      .filter((node) => node.label),
    (node) => node.label.toLowerCase()
  ).slice(0, 20);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const existingEdges = getArray(artifactJson.edges)
    .filter(isRecord)
    .map((edge) => ({
      source: getString(getRecordValue(edge, "source"), ""),
      target: getString(getRecordValue(edge, "target"), ""),
      label: getString(getRecordValue(edge, "label"), "relates to")
    }))
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  const connected = new Set<string>();

  existingEdges.forEach((edge) => {
    connected.add(edge.source);
    connected.add(edge.target);
  });

  const root = nodes.find((node) => node.type === "main") ?? nodes[0];
  const rootId = root?.id ?? "node-1";
  const repairedEdges = [...existingEdges];

  nodes.forEach((node) => {
    if (node.id === rootId || connected.has(node.id)) {
      return;
    }

    repairedEdges.push({
      source: rootId,
      target: node.id,
      label: "relates to"
    });
  });

  return {
    title: getString(artifactJson.title, "Knowledge Map"),
    language,
    nodes,
    edges: repairedEdges.slice(0, 25)
  };
}

function normalizeCitationIdArray(value: unknown, packet: EvidencePacket) {
  const citationByEvidenceId = getCitationIdByEvidenceSegmentId(packet);

  return dedupeBy(
    getArray(value)
      .map((citation) => resolveCitationHandle(citation, packet, citationByEvidenceId))
      .filter((citationId): citationId is string => Boolean(citationId)),
    (citationId) => citationId
  ).slice(0, 4);
}

function resolveCitationHandle(
  citation: unknown,
  packet: EvidencePacket,
  citationByEvidenceId: Map<string, string>
) {
  if (typeof citation === "string") {
    return normalizeCitationHandle(citation);
  }

  if (!isRecord(citation)) {
    return null;
  }

  const explicitHandle =
    normalizeCitationHandle(citation.citationId) ??
    normalizeCitationHandle(citation.handle) ??
    normalizeCitationHandle(citation.id);

  if (explicitHandle) {
    return explicitHandle;
  }

  const evidenceSegmentId = getString(
    citation.evidenceSegmentId ??
      citation.evidenceId ??
      citation.segmentId ??
      citation.id,
    ""
  );
  const byEvidenceId = citationByEvidenceId.get(evidenceSegmentId);

  if (byEvidenceId) {
    return byEvidenceId;
  }

  const timestamp =
    getNumber(citation.startSec, -1) >= 0
      ? getNumber(citation.startSec, -1)
      : parseTimestamp(getString(citation.label ?? citation.timestamp, ""));
  const byTimestamp =
    timestamp >= 0
      ? findEvidenceByTimestamp(timestamp, packet.evidenceSegments)
      : null;

  return byTimestamp?.citationId ?? null;
}

function normalizeCitationHandle(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return /^C[1-9]\d*$/.test(trimmed) ? trimmed : null;
}

function expandCitationHandles(
  modelJson: ModelArtifactJson,
  packet: EvidencePacket
) {
  const clone = cloneJson(modelJson);
  const evidenceByCitationId = getEvidenceByCitationId(packet);
  const issues: VerificationIssue[] = [];

  walk(clone, (value, key, parent, path) => {
    if (key !== "citations" || !Array.isArray(value) || !parent) {
      return;
    }

    const expanded = value
      .map((citationId, index) => {
        if (typeof citationId !== "string") {
          issues.push({
            path: `${path}.${index}`,
            problem: "Citation must be a citationId string.",
            reason: "invalidCitationId",
            suggestedAction: "addCitation"
          });
          return null;
        }

        const evidence = evidenceByCitationId.get(citationId);

        if (!evidence) {
          issues.push({
            path: `${path}.${index}`,
            problem: `Citation ${citationId} was not provided in evidence.`,
            reason: "invalidCitationId",
            suggestedAction: "addCitation"
          });
          return null;
        }

        return makeCitation(evidence);
      })
      .filter((citation): citation is ArtifactCitation => Boolean(citation));

    if (expanded.length === 0) {
      issues.push({
        path,
        problem: "Citation array is empty after resolving citation IDs.",
        reason: "emptyCitationArray",
        suggestedAction: "addCitation"
      });
    }

    (parent as Record<string, unknown>)[key] = dedupeBy(
      expanded,
      (citation) => citation.evidenceSegmentId
    );
  });

  return { json: clone, issues };
}

function applyFallbackCitationIds(artifactJson: unknown, packet: EvidencePacket) {
  const clone = cloneJson(artifactJson);
  let changed = false;
  let fallbackIndex = 0;
  const evidenceByCitationId = getEvidenceByCitationId(packet);

  walk(clone, (value, key, parent) => {
    if (key !== "citations" || !Array.isArray(value) || !parent) {
      return;
    }

    const validCitationIds = dedupeBy(
      value
        .map((citation) =>
          typeof citation === "string" && evidenceByCitationId.has(citation)
            ? citation
            : null
        )
        .filter((citationId): citationId is string => Boolean(citationId)),
      (citationId) => citationId
    );

    if (validCitationIds.length > 0) {
      if (validCitationIds.length !== value.length) {
        (parent as Record<string, unknown>)[key] = validCitationIds;
        changed = true;
      }
      return;
    }

    const parentRecord = Array.isArray(parent)
      ? null
      : (parent as Record<string, unknown>);
    const context = parentRecord ? getCitationContext(parentRecord) : "";
    const fallbackSegment =
      findBestEvidenceForText(context, packet.evidenceSegments) ??
      packet.evidenceSegments[fallbackIndex % packet.evidenceSegments.length];

    if (!fallbackSegment) {
      return;
    }

    fallbackIndex += 1;
    (parent as Record<string, unknown>)[key] = [fallbackSegment.citationId];
    changed = true;
  });

  return { json: clone, changed };
}

function findEvidenceByTimestamp(
  timestamp: number,
  segments: CompiledEvidenceSegment[]
) {
  let best: CompiledEvidenceSegment | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const segment of segments) {
    const inside =
      timestamp >= segment.startSec - 1 && timestamp <= segment.endSec + 1;
    const distance = inside
      ? 0
      : Math.min(
          Math.abs(timestamp - segment.startSec),
          Math.abs(timestamp - segment.endSec)
        );

    if (distance < bestDistance) {
      best = segment;
      bestDistance = distance;
    }
  }

  return bestDistance <= 8 ? best : null;
}

function findBestEvidenceForText(
  text: string,
  segments: CompiledEvidenceSegment[]
) {
  const queryTerms = getSearchTerms(text);

  if (queryTerms.length === 0) {
    return null;
  }

  let best: CompiledEvidenceSegment | null = null;
  let bestScore = 0;

  for (const segment of segments) {
    const segmentText = segment.text.toLowerCase();
    const score = queryTerms.reduce(
      (total, term) => total + (segmentText.includes(term) ? 1 : 0),
      0
    );

    if (score > bestScore) {
      best = segment;
      bestScore = score;
    }
  }

  return bestScore >= Math.min(2, queryTerms.length) ? best : null;
}

function getCitationContext(parent: Record<string, unknown>) {
  return [
    parent.heading,
    parent.summary,
    parent.text,
    parent.term,
    parent.explanation,
    parent.whyItMatters,
    parent.front,
    parent.back,
    parent.question,
    parent.mistake,
    parent.correction,
    parent.step,
    parent.label
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

function makeCitation(segment: CompiledEvidenceSegment): ArtifactCitation {
  return {
    evidenceSegmentId: segment.id,
    startSec: segment.startSec,
    endSec: segment.endSec,
    label: segment.label || formatTimestamp(segment.startSec)
  };
}

function parseTimestamp(value: string) {
  const parts = value
    .replace(/[\[\]]/g, "")
    .split(":")
    .map((part) => Number(part.trim()));

  if (parts.some((part) => !Number.isFinite(part))) {
    return -1;
  }

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return -1;
}

function getSearchTerms(text: string) {
  const stopWords = new Set([
    "about",
    "after",
    "again",
    "also",
    "because",
    "before",
    "being",
    "between",
    "could",
    "every",
    "from",
    "have",
    "into",
    "just",
    "like",
    "more",
    "that",
    "their",
    "there",
    "these",
    "this",
    "through",
    "what",
    "when",
    "where",
    "which",
    "while",
    "with",
    "would",
    "your"
  ]);

  return Array.from(
    new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((term) => term.length >= 4 && !stopWords.has(term))
    )
  ).slice(0, 14);
}

function collectCitations(json: unknown) {
  const citations: Array<{
    path: string;
    citation: ArtifactCitation;
  }> = [];

  walk(json, (value, key, _parent, path) => {
    if (key !== "citations" || !Array.isArray(value)) {
      return;
    }

    value.forEach((citation, index) => {
      const parsed = z
        .object({
          evidenceSegmentId: z.string(),
          startSec: z.number(),
          endSec: z.number(),
          label: z.string()
        })
        .safeParse(citation);

      if (parsed.success) {
        citations.push({
          path: `${path}.${index}`,
          citation: parsed.data
        });
      }
    });
  });

  return citations;
}

function zodIssuesToVerifierIssues(error: z.ZodError) {
  return error.issues.map((issue) => {
    const path = issue.path.join(".") || "root";

    return {
      path,
      problem: issue.message,
      reason: zodIssueReason(issue, path),
      suggestedAction: "regenerate" as const
    };
  });
}

function zodIssueReason(issue: z.ZodIssue, path: string): VerificationReason {
  if (path.endsWith("citations")) {
    if (issue.code === "too_small") {
      return "emptyCitationArray";
    }

    return "missingCitation";
  }

  if (path.includes("citations")) {
    return "invalidCitationId";
  }

  return "schemaInvalid";
}

function logVerificationIssues(
  phase: string,
  artifactType: ArtifactType,
  language: LanguageCode,
  issues: VerificationIssue[]
) {
  console.info(
    "[ai:verifier]",
    JSON.stringify({
      event: "issues",
      phase,
      artifactType,
      language,
      issueCount: issues.length,
      issues: issues.slice(0, 10).map((issue) => ({
        reason: issue.reason,
        path: issue.path,
        problem: issue.problem
      }))
    })
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getRecordValue(value: unknown, key: string) {
  return isRecord(value) ? value[key] : undefined;
}

function getArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function getString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function normalizeDifficulty(value: unknown) {
  return value === "easy" || value === "medium" || value === "hard"
    ? value
    : "medium";
}

function normalizeChoiceId(value: unknown, index: number) {
  if (value === "A" || value === "B" || value === "C" || value === "D") {
    return value;
  }

  return (["A", "B", "C", "D"][index] ?? "A") as "A" | "B" | "C" | "D";
}

function normalizeNodeType(value: unknown, index: number) {
  if (
    value === "main" ||
    value === "concept" ||
    value === "detail" ||
    value === "example"
  ) {
    return value;
  }

  return index === 0 ? "main" : "concept";
}

function dedupeBy<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const key = getKey(item);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

function walk(
  value: unknown,
  visitor: (
    value: unknown,
    key: string,
    parent: Record<string, unknown> | unknown[] | null,
    path: string
  ) => void,
  key = "",
  parent: Record<string, unknown> | unknown[] | null = null,
  path = "root"
) {
  visitor(value, key, parent, path);

  if (!value || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      walk(item, visitor, String(index), value, `${path}.${index}`);
    });
    return;
  }

  Object.entries(value as Record<string, unknown>).forEach(
    ([childKey, childValue]) => {
      walk(
        childValue,
        visitor,
        childKey,
        value as Record<string, unknown>,
        path === "root" ? childKey : `${path}.${childKey}`
      );
    }
  );
}

function cloneJson<T>(value: T): T {
  if (value === undefined) {
    return value;
  }

  return JSON.parse(JSON.stringify(value)) as T;
}
