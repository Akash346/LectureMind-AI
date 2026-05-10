import { generateJson } from "@/lib/ai/azure-openai";
import {
  formatEvidencePacketForPrompt,
  type EvidencePacket
} from "@/lib/ai/evidence-compiler";
import { buildGenerationMessages } from "@/lib/ai/prompts";

export async function runOutlineAgent(packet: EvidencePacket) {
  return generateJson({
    modelTier: "fast",
    operation: "outline",
    messages: buildGenerationMessages({
      artifactType: "OUTLINE",
      language: packet.preferredLanguage,
      evidenceText: formatEvidencePacketForPrompt(packet),
      guidance: [
        "Produce a structured lecture outline.",
        "Use 4 to 8 top-level sections when the lecture is long enough.",
        "Use child sections for subtopics that are clearly supported.",
        "Every top-level section and child section must include citations."
      ].join("\n")
    })
  });
}
