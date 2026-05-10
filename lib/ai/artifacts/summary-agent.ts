import { generateJson } from "@/lib/ai/azure-openai";
import {
  formatEvidencePacketForPrompt,
  type EvidencePacket
} from "@/lib/ai/evidence-compiler";
import { buildGenerationMessages } from "@/lib/ai/prompts";
import type { ArtifactType } from "@/lib/ai/schemas";

export async function runSummaryAgent(
  packet: EvidencePacket,
  artifactType: Extract<ArtifactType, "SUMMARY_SHORT" | "SUMMARY_MEDIUM">
) {
  const isShort = artifactType === "SUMMARY_SHORT";

  return generateJson({
    modelTier: "fast",
    operation: artifactType.toLowerCase(),
    messages: buildGenerationMessages({
      artifactType,
      language: packet.preferredLanguage,
      evidenceText: formatEvidencePacketForPrompt(packet),
      guidance: isShort
        ? [
            "Produce a concise 90-second summary as 5 to 8 bullets.",
            "Each bullet should capture one major lecture idea.",
            "Every bullet must include citations."
          ].join("\n")
        : [
            "Produce a 5-minute summary with clear sections.",
            "Each section should synthesize related evidence without adding outside facts.",
            "Every section must include citations.",
            "Include full study guide handoff notes only when supported by lecture evidence."
          ].join("\n")
    })
  });
}
