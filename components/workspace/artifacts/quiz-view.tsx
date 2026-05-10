"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { QuizArtifact } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";

import { CitationList } from "./citation-chip";
import type { CitationProps } from "./types";

export function QuizView({
  artifact,
  evidenceById,
  onSeek
}: {
  artifact: QuizArtifact;
} & Omit<CitationProps, "citations">) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const score = useMemo(
    () =>
      artifact.questions.reduce(
        (total, question, index) =>
          answers[index] === question.correctChoiceId ? total + 1 : total,
        0
      ),
    [answers, artifact.questions]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{artifact.title}</h3>
        <Badge variant="secondary">
          {score}/{artifact.questions.length}
        </Badge>
      </div>
      {artifact.questions.map((question, index) => {
        const selected = answers[index];
        const answered = Boolean(selected);

        return (
          <div className="rounded-md border p-3" key={index}>
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold leading-6">
                {index + 1}. {question.question}
              </p>
              <Badge variant={difficultyVariant(question.difficulty)}>
                {question.difficulty}
              </Badge>
            </div>
            <div className="mt-3 space-y-2">
              {question.choices.map((choice) => {
                const isSelected = selected === choice.id;
                const isCorrect = question.correctChoiceId === choice.id;

                return (
                  <button
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md border bg-background p-2 text-left text-sm transition-colors hover:bg-muted/40",
                      answered &&
                        isCorrect &&
                        "border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-50",
                      answered &&
                        isSelected &&
                        !isCorrect &&
                        "border-red-300 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950 dark:text-red-50"
                    )}
                    disabled={answered}
                    key={choice.id}
                    onClick={() =>
                      setAnswers((current) => ({
                        ...current,
                        [index]: choice.id
                      }))
                    }
                    type="button"
                  >
                    {answered && isCorrect ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <Circle className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <span>
                      <span className="font-semibold">{choice.id}.</span>{" "}
                      {choice.text}
                    </span>
                  </button>
                );
              })}
            </div>
            {answered ? (
              <div className="mt-3 rounded-md bg-muted/30 p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Explanation
                </p>
                <p className="mt-1 text-sm leading-6">{question.explanation}</p>
                <CitationList
                  citations={question.citations}
                  evidenceById={evidenceById}
                  onSeek={onSeek}
                />
              </div>
            ) : null}
          </div>
        );
      })}
      <Button
        className="w-full"
        disabled={Object.keys(answers).length === 0}
        onClick={() => setAnswers({})}
        size="sm"
        variant="outline"
      >
        Reset quiz
      </Button>
    </div>
  );
}

function difficultyVariant(
  difficulty: QuizArtifact["questions"][number]["difficulty"]
): BadgeProps["variant"] {
  if (difficulty === "hard") {
    return "destructive";
  }

  if (difficulty === "medium") {
    return "warning";
  }

  return "success";
}
