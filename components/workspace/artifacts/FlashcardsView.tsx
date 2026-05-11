"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CitationChip } from "@/components/workspace/CitationChip";
import { parseTimestamp } from "@/lib/citations";

type Flashcard = {
  question?: string;
  front?: string;
  answer?: string;
  back?: string;
  timestampSec?: number;
  timestamp?: string;
  citations?: Array<{ startSec?: number; label?: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeCards(data: unknown): Flashcard[] {
  if (Array.isArray(data)) return data;
  if (!isRecord(data)) return [];
  if (Array.isArray(data.cards)) return data.cards as Flashcard[];
  if (Array.isArray(data.flashcards)) return data.flashcards as Flashcard[];
  return [];
}

function getSeconds(card: Flashcard) {
  if (typeof card.timestampSec === "number") return card.timestampSec;
  if (typeof card.timestamp === "string") return parseTimestamp(card.timestamp);
  const citation = card.citations?.[0];
  if (typeof citation?.startSec === "number") return citation.startSec;
  if (typeof citation?.label === "string") return parseTimestamp(`[${citation.label}]`);
  return 0;
}

export function FlashcardsView({ data }: { data: unknown }) {
  const cards = normalizeCards(data);
  const [index, setIndex] = React.useState(0);
  const [flipped, setFlipped] = React.useState(false);

  const card = cards[index];
  const progress = cards.length > 0 ? ((index + 1) / cards.length) * 100 : 0;

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") {
        setIndex((current) => Math.max(0, current - 1));
        setFlipped(false);
      }

      if (event.key === "ArrowRight") {
        setIndex((current) => Math.min(cards.length - 1, current + 1));
        setFlipped(false);
      }

      if (event.key === " ") {
        event.preventDefault();
        setFlipped((current) => !current);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cards.length]);

  if (cards.length === 0 || !card) {
    return (
      <div className="p-5 text-sm text-muted-foreground">
        Generate flashcards to study key ideas.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-5">
      <div className="mb-5">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span>
            Card {index + 1} of {cards.length}
          </span>
          <span className="text-muted-foreground">Tap card to flip</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-lm-indigo transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center">
        <button
          type="button"
          onClick={() => setFlipped((current) => !current)}
          className="flashcard-scene aspect-[3/2] w-full max-w-[360px]"
          aria-label="Flip card"
        >
          <div className="flashcard-inner" data-flipped={flipped}>
            <div className="flashcard-face rounded-3xl bg-lm-indigo p-6 text-lm-paper shadow-xl">
              <div className="text-xs font-medium opacity-80">Question</div>
              <div className="flex h-full items-center justify-center pb-6 text-center font-space-grotesk text-[22px] font-medium leading-tight">
                {card.question ?? card.front}
              </div>
            </div>

            <div className="flashcard-face flashcard-back rounded-3xl bg-lm-amber p-6 text-lm-ink shadow-xl">
              <div className="text-xs font-medium opacity-80">Answer</div>
              <div className="flex h-full items-center justify-center pb-8 text-center text-[17px] leading-7">
                {card.answer ?? card.back}
              </div>
              <div className="absolute bottom-4 right-4">
                <CitationChip seconds={getSeconds(card)} />
              </div>
            </div>
          </div>
        </button>
      </div>

      <div className="mt-5 flex items-center justify-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="rounded-xl"
          disabled={index === 0}
          onClick={() => {
            setIndex((current) => Math.max(0, current - 1));
            setFlipped(false);
          }}
          aria-label="Previous card"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        <Button
          type="button"
          variant="outline"
          className="rounded-xl"
          onClick={() => setFlipped((current) => !current)}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Flip
        </Button>

        <Button
          type="button"
          variant="outline"
          size="icon"
          className="rounded-xl"
          disabled={index === cards.length - 1}
          onClick={() => {
            setIndex((current) => Math.min(cards.length - 1, current + 1));
            setFlipped(false);
          }}
          aria-label="Next card"
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
