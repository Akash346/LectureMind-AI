import { describe, expect, it } from "vitest";

import {
  FACULTY_ACCESSIBILITY_REMEDIATION_SYSTEM_PROMPT,
  FACULTY_BIAS_REPORT_SYSTEM_PROMPT,
  FACULTY_IMPROVEMENT_REPORT_SYSTEM_PROMPT
} from "@/lib/faculty/prompts";

describe("faculty prompts", () => {
  it("improvement prompt contains required learning science anchors", () => {
    expect(FACULTY_IMPROVEMENT_REPORT_SYSTEM_PROMPT).toContain(
      "Cognitive Load Theory"
    );
    expect(FACULTY_IMPROVEMENT_REPORT_SYSTEM_PROMPT).toContain(
      "Mayer multimedia learning principles"
    );
    expect(FACULTY_IMPROVEMENT_REPORT_SYSTEM_PROMPT).toContain(
      "Universal Design for Learning"
    );
    expect(FACULTY_IMPROVEMENT_REPORT_SYSTEM_PROMPT).toContain("Active learning");
  });

  it("bias prompt contains all required dimensions", () => {
    for (const dimension of [
      "Representation bias",
      "Language and gendered phrasing",
      "Cultural assumptions",
      "Ableist language",
      "Source diversity",
      "Example diversity",
      "Western centric defaults",
      "AI specific responsibility",
      "Fairness and harm risk"
    ]) {
      expect(FACULTY_BIAS_REPORT_SYSTEM_PROMPT).toContain(dimension);
    }
  });

  it("accessibility prompt contains required WCAG and document structure anchors", () => {
    for (const anchor of [
      "WCAG 2.2 AA",
      "headings",
      "Alt text",
      "Reading order",
      "Tables",
      "Language and plain language"
    ]) {
      expect(FACULTY_ACCESSIBILITY_REMEDIATION_SYSTEM_PROMPT).toContain(anchor);
    }
  });
});
