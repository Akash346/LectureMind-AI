"use client";

import { CheckCircle2, Circle, Loader2 } from "lucide-react";

export function FacultyProgressTimeline({
  steps,
  activeIndex
}: {
  steps: string[];
  activeIndex: number;
}) {
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        return (
          <li key={step} className="flex items-center gap-3 text-sm">
            {done ? (
              <CheckCircle2 className="h-4 w-4 text-lm-indigo dark:text-lm-amber" />
            ) : active ? (
              <Loader2 className="h-4 w-4 animate-spin text-lm-indigo dark:text-lm-amber" />
            ) : (
              <Circle className="h-4 w-4 text-black/30 dark:text-white/30" />
            )}
            <span className={active ? "font-medium" : "text-black/65 dark:text-white/65"}>
              {step}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
