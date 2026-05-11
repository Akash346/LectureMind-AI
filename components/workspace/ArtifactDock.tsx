"use client";

import * as React from "react";
import {
  CircleHelp,
  FileText,
  Layers,
  ListTree,
  Loader2,
  Network,
  ScrollText
} from "lucide-react";

import {
  ARTIFACT_TYPES,
  type ArtifactType,
  useArtifactsStore
} from "@/lib/stores/useArtifactsStore";
import { useUIStore } from "@/lib/stores/useUIStore";
import {
  fetchArtifactResult,
  fetchArtifacts,
  fetchArtifactStatus,
  generateArtifact,
  normalizeArtifactRecords
} from "@/lib/artifact-api";

const ARTIFACT_META: Record<
  ArtifactType,
  {
    label: string;
    Icon: React.ComponentType<{ className?: string }>;
  }
> = {
  outline: { label: "Outline", Icon: ListTree },
  summary: { label: "Summary", Icon: FileText },
  flashcards: { label: "Flashcards", Icon: Layers },
  quiz: { label: "Quiz", Icon: CircleHelp },
  mindmap: { label: "Mind Map", Icon: Network },
  report: { label: "Report", Icon: ScrollText }
};

type ArtifactDockProps = {
  canGenerate?: boolean;
  chatId: string;
  isDemo?: boolean;
  language?: string;
};

export function ArtifactDock({
  canGenerate = true,
  chatId,
  isDemo = false,
  language
}: ArtifactDockProps) {
  const artifacts = useArtifactsStore((state) => state.artifacts);
  const hydrateArtifacts = useArtifactsStore((state) => state.hydrateArtifacts);
  const setArtifactStatus = useArtifactsStore((state) => state.setArtifactStatus);
  const resetArtifacts = useArtifactsStore((state) => state.resetArtifacts);
  const activeArtifact = useUIStore((state) => state.activeArtifact);
  const setActiveArtifact = useUIStore((state) => state.setActiveArtifact);

  const pollArtifact = React.useCallback(
    async (type: ArtifactType) => {
      try {
        const status = await fetchArtifactStatus(chatId, type, language);

        if (status.status === "ready") {
          const data = await fetchArtifactResult(chatId, type, language);
          setArtifactStatus(type, {
            status: "ready",
            data: data?.data ?? data,
            error: null,
            jobId: null
          });
          return;
        }

        setArtifactStatus(type, status);
      } catch {
        setArtifactStatus(type, {
          status: "error",
          error: "Generation needs another try."
        });
      }
    },
    [chatId, language, setArtifactStatus]
  );

  React.useEffect(() => {
    resetArtifacts();

    if (isDemo) {
      hydrateArtifacts({
        outline: {
          status: "ready",
          data: createDemoArtifactData("outline"),
          error: null,
          jobId: null
        },
        summary: {
          status: "ready",
          data: createDemoArtifactData("summary"),
          error: null,
          jobId: null
        },
        flashcards: {
          status: "ready",
          data: createDemoArtifactData("flashcards"),
          error: null,
          jobId: null
        },
        quiz: {
          status: "ready",
          data: createDemoArtifactData("quiz"),
          error: null,
          jobId: null
        },
        mindmap: {
          status: "ready",
          data: createDemoArtifactData("mindmap"),
          error: null,
          jobId: null
        },
        report: {
          status: "ready",
          data: createDemoArtifactData("report"),
          error: null,
          jobId: null
        }
      });
      return;
    }

    let isMounted = true;

    async function loadArtifacts() {
      try {
        const payload = await fetchArtifacts(chatId, language);
        if (!isMounted) return;
        hydrateArtifacts(normalizeArtifactRecords(payload));
      } catch {
        if (!isMounted) return;
      }
    }

    void loadArtifacts();

    return () => {
      isMounted = false;
    };
  }, [chatId, hydrateArtifacts, isDemo, language, resetArtifacts]);

  React.useEffect(() => {
    const generatingTypes = ARTIFACT_TYPES.filter(
      (type) => artifacts[type].status === "generating"
    );

    if (generatingTypes.length === 0 || isDemo) return;

    const interval = window.setInterval(() => {
      for (const type of generatingTypes) {
        void pollArtifact(type);
      }
    }, 3000);

    return () => window.clearInterval(interval);
  }, [artifacts, isDemo, pollArtifact]);

  async function handleClick(type: ArtifactType) {
    const artifact = artifacts[type];

    setActiveArtifact(type);

    if (artifact.status === "ready") {
      return;
    }

    if (artifact.status === "generating") return;

    if (!canGenerate) {
      setArtifactStatus(type, {
        status: "error",
        error: "Transcript evidence is still being prepared."
      });
      return;
    }

    setArtifactStatus(type, {
      status: "generating",
      error: null
    });

    if (isDemo) {
      window.setTimeout(() => {
        setArtifactStatus(type, {
          status: "ready",
          data: createDemoArtifactData(type),
          error: null,
          jobId: null
        });
      }, 900);
      return;
    }

    try {
      const payload = await generateArtifact(chatId, type, language);
      setArtifactStatus(type, {
        status: "generating",
        jobId: payload?.jobId ?? payload?.job_id ?? payload?.job?.id ?? null
      });
    } catch {
      setArtifactStatus(type, {
        status: "error",
        error: "Generation could not start."
      });
    }
  }

  return (
    <aside className="flex h-full w-[60px] shrink-0 flex-col items-center gap-3 border-l border-border/70 bg-background/95 py-4">
      {ARTIFACT_TYPES.map((type) => {
        const artifact = artifacts[type];
        const meta = ARTIFACT_META[type];
        const isActive = activeArtifact === type;
        const isGenerating = artifact.status === "generating";
        const isReady = artifact.status === "ready";

        return (
          <button
            key={type}
            type="button"
            disabled={isGenerating}
            onClick={() => void handleClick(type)}
            title={meta.label}
            aria-label={meta.label}
            className={[
              "group relative flex h-11 w-11 items-center justify-center rounded-2xl border transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lm-indigo/40",
              isReady
                ? "border-lm-indigo/30 bg-lm-indigo/10 text-lm-indigo"
                : "border-border/70 bg-muted/30 text-muted-foreground",
              isActive ? "bg-lm-amber/20 text-lm-amber" : "",
              isGenerating
                ? "artifact-shimmer cursor-not-allowed"
                : "hover:shadow-sm"
            ].join(" ")}
          >
            <meta.Icon className="h-5 w-5" />

            {isGenerating ? (
              <Loader2 className="absolute h-4 w-4 animate-spin text-lm-indigo" />
            ) : null}

            {isReady ? (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-lm-indigo" />
            ) : null}

            <span className="pointer-events-none absolute right-12 z-20 rounded-lg border border-border/70 bg-popover px-2 py-1 text-xs text-popover-foreground opacity-0 shadow-md transition group-hover:opacity-100">
              {meta.label}
            </span>
          </button>
        );
      })}
    </aside>
  );
}

