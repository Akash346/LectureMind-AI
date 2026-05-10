"use client";

import type { OutlineArtifact } from "@/lib/ai/schemas";

import { CitationList } from "./citation-chip";
import type { CitationProps } from "./types";

export function OutlineView({
  artifact,
  evidenceById,
  onSeek
}: {
  artifact: OutlineArtifact;
} & Omit<CitationProps, "citations">) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">{artifact.title}</h3>
      <div className="space-y-2">
        {artifact.sections.map((section, index) => (
          <details
            className="rounded-md border bg-muted/20 p-3"
            key={`${section.heading}-${index}`}
            open={index < 2}
          >
            <summary className="cursor-pointer text-sm font-semibold">
              {section.heading}
            </summary>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {section.summary}
            </p>
            <CitationList
              citations={section.citations}
              evidenceById={evidenceById}
              onSeek={onSeek}
            />
            {section.children.length > 0 ? (
              <div className="mt-3 space-y-2 border-l pl-3">
                {section.children.map((child, childIndex) => (
                  <div key={`${child.heading}-${childIndex}`}>
                    <p className="text-sm font-medium">{child.heading}</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {child.summary}
                    </p>
                    <CitationList
                      citations={child.citations}
                      evidenceById={evidenceById}
                      onSeek={onSeek}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </details>
        ))}
      </div>
    </div>
  );
}
