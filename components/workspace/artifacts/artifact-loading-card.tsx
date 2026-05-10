"use client";

import { CheckCircle2, CircleDashed, Loader2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const steps = [
  "Preparing evidence",
  "Generating artifact",
  "Verifying citations",
  "Saving result",
  "Ready"
];

export function ArtifactLoadingCard({ activeStep = 1 }: { activeStep?: number }) {
  return (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      <div className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
      <div className="space-y-2">
        {steps.map((step, index) => {
          const complete = index < activeStep;
          const active = index === activeStep;

          return (
            <div
              className={cn(
                "flex items-center gap-2 text-xs",
                complete || active ? "text-foreground" : "text-muted-foreground"
              )}
              key={step}
            >
              {complete ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              ) : active ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : (
                <CircleDashed className="h-3.5 w-3.5" />
              )}
              {step}
            </div>
          );
        })}
      </div>
    </div>
  );
}