function createDemoArtifactData(type: ArtifactType) {
  switch (type) {
    case "outline":
      return {
        title: "Context in language models",
        sections: [
          {
            heading: "Context window",
            summary:
              "The lecture introduces context as the material a model can use while answering.",
            citations: [{ startSec: 42, label: "0:42" }],
            children: [
              {
                heading: "Attention",
                summary: "Attention helps the model connect related words.",
                citations: [{ startSec: 78, label: "1:18" }]
              }
            ]
          }
        ]
      };
    case "summary":
      return {
        short:
          "The lecture explains how context helps a model connect earlier information with later choices [0:42].",
        medium:
          "The core idea is that useful answers depend on the evidence available in context [0:42]. The lecturer explains that attention helps connect relevant pieces of that context [1:18].",
        full:
          "The lecture frames context as the working material for a model response [0:42]. It then shows how attention links details across the sequence [1:18]."
      };
    case "flashcards":
      return {
        cards: [
          {
            front: "What does context provide?",
            back: "It provides the evidence the model can use while answering.",
            citations: [{ startSec: 42, label: "0:42" }]
          },
          {
            front: "What does attention help with?",
            back: "It helps connect related details across the lecture.",
            citations: [{ startSec: 78, label: "1:18" }]
          }
        ]
      };
    case "quiz":
      return {
        questions: [
          {
            question: "What is the main role of context?",
            choices: [
              { id: "A", text: "Store unrelated facts" },
              { id: "B", text: "Provide usable evidence" },
              { id: "C", text: "Replace the lecture" },
              { id: "D", text: "Remove citations" }
            ],
            correctChoiceId: "B",
            explanation:
              "The lecturer treats context as the source material for the answer [0:42].",
            citations: [{ startSec: 42, label: "0:42" }]
          }
        ]
      };
    case "mindmap":
      return {
        root: {
          id: "root",
          label: "Lecture context",
          timestampSec: 42,
          summary: "The lecture centers on context as usable evidence.",
          children: [
            {
              id: "attention",
              label: "Attention links",
              timestampSec: 78,
              summary: "Attention connects related details.",
              children: [
                {
                  id: "evidence",
                  label: "Grounded answer",
                  timestampSec: 102,
                  summary: "Answers stay tied to lecture evidence.",
                  children: []
                }
              ]
            }
          ]
        }
      };
    case "report":
      return {
        markdown:
          "## Main idea\nContext gives the model usable lecture evidence [0:42].\n\n## Key detail\nAttention helps connect related details across the sequence [1:18]."
      };
  }
}
