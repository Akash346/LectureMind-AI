"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CitedMarkdown } from "@/components/workspace/CitedMarkdown";
import { formatTimestamp } from "@/lib/citations";

function citationText(citations: unknown) {
  if (!Array.isArray(citations)) return "";

  return citations
    .map((citation) => {
      if (!citation || typeof citation !== "object") return null;
      const item = citation as { startSec?: unknown; label?: unknown };
      const seconds =
        typeof item.startSec === "number" ? item.startSec : undefined;
      const label =
        typeof item.label === "string"
          ? item.label
          : seconds !== undefined
            ? formatTimestamp(seconds)
            : null;

      return label ? `[${label}]` : null;
    })
    .filter(Boolean)
    .join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function renderCitedText(item: unknown) {
  const record = isRecord(item) ? item : {};
  return [record.text, citationText(record.citations)].filter(Boolean).join(" ");
}

function studyGuideToMarkdown(data: unknown) {
  if (!isRecord(data)) return "";

  const sections: string[] = [];

  if (data.overview) {
    sections.push(["## Overview", renderCitedText(data.overview)].join("\n"));
  }

  if (Array.isArray(data.keyConcepts) && data.keyConcepts.length > 0) {
    sections.push(
      [
        "## Key concepts",
        ...data.keyConcepts.map((concept) => {
          const record = isRecord(concept) ? concept : {};
          return [
            `### ${asString(record.term)}`,
            record.explanation,
            record.whyItMatters,
            citationText(record.citations)
          ]
            .filter(Boolean)
            .join("\n");
        })
      ].join("\n\n")
    );
  }

  if (Array.isArray(data.importantDetails) && data.importantDetails.length > 0) {
    sections.push(
      [
        "## Important details",
        ...data.importantDetails.map((item) => renderCitedText(item))
      ].join("\n\n")
    );
  }

  if (Array.isArray(data.examples) && data.examples.length > 0) {
    sections.push(
      ["## Examples", ...data.examples.map((item) => renderCitedText(item))].join(
        "\n\n"
      )
    );
  }

  if (Array.isArray(data.commonMistakes) && data.commonMistakes.length > 0) {
    sections.push(
      [
        "## Common mistakes",
        ...data.commonMistakes.map((item) => {
          const record = isRecord(item) ? item : {};
          return [
            `### ${asString(record.mistake)}`,
            record.correction,
            citationText(record.citations)
          ]
            .filter(Boolean)
            .join("\n");
        })
      ].join("\n\n")
    );
  }

  if (Array.isArray(data.reviewPlan) && data.reviewPlan.length > 0) {
    sections.push(
      [
        "## Review plan",
        ...data.reviewPlan.map((item) => {
          const record = isRecord(item) ? item : {};
          return [record.step, citationText(record.citations)]
            .filter(Boolean)
            .join(" ");
        })
      ].join("\n\n")
    );
  }

  return sections.join("\n\n");
}

function getReportText(data: unknown) {
  if (!isRecord(data)) return "";

  return (
    asString(data.markdown) ||
    asString(data.report) ||
    asString(data.content) ||
    asString(data.text) ||
    studyGuideToMarkdown(data)
  );
}

function getHeadings(markdown: string) {
  return markdown
    .split("\n")
    .filter((line) => line.startsWith("## "))
    .map((line) => line.replace(/^##\s*/, "").trim());
}

export function ReportView({ data }: { data: unknown }) {
  const text = getReportText(data);
  const headings = getHeadings(text);

  function downloadMarkdown() {
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "lecturemind-report.md";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!text) {
    return (
      <div className="p-5 text-sm text-muted-foreground">
        Generate a report to see long form notes.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <article className="min-w-0 flex-1 overflow-y-auto p-6">
        <div className="mb-5 flex items-center justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl"
            onClick={downloadMarkdown}
          >
            <Download className="mr-2 h-4 w-4" />
            Export
          </Button>
        </div>

        <CitedMarkdown
          content={text}
          className="mx-auto max-w-[720px] text-base leading-[1.7]"
        />
      </article>

      {headings.length > 5 ? (
        <aside className="hidden w-40 shrink-0 border-l border-border/70 p-4 text-xs text-muted-foreground lg:block">
          <div className="sticky top-4">
            <div className="mb-3 font-space-grotesk text-sm font-semibold text-foreground">
              Contents
            </div>
            <div className="space-y-2">
              {headings.map((heading) => (
                <div key={heading} className="line-clamp-2">
                  {heading}
                </div>
              ))}
            </div>
          </div>
        </aside>
      ) : null}
    </div>
  );
}
