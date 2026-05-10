import {
  type ArtifactType,
  getModelArtifactJsonSchemaDescription,
  languageNames,
  type LanguageCode
} from "@/lib/ai/schemas";

export function buildGenerationMessages({
  artifactType,
  language,
  evidenceText,
  guidance
}: {
  artifactType: ArtifactType;
  language: LanguageCode;
  evidenceText: string;
  guidance: string;
}) {
  return [
    {
      role: "system" as const,
      content: [
        "Role: You are a source-grounded LectureMind study artifact agent.",
        "Task: Generate one NotebookLM-style study artifact from timestamped lecture evidence.",
        "Grounding rules:",
        "- Use only the evidence provided by the user message.",
        "- Do not use outside knowledge.",
        "- Do not invent facts, terminology, examples, formulas, names, dates, or timestamps.",
        "- If something is unclear from the lecture, say it is unclear from the lecture.",
        "- Never cite evidence that was not provided.",
        "- Every major claim must include at least one citation.",
        "Citation rules:",
        "- Use only citationId values from the provided evidence.",
        "- Each citations array must contain only strings like [\"C17\", \"C18\"].",
        "- Do not output evidenceSegmentId.",
        "- Do not output startSec.",
        "- Do not output endSec.",
        "- Do not invent timestamps.",
        "Language rules:",
        `- Generate the final student-facing content in ${languageNames[language]}.`,
        "- Preserve timestamps, source references, evidence IDs, and citation markers unchanged.",
        "- Do not translate URLs.",
        "- Keep equations, code, formulas, proper names, and citation IDs unchanged.",
        "- Preserve technical terms in English when translating would reduce clarity.",
        "- If the source contains English terms, keep important technical terms readable.",
        "Output rules:",
        "- Return valid JSON only.",
        "- No markdown outside the JSON object.",
        `- The JSON language field must be "${language}".`,
        "- Do not include comments or trailing commas."
      ].join("\n")
    },
    {
      role: "user" as const,
      content: [
        `Artifact type: ${artifactType}`,
        "",
        "Output schema:",
        "CitationId = a string from the provided evidence, such as \"C17\".",
        getModelArtifactJsonSchemaDescription(artifactType),
        "",
        "Artifact-specific instructions:",
        guidance,
        "",
        evidenceText
      ].join("\n")
    }
  ];
}

export function buildVerifierMessages({
  artifactType,
  language,
  artifactJson,
  evidenceIndex
}: {
  artifactType: ArtifactType;
  language: LanguageCode;
  artifactJson: unknown;
  evidenceIndex: string;
}) {
  return [
    {
      role: "system" as const,
      content: [
        "Role: You are the LectureMind verifier agent.",
        "Task: Check whether generated study artifact claims are supported by the evidence index.",
        "Rules:",
        "- Flag unsupported factual claims only.",
        "- Do not require external knowledge.",
        "- Do not judge style unless it affects grounding or language.",
        "- Check that citations point to evidence that supports the nearby claim.",
        `- The artifact should be written in ${languageNames[language]} with unchanged citations.`,
        "- Return valid JSON only.",
        "Output schema:",
        "{\"verdict\":\"pass|repair|fail\",\"issues\":[{\"path\":\"json.path\",\"problem\":\"string\",\"suggestedAction\":\"remove|soften|addCitation|regenerate\"}]}"
      ].join("\n")
    },
    {
      role: "user" as const,
      content: [
        `Artifact type: ${artifactType}`,
        "",
        "Evidence index:",
        evidenceIndex,
        "",
        "Artifact JSON:",
        JSON.stringify(artifactJson)
      ].join("\n")
    }
  ];
}

export function buildRepairMessages({
  artifactType,
  language,
  artifactJson,
  evidenceText,
  issues
}: {
  artifactType: ArtifactType;
  language: LanguageCode;
  artifactJson: unknown;
  evidenceText: string;
  issues: unknown;
}) {
  return [
    {
      role: "system" as const,
      content: [
        "Role: You are a LectureMind artifact repair agent.",
        "Task: Repair the JSON artifact so it passes schema and source-grounding checks.",
        "Rules:",
        "- Use only the provided evidence.",
        "- Remove or soften unsupported claims.",
        "- Add citations only with citationId strings from the provided evidence.",
        "- Do not output evidenceSegmentId, startSec, endSec, or invented timestamps.",
        "- Preserve the same artifact schema.",
        `- Generate the final student-facing content in ${languageNames[language]}.`,
        "- Preserve timestamps, source references, evidence IDs, citation markers, URLs, code, formulas, equations, and proper names exactly.",
        "- Keep important technical terms in English when translation would reduce clarity.",
        `- The JSON language field must be "${language}".`,
        "- Return valid JSON only."
      ].join("\n")
    },
    {
      role: "user" as const,
      content: [
        `Artifact type: ${artifactType}`,
        "",
        "Output schema:",
        "CitationId = a string from the provided evidence, such as \"C17\".",
        getModelArtifactJsonSchemaDescription(artifactType),
        "",
        "Verifier issues:",
        JSON.stringify(issues),
        "",
        "Current artifact JSON:",
        JSON.stringify(artifactJson),
        "",
        evidenceText
      ].join("\n")
    }
  ];
}
