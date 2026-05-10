import { languageNames, type LanguageCode } from "@/lib/ai/schemas";
import type { ChatMode, ChatResponseLength } from "@/lib/chat/chat-schemas";
import type { LectureEvidenceChunk } from "@/lib/retrieval/lecture-retriever";

export function buildChatMessages({
  question,
  language,
  mode,
  responseLength,
  chunks
}: {
  question: string;
  language: LanguageCode;
  mode: ChatMode;
  responseLength: ChatResponseLength;
  chunks: LectureEvidenceChunk[];
}) {
  return [
    {
      role: "system" as const,
      content: buildSystemPrompt({ language, mode, responseLength })
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
  allowedEvidenceIds
}: {
  invalidJson: unknown;
  allowedEvidenceIds: string[];
}) {
  return [
    {
      role: "system" as const,
      content:
        "Repair the assistant response into valid JSON only. Do not add new facts. Use only the allowed evidenceSegmentId values. Return citations as objects with evidenceSegmentId only. If evidence is insufficient, return the safe insufficient-evidence JSON."
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
  mode,
  responseLength
}: {
  language: LanguageCode;
  mode: ChatMode;
  responseLength: ChatResponseLength;
}) {
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
    `If the evidence is insufficient, return exactly: {"answer":"I could not find enough lecture evidence to answer this safely.","citations":[],"followUps":[]}`,
    `Answer language: ${languageNames[language]}. Preserve formulas, code, equations, proper names, timestamps, and evidence IDs exactly.`,
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
