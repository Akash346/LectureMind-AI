import { describe, expect, it } from "vitest";

import {
  FacultyAccessibilityRemediationSchema,
  FacultyBiasReportSchema,
  FacultyImprovementReportSchema
} from "@/lib/faculty/prompts";

describe("faculty schemas", () => {
  it("accepts valid model JSON", () => {
    expect(
      FacultyImprovementReportSchema.safeParse({
        summary: {
          overall_quality: "Clear but could use more signposting.",
          top_priority: "Add retrieval checks.",
          estimated_revision_effort: "medium"
        },
        sections: [
          {
            section_title: "Clarity",
            findings: [
              {
                finding: "Add a recap",
                severity: "medium",
                evidence_quote: "Today we covered a lot.",
                transcript_anchor: { reference: "C1", timestamp: "0:30" },
                recommended_action: "Add a one-sentence recap.",
                citation_reference: "C1"
              }
            ]
          }
        ]
      }).success
    ).toBe(true);

    expect(
      FacultyBiasReportSchema.safeParse({
        summary: {
          overall_risk: "low",
          main_pattern: "Examples are narrow.",
          recommended_first_fix: "Broaden examples."
        },
        dimensions: [
          {
            dimension: "example_diversity",
            observation: "Only one domain appears.",
            severity: "low",
            evidence_quote: "In Silicon Valley...",
            transcript_anchor: { reference: "C2" },
            suggested_reframing: "Add a public-sector example.",
            external_reference: "NIST AI RMF"
          }
        ]
      }).success
    ).toBe(true);

    expect(
      FacultyAccessibilityRemediationSchema.safeParse({
        document_title: "Accessible Notes",
        language: "en",
        blocks: [{ type: "paragraph", text: "Readable text." }],
        remediation_report: {
          summary: "Converted text into semantic paragraphs.",
          applied_fixes: [],
          human_review_needed: []
        }
      }).success
    ).toBe(true);
  });

  it("rejects missing citations", () => {
    expect(
      FacultyImprovementReportSchema.safeParse({
        summary: {
          overall_quality: "Fine",
          top_priority: "Add examples",
          estimated_revision_effort: "low"
        },
        sections: [
          {
            section_title: "Clarity",
            findings: [
              {
                finding: "Missing citation",
                severity: "low",
                evidence_quote: "Quote",
                transcript_anchor: { reference: "C1" },
                recommended_action: "Fix it."
              }
            ]
          }
        ]
      }).success
    ).toBe(false);
  });
});
