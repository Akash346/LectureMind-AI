import { generateJson } from "@/lib/ai/azure-openai";
import {
  formatEvidencePacketForPrompt,
  type EvidencePacket
} from "@/lib/ai/evidence-compiler";
import { buildGenerationMessages } from "@/lib/ai/prompts";

export async function runStudyGuideAgent(packet: EvidencePacket) {
  return generateJson({
    modelTier: "strong",
    operation: "study_guide",
    timeoutMs: 120_000,
    messages: buildGenerationMessages({
      artifactType: "STUDY_GUIDE",
      language: packet.preferredLanguage,
      evidenceText: formatEvidencePacketForPrompt(packet),
      guidance: [
        "Produce an exam-focused study guide.",
        "Include key concepts, definitions, formulas only if present, examples, common mistakes, and a review plan.",
        "If examples or common mistakes are not present in the lecture, return an empty array for that field.",
        "Every overview, concept, detail, example, mistake, and review step must include citations."
      ].join("\n")
    })
  });
}
