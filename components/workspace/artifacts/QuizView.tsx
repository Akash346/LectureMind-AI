"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { CitationChip } from "@/components/workspace/CitationChip";
import { CitedMarkdown } from "@/components/workspace/CitedMarkdown";
import { parseTimestamp } from "@/lib/citations";

type QuizChoice = {
  id?: string;
  text?: string;
};

type QuizQuestion = {
  question?: string;
  prompt?: string;
  options?: string[];
  choices?: Array<string | QuizChoice>;
  correctIndex?: number;
  answerIndex?: number;
  correctAnswerIndex?: number;
  correctChoiceId?: string;
  explanation?: string;
  timestampSec?: number;
  timestamp?: string;
  citations?: Array<{ startSec?: number; label?: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeQuestions(data: unknown): QuizQuestion[] {
  if (Array.isArray(data)) return data;
  if (!isRecord(data)) return [];
  if (Array.isArray(data.questions)) return data.questions as QuizQuestion[];
  if (Array.isArray(data.quiz)) return data.quiz as QuizQuestion[];
  return [];
}

function getOptions(question: QuizQuestion) {
  const raw = question.options ?? question.choices ?? [];

  return raw.map((option) =>
    typeof option === "string" ? option : option.text ?? ""
  );
}

function getCorrectIndex(question: QuizQuestion) {
  if (typeof question.correctIndex === "number") return question.correctIndex;
  if (typeof question.answerIndex === "number") return question.answerIndex;
  if (typeof question.correctAnswerIndex === "number") {
    return question.correctAnswerIndex;
  }

  if (question.correctChoiceId && Array.isArray(question.choices)) {
    const index = question.choices.findIndex(
      (choice) =>
        typeof choice === "object" && choice.id === question.correctChoiceId
    );
    return Math.max(0, index);
  }

  return 0;
}

function getSeconds(question: QuizQuestion) {
  if (typeof question.timestampSec === "number") return question.timestampSec;
  if (typeof question.timestamp === "string") return parseTimestamp(question.timestamp);
  const citation = question.citations?.[0];
  if (typeof citation?.startSec === "number") return citation.startSec;
  if (typeof citation?.label === "string") return parseTimestamp(`[${citation.label}]`);
  return 0;
}

export function QuizView({ data }: { data: unknown }) {
  const questions = normalizeQuestions(data);
  const [index, setIndex] = React.useState(0);
  const [selected, setSelected] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);
  const [answers, setAnswers] = React.useState<Record<number, number>>({});
  const [reviewMode, setReviewMode] = React.useState(false);
  const [scoreMode, setScoreMode] = React.useState(false);

  const question = questions[index];
  const options = question ? getOptions(question) : [];
  const correctIndex = question ? getCorrectIndex(question) : 0;
  const selectedIndex = selected === "" ? -1 : Number(selected);
  const progress =
    questions.length > 0 ? ((index + 1) / questions.length) * 100 : 0;

  if (questions.length === 0 || !question) {
    return (
      <div className="p-5 text-sm text-muted-foreground">
        Generate a quiz to test your understanding.
      </div>
    );
  }

  const score = Object.entries(answers).filter(([questionIndex, answer]) => {
    return getCorrectIndex(questions[Number(questionIndex)]) === answer;
  }).length;

  if (reviewMode) {
    return (
      <div className="h-full overflow-y-auto p-5">
        <Button
          type="button"
          variant="outline"
          className="mb-4 rounded-xl"
          onClick={() => setReviewMode(false)}
        >
          Back to score
        </Button>

        <div className="space-y-4">
          {questions.map((item, questionIndex) => (
            <div
              key={questionIndex}
              className="rounded-2xl border border-border/70 p-4"
            >
              <h3 className="mb-2 font-space-grotesk text-base font-semibold">
                {questionIndex + 1}. {item.question ?? item.prompt}
              </h3>
              <CitedMarkdown content={item.explanation ?? ""} />
              <div className="mt-3">
                <CitationChip seconds={getSeconds(item)} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (scoreMode) {
    const percentage = Math.round((score / questions.length) * 100);
    const missed = questions
      .map((item, questionIndex) => ({ item, questionIndex }))
      .filter(({ item, questionIndex }) => {
        return answers[questionIndex] !== getCorrectIndex(item);
      });

    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <div className="font-space-grotesk text-5xl font-semibold">
          {score} of {questions.length}
        </div>
        <p className="mt-2 text-lg text-muted-foreground">{percentage}%</p>

        <div className="mt-6 w-full rounded-2xl border border-border/70 p-4 text-left">
          <h3 className="mb-3 font-space-grotesk text-base font-semibold">
            Missed questions
          </h3>
          {missed.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Great work. You answered every question correctly.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {missed.map(({ item, questionIndex }) => (
                <li key={questionIndex}>
                  {questionIndex + 1}. {item.question ?? item.prompt}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <Button
            type="button"
            className="rounded-xl bg-lm-indigo text-lm-paper hover:bg-lm-indigo-deep"
            onClick={() => {
              setIndex(0);
              setSelected("");
              setSubmitted(false);
              setAnswers({});
              setScoreMode(false);
            }}
          >
            Retake quiz
          </Button>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => setReviewMode(true)}
          >
            Review explanations
          </Button>
        </div>
      </div>
    );
  }

  function handlePrimaryAction() {
    if (!submitted) {
      setSubmitted(true);
      setAnswers((current) => ({
        ...current,
        [index]: selectedIndex
      }));
      return;
    }

    if (index === questions.length - 1) {
      setScoreMode(true);
      return;
    }

    setIndex((current) => current + 1);
    setSelected("");
    setSubmitted(false);
  }

  return (
    <div className="flex h-full flex-col p-5">
      <div className="mb-5">
        <div className="mb-2 text-sm">
          Question {index + 1} of {questions.length}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-lm-indigo transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <h3 className="mb-5 font-space-grotesk text-xl font-medium">
              {question.question ?? question.prompt}
            </h3>

            <div className="space-y-3">
              {options.map((option, optionIndex) => {
                const isCorrect = submitted && optionIndex === correctIndex;
                const isWrong =
                  submitted &&
                  optionIndex === selectedIndex &&
                  selectedIndex !== correctIndex;

                return (
                  <button
                    key={optionIndex}
                    type="button"
                    disabled={submitted}
                    onClick={() => setSelected(String(optionIndex))}
                    className={[
                      "flex w-full cursor-pointer items-center gap-3 rounded-2xl border p-4 text-left transition",
                      selected === String(optionIndex)
                        ? "border-lm-indigo"
                        : "border-border/70",
                      isCorrect
                        ? "border-green-500 bg-green-500/10"
                        : isWrong
                          ? "border-red-500 bg-red-500/10"
                          : "hover:border-lm-indigo/40"
                    ].join(" ")}
                  >
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-current">
                      {selected === String(optionIndex) ? (
                        <span className="h-2 w-2 rounded-full bg-current" />
                      ) : null}
                    </span>
                    <span className="text-sm leading-6">{option}</span>
                  </button>
                );
              })}
            </div>

            {submitted ? (
              <div className="mt-5 rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="font-space-grotesk text-base font-semibold">
                    Explanation
                  </h4>
                  <CitationChip seconds={getSeconds(question)} />
                </div>
                <CitedMarkdown content={question.explanation ?? ""} />
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      <Button
        type="button"
        disabled={selected === ""}
        onClick={handlePrimaryAction}
        className="mt-5 rounded-xl bg-lm-indigo text-lm-paper hover:bg-lm-indigo-deep"
      >
        {submitted
          ? index === questions.length - 1
            ? "See score"
            : "Next question"
          : "Submit"}
      </Button>
    </div>
  );
}
