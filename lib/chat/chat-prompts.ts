import { languageNames, type LanguageCode } from "@/lib/ai/schemas";
import type { ChatMode, ChatResponseLength } from "@/lib/chat/chat-schemas";
import type { LectureEvidenceChunk } from "@/lib/retrieval/lecture-retriever";

export function buildChatMessages({
  question,
  language,
  insufficientEvidenceAnswer,
  mode,
  responseLength,
  chunks
}: {
  question: string;
  language: LanguageCode;
  insufficientEvidenceAnswer: string;
  mode: ChatMode;
  responseLength: ChatResponseLength;
  chunks: LectureEvidenceChunk[];
}) {
  return [
    {
      role: "system" as const,
      content: buildSystemPrompt({
        language,
        insufficientEvidenceAnswer,
        mode,
        responseLength
      })
    },
    {
      role: "user" as const,
      content: [
        "Question:",
        question,
        "",
        `Allowed citation evidenceSegmentId values: ${chunks
          .map((chunk) => chunk.evidenceSegmentId)
          .join(", ")}`,
        "",
        "Retrieved evidence segments:",
        ...chunks.map(formatChunkForPrompt),
        "",
        "Return JSON only with this shape:",
        `{"answer":"string","citations":[{"evidenceSegmentId":"string"}],"followUps":["string"]}`
      ].join("\n")
    }
  ];
}

export function buildChatRepairMessages({
  invalidJson,
  allowedEvidenceIds,
  language
}: {
  invalidJson: unknown;
  allowedEvidenceIds: string[];
  language: LanguageCode;
}) {
  return [
    {
      role: "system" as const,
      content:
        `Repair the assistant response into valid JSON only. Do not add new facts. Use only the allowed evidenceSegmentId values. Return citations as objects with evidenceSegmentId only. Write student-facing text in ${languageNames[language]}. Preserve citations, timestamps, evidence IDs, URLs, code, formulas, equations, and proper names exactly. If evidence is insufficient, return the safe insufficient-evidence JSON.`
    },
    {
      role: "user" as const,
      content: [
        `Allowed evidenceSegmentId values: ${allowedEvidenceIds.join(", ")}`,
        "Invalid response:",
        JSON.stringify(invalidJson)
      ].join("\n")
    }
  ];
}

function buildSystemPrompt({
  language,
  insufficientEvidenceAnswer,
  mode,
  responseLength
}: {
  language: LanguageCode;
  insufficientEvidenceAnswer: string;
  mode: ChatMode;
  responseLength: ChatResponseLength;
}) {
  const languageName = languageNames[language];

  return [
    "You are LectureMind's grounded lecture assistant.",
    "Use only the provided evidence segments for default answers.",
    "Do not use outside knowledge unless the user explicitly asks for it; if outside knowledge is asked for, clearly separate it from lecture-grounded content.",
    "Cite only allowed evidenceSegmentId values from the provided list.",
    "Never invent citation IDs, timestamps, source IDs, examples, formulas, or claims.",
    "Do not cite timestamps directly. The backend will attach canonical timestamps.",
    "Do not put literal placeholders like [citation] or [source] in the answer text; put citations only in the citations array.",
    "For broad study, review, exam, or important-points questions, use representative retrieved evidence to answer unless the evidence is genuinely unrelated.",
    "Every factual lecture claim must be supported by at least one evidenceSegmentId in the citations array.",
    "Each citation item must be an object with exactly one key: evidenceSegmentId.",
    `If the evidence is insufficient, return exactly: {"answer":"${insufficientEvidenceAnswer}","citations":[],"followUps":[]}`,
    `Answer in ${languageName} by default. Use the retrieved lecture evidence only.`,
    "Preserve citations, timestamps, source references, evidence IDs, URLs, formulas, code, equations, and proper names exactly.",
    "Keep important technical terms in English when translation would reduce clarity.",
    `Study mode: ${mode}.`,
    `Response length: ${responseLength}.`,
    "Be concise but useful."
  ].join("\n");
}

function formatChunkForPrompt(chunk: LectureEvidenceChunk) {
  return JSON.stringify({
    evidenceSegmentId: chunk.evidenceSegmentId,
    startSec: chunk.startSec,
    endSec: chunk.endSec,
    label: chunk.label,
    text: chunk.text
  });
}
