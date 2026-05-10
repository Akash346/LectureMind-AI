"use client";

import { AlertTriangle, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

export function ArtifactErrorCard({
  title,
  message,
  onRetry,
  disabled
}: {
  title?: string | null;
  message?: string | null;
  onRetry: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-md border border-red-200 bg-red-50 p-3 text-red-950 dark:border-red-900 dark:bg-red-950 dark:text-red-50">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {title ?? "Artifact generation failed."}
          </p>
          <p className="mt-1 text-xs leading-5 text-red-800 dark:text-red-200">
            {message ?? "Try again. Your transcript evidence is still saved."}
          </p>
        </div>
      </div>
      <Button
        className="mt-3 w-full justify-start"
        disabled={disabled}
        onClick={onRetry}
        size="sm"
        variant="outline"
      >
        <RotateCw className="h-3.5 w-3.5" />
        Retry
      </Button>
    </div>
  );
}
