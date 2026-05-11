"use client";

import type { ReactNode } from "react";

import type { StudyGuideArtifact } from "@/lib/ai/schemas";

import { Badge } from "@/components/ui/badge";

import { CitationList } from "./citation-chip";
import type { CitationProps } from "./types";

export function StudyGuideView({
  artifact,
  evidenceById,
  onSeek
}: {
  artifact: StudyGuideArtifact;
} & Omit<CitationProps, "citations">) {
  return (
    <div className="space-y-4">
      <section className="rounded-md border p-3">
        <p className="text-sm font-semibold">{artifact.title}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {artifact.overview.text}
        </p>
        <CitationList
          citations={artifact.overview.citations}
          evidenceById={evidenceById}
          onSeek={onSeek}
        />
      </section>

      <StudyGuideSection title="Key concepts">
        {artifact.keyConcepts.map((concept) => (
          <div className="rounded-md border p-3" key={concept.term}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{concept.term}</p>
              <Badge variant="secondary">Concept</Badge>
            </div>
            <p className="mt-2 text-sm leading-6">{concept.explanation}</p>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {concept.whyItMatters}
            </p>
            <CitationList
              citations={concept.citations}
              evidenceById={evidenceById}
              onSeek={onSeek}
            />
          </div>
        ))}
      </StudyGuideSection>

      <StudyGuideSection title="Important details">
        {artifact.importantDetails.map((item, index) => (
          <CitedTextBlock
            evidenceById={evidenceById}
            item={item}
            key={index}
            onSeek={onSeek}
          />
        ))}
      </StudyGuideSection>

      {artifact.examples.length > 0 ? (
        <StudyGuideSection title="Examples">
          {artifact.examples.map((item, index) => (
            <CitedTextBlock
              evidenceById={evidenceById}
              item={item}
              key={index}
              onSeek={onSeek}
            />
          ))}
        </StudyGuideSection>
      ) : null}

      {artifact.commonMistakes.length > 0 ? (
        <StudyGuideSection title="Common mistakes">
          {artifact.commonMistakes.map((item, index) => (
            <div className="rounded-md border p-3" key={index}>
              <p className="text-sm font-semibold">{item.mistake}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {item.correction}
              </p>
              <CitationList
                citations={item.citations}
                evidenceById={evidenceById}
                onSeek={onSeek}
              />
            </div>
          ))}
        </StudyGuideSection>
      ) : null}

      <StudyGuideSection title="Review first">
        {artifact.reviewPlan.map((item, index) => (
          <div className="rounded-md border p-3" key={index}>
            <p className="text-sm leading-6">{item.step}</p>
            <CitationList
              citations={item.citations}
              evidenceById={evidenceById}
              onSeek={onSeek}
            />
          </div>
        ))}
      </StudyGuideSection>
    </div>
  );
}

function StudyGuideSection({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground">{title}</p>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function CitedTextBlock({
  item,
  evidenceById,
  onSeek
}: {
  item: {
    text: string;
    citations: StudyGuideArtifact["overview"]["citations"];
  };
} & Omit<CitationProps, "citations">) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-sm leading-6">{item.text}</p>
      <CitationList
        citations={item.citations}
        evidenceById={evidenceById}
        onSeek={onSeek}
      />
    </div>
  );
}
