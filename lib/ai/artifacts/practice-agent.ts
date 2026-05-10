import { generateJson } from "@/lib/ai/azure-openai";
import {
  formatEvidencePacketForPrompt,
  type EvidencePacket
} from "@/lib/ai/evidence-compiler";
import { buildGenerationMessages } from "@/lib/ai/prompts";
import type { ArtifactType } from "@/lib/ai/schemas";

export async function runPracticeAgent(
  packet: EvidencePacket,
  artifactType: Extract<ArtifactType, "FLASHCARDS" | "QUIZ">
) {
  const isQuiz = artifactType === "QUIZ";

  return generateJson({
    modelTier: isQuiz ? "strong" : "fast",
    operation: artifactType.toLowerCase(),
    timeoutMs: isQuiz ? 120_000 : 90_000,
    messages: buildGenerationMessages({
      artifactType,
      language: packet.preferredLanguage,
      evidenceText: formatEvidencePacketForPrompt(packet),
      guidance: isQuiz
        ? [
            "Generate 8 to 12 multiple-choice quiz questions.",
            "Use exactly four choices with IDs A, B, C, and D.",
            "Every question must have a correctChoiceId, explanation, difficulty, and citations.",
            "Avoid questions that require external knowledge.",
            "Avoid trick questions unless the lecture explicitly discusses the misconception.",
            "Every explanation must be source-grounded."
          ].join("\n")
        : [
            "Generate 12 to 20 flashcards depending on lecture length.",
            "For short videos, generate fewer but better cards.",
            "Do not create duplicate cards.",
            "Each back side must cite evidence.",
            "Mix easy, medium, and hard difficulty only when supported by lecture detail."
          ].join("\n")
    })
  });
}
