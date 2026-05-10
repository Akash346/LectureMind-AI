import { generateJson } from "@/lib/ai/azure-openai";
import {
  formatEvidencePacketForPrompt,
  type EvidencePacket
} from "@/lib/ai/evidence-compiler";
import { buildGenerationMessages } from "@/lib/ai/prompts";

export async function runMindMapAgent(packet: EvidencePacket) {
  return generateJson({
    modelTier: "fast",
    operation: "mind_map",
    messages: buildGenerationMessages({
      artifactType: "MIND_MAP",
      language: packet.preferredLanguage,
      evidenceText: formatEvidencePacketForPrompt(packet),
      guidance: [
        "Produce a readable knowledge map.",
        "Use 8 to 20 nodes when the lecture is long enough.",
        "Use 7 to 25 edges when the relationships are supported.",
        "Nodes must represent concepts, details, or examples from the lecture.",
        "Edges must represent relationships stated or clearly implied by the lecture.",
        "Do not create duplicate labels.",
        "Avoid orphan nodes except the main root if unavoidable.",
        "Every node must include citations."
      ].join("\n")
    })
  });
}
