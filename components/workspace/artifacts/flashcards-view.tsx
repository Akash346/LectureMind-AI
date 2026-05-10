"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, RotateCw } from "lucide-react";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { FlashcardsArtifact } from "@/lib/ai/schemas";

import type { CitationProps } from "./types";

export function FlashcardsView({
  artifact
}: {
  artifact: FlashcardsArtifact;
} & Omit<CitationProps, "citations">) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = artifact.cards[index];
  const countLabel = useMemo(
    () => `${index + 1} / ${artifact.cards.length}`,
    [artifact.cards.length, index]
  );

  if (!card) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{artifact.title}</h3>
        <Badge variant="secondary">{countLabel}</Badge>
      </div>
      <button
        className="min-h-44 w-full rounded-md border bg-muted/20 p-4 text-left transition-colors hover:bg-muted/35"
        onClick={() => setFlipped((value) => !value)}
        type="button"
      >
        <div className="flex items-center justify-between gap-2">
          <Badge variant={difficultyVariant(card.difficulty)}>
            {card.difficulty}
          </Badge>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <RotateCw className="h-3.5 w-3.5" />
            Flip
          </span>
        </div>
        <p className="mt-4 text-sm font-semibold leading-6">
          {flipped ? card.back : card.front}
        </p>
      </button>
      <div className="grid grid-cols-2 gap-2">
        <Button
          disabled={index === 0}
          onClick={() => {
            setIndex((value) => Math.max(0, value - 1));
            setFlipped(false);
          }}
          size="sm"
          variant="outline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Previous
        </Button>
        <Button
          disabled={index >= artifact.cards.length - 1}
          onClick={() => {
            setIndex((value) => Math.min(artifact.cards.length - 1, value + 1));
            setFlipped(false);
          }}
          size="sm"
          variant="outline"
        >
          Next
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function difficultyVariant(
  difficulty: FlashcardsArtifact["cards"][number]["difficulty"]
): BadgeProps["variant"] {
  if (difficulty === "hard") {
    return "destructive";
  }

  if (difficulty === "medium") {
    return "warning";
  }

  return "success";
}
