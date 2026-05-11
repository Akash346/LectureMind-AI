"use client";

import { formatTimestamp } from "@/lib/citations";
import { useCitationHandler } from "@/hooks/useCitationHandler";

type CitationChipProps = {
  seconds: number;
  label?: string;
  className?: string;
};

export function CitationChip({ seconds, label, className }: CitationChipProps) {
  const handleCitation = useCitationHandler();

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        handleCitation(seconds);
      }}
      className={[
        "inline-flex items-center rounded-md border px-1.5 py-0.5 align-baseline font-mono text-[11px] leading-none transition-colors",
        "border-lm-indigo/30 text-lm-indigo hover:bg-lm-indigo/10",
        "dark:text-lm-amber dark:hover:bg-lm-amber/10",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lm-indigo/40",
        className ?? ""
      ].join(" ")}
      aria-label={`Jump to ${label ?? formatTimestamp(seconds)}`}
    >
      {label ?? formatTimestamp(seconds)}
    </button>
  );
}
