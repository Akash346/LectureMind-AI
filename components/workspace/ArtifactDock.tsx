"use client";

import {
  CircleHelp,
  FileText,
  ListTree,
  Network,
  PanelsTopLeft,
  ScrollText
} from "lucide-react";

const items = [
  { label: "Outline", Icon: ListTree },
  { label: "Summary", Icon: FileText },
  { label: "Flashcards", Icon: PanelsTopLeft },
  { label: "Quiz", Icon: CircleHelp },
  { label: "Mind Map", Icon: Network },
  { label: "Report", Icon: ScrollText }
];

export function ArtifactDock() {
  return (
    <div className="flex shrink-0 flex-col items-center gap-2 border-l border-black/10 bg-black/[0.02] p-2 dark:border-white/10 dark:bg-white/[0.03]">
      {items.map(({ label, Icon }) => (
        <button
          key={label}
          aria-label={label}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-black/10 bg-lm-paper text-black/35 dark:border-white/10 dark:bg-lm-ink dark:text-white/35"
          title={label}
          type="button"
        >
          <Icon className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}
