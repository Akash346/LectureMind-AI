"use client";

import type { ArtifactCitation } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";

import type { StudioEvidence } from "./types";

export function CitationChip({
  citation,
  evidence,
  onSeek,
  className
}: {
  citation: ArtifactCitation;
  evidence?: StudioEvidence;
  onSeek: (seconds: number) => void;
  className?: string;
}) {
  return (
    <button
      className={cn(
        "inline-flex h-6 items-center rounded-full border bg-background px-2 text-[11px] font-semibold text-primary shadow-sm transition-colors hover:bg-primary hover:text-primary-foreground",
        className
      )}
      onClick={() => onSeek(citation.startSec)}
      title={evidence?.text ?? `${citation.startSec}-${citation.endSec}`}
      type="button"
    >
      [{citation.label}]
    </button>
  );
}

export function CitationList({
  citations,
  evidenceById,
  onSeek
}: {
  citations: ArtifactCitation[];
  evidenceById: Map<string, StudioEvidence>;
  onSeek: (seconds: number) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {citations.map((citation, index) => (
        <CitationChip
          citation={citation}
          evidence={evidenceById.get(citation.evidenceSegmentId)}
          key={`${citation.evidenceSegmentId}-${index}`}
          onSeek={onSeek}
        />
      ))}
    </div>
  );
}
