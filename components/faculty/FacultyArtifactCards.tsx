"use client";

import type * as React from "react";
import { Accessibility, FileText, Scale } from "lucide-react";

import { useFacultyStore, type FacultyArtifactType } from "@/lib/faculty/store";

const CARDS: Array<{
  type: FacultyArtifactType;
  title: string;
  body: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    type: "improvement",
    title: "Improvement Report",
    body: "Instructional design, clarity, load, and active learning suggestions.",
    Icon: FileText
  },
  {
    type: "bias",
    title: "Bias Report",
    body: "Fairness, inclusion, source diversity, and AI responsibility checks.",
    Icon: Scale
  },
  {
    type: "accessibility",
    title: "Accessibility Report",
    body: "Upload a PDF or DOCX and create an accessible DOCX output.",
    Icon: Accessibility
  }
];

export function FacultyArtifactCards({
  statuses = {}
}: {
  statuses?: Record<string, string | undefined>;
}) {
  const setActiveArtifact = useFacultyStore((state) => state.setActiveArtifact);

  return (
    <aside className="grid gap-3">
      {CARDS.map((card) => {
        const backendType =
          card.type === "improvement"
            ? "improvement_report"
            : card.type === "bias"
              ? "bias_report"
              : "accessibility_report";
        const status = statuses[backendType];
        const loading = status === "running";
        const displayStatus =
          status === "complete"
            ? "ready"
            : status === "failed"
              ? "failed"
              : status === "running"
                ? "running"
                : "idle";

        return (
          <button
            key={card.type}
            type="button"
            onClick={() => setActiveArtifact(card.type)}
            className="group rounded-lg border border-black/10 bg-white/75 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-lm-indigo/30 hover:shadow-md dark:border-white/10 dark:bg-white/[0.05]"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-lm-indigo/10 text-lm-indigo dark:bg-lm-amber/10 dark:text-lm-amber">
                <card.Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-space-grotesk font-semibold">{card.title}</h3>
                <p className="mt-2 text-sm leading-6 text-black/65 dark:text-white/65">
                  {card.body}
                </p>
                {card.type === "accessibility" ? <MistralOcrChip /> : null}
                {loading ? (
                  <div className="mt-3 space-y-2">
                    <div className="h-3 w-full animate-pulse rounded bg-black/10 dark:bg-white/10" />
                    <div className="h-3 w-2/3 animate-pulse rounded bg-black/10 dark:bg-white/10" />
                  </div>
                ) : (
                  <span className="mt-3 inline-flex rounded-full border border-black/10 px-2 py-0.5 text-xs capitalize text-black/55 dark:border-white/10 dark:text-white/55">
                    {displayStatus}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </aside>
  );
}

function MistralOcrChip() {
  return (
    <span
      aria-label="Accessibility OCR powered by Mistral Document AI 2512"
      className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#FA520F]/20 bg-[#FA520F]/5 px-2 py-1 text-xs text-black/70 opacity-70 dark:border-[#FA520F]/30 dark:bg-[#FA520F]/10 dark:text-white/70"
    >
      <svg
        aria-hidden="true"
        className="h-3 w-3 shrink-0"
        viewBox="0 0 16 16"
        fill="none"
      >
        <path
          d="M8.2 1.3c1.8 2.3 4 4.4 4 7.4 0 3-2 5-4.6 5-2.3 0-4.1-1.6-4.1-3.9 0-1.7.9-3.1 2.1-4.4.3 1.2.9 2.1 1.8 2.8-.2-2.4.2-4.6.8-6.9Z"
          fill="url(#mistral-chip-gradient)"
        />
        <path
          d="M8.1 6.1c1 1.2 1.8 2.2 1.8 3.6 0 1.2-.8 2.1-2 2.1-1 0-1.8-.7-1.8-1.8 0-1 .7-1.8 2-3.9Z"
          fill="#FFD2BC"
        />
        <defs>
          <linearGradient
            id="mistral-chip-gradient"
            x1="3.5"
            x2="12.2"
            y1="1.3"
            y2="13.7"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#FA520F" />
            <stop offset="1" stopColor="#C21B1B" />
          </linearGradient>
        </defs>
      </svg>
      <span className="min-w-0 truncate">
        Powered by Mistral OCR (mistral-document-ai-2512)
      </span>
    </span>
  );
}
