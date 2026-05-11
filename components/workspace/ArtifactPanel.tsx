"use client";

import * as React from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useArtifactsStore } from "@/lib/stores/useArtifactsStore";
import { useUIStore } from "@/lib/stores/useUIStore";
import { OutlineView } from "@/components/workspace/artifacts/OutlineView";
import { SummaryView } from "@/components/workspace/artifacts/SummaryView";
import { FlashcardsView } from "@/components/workspace/artifacts/FlashcardsView";
import { QuizView } from "@/components/workspace/artifacts/QuizView";
import { MindMapView } from "@/components/workspace/artifacts/MindMapView";
import { ReportView } from "@/components/workspace/artifacts/ReportView";

type ArtifactPanelProps = {
  chatId: string;
};

export function ArtifactPanel({ chatId }: ArtifactPanelProps) {
  const activeArtifact = useUIStore((state) => state.activeArtifact);
  const setActiveArtifact = useUIStore((state) => state.setActiveArtifact);
  const artifacts = useArtifactsStore((state) => state.artifacts);
  const artifact = activeArtifact ? artifacts[activeArtifact] : null;

  return (
    <AnimatePresence initial={false}>
      {activeArtifact ? (
        <motion.aside
          key="artifact-panel"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 480, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="h-full min-h-0 overflow-hidden border-l border-border/70 bg-background"
        >
          <div className="flex h-full w-[480px] flex-col">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border/70 px-4">
              <h2 className="font-space-grotesk text-lg font-semibold">
                {getArtifactTitle(activeArtifact)}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-xl"
                onClick={() => setActiveArtifact(null)}
                aria-label="Close artifact panel"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeArtifact}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="h-full"
                >
                  {artifact?.status === "generating" ? (
                    <ArtifactLoadingMessage />
                  ) : null}
                  {artifact?.status === "error" ? (
                    <ArtifactStatusMessage
                      message={artifact.error ?? "Generation needs another try."}
                    />
                  ) : null}
                  {artifact?.status !== "generating" &&
                  artifact?.status !== "error" &&
                  activeArtifact === "outline" ? (
                    <OutlineView data={artifacts.outline.data} />
                  ) : null}
                  {artifact?.status !== "generating" &&
                  artifact?.status !== "error" &&
                  activeArtifact === "summary" ? (
                    <SummaryView data={artifacts.summary.data} />
                  ) : null}
                  {artifact?.status !== "generating" &&
                  artifact?.status !== "error" &&
                  activeArtifact === "flashcards" ? (
                    <FlashcardsView data={artifacts.flashcards.data} />
                  ) : null}
                  {artifact?.status !== "generating" &&
                  artifact?.status !== "error" &&
                  activeArtifact === "quiz" ? (
                    <QuizView data={artifacts.quiz.data} />
                  ) : null}
                  {artifact?.status !== "generating" &&
                  artifact?.status !== "error" &&
                  activeArtifact === "mindmap" ? (
                    <MindMapView chatId={chatId} data={artifacts.mindmap.data} />
                  ) : null}
                  {artifact?.status !== "generating" &&
                  artifact?.status !== "error" &&
                  activeArtifact === "report" ? (
                    <ReportView data={artifacts.report.data} />
                  ) : null}
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}

const loadingSteps = [
  "Generating evidence",
  "Building artifact",
  "Checking citations",
  "Saving result"
];

function ArtifactLoadingMessage() {
  const [activeStep, setActiveStep] = React.useState(0);

  React.useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveStep((current) => (current + 1) % loadingSteps.length);
    }, 950);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="flex h-full items-center justify-center p-6 text-center">
      <div className="w-full max-w-xs">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-lm-indigo/10 text-lm-indigo">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
        <div className="mt-5 space-y-2">
          {loadingSteps.map((step, index) => (
            <motion.div
              key={step}
              animate={{
                opacity: index === activeStep ? 1 : 0.45,
                y: index === activeStep ? 0 : 2
              }}
              className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
              transition={{ duration: 0.2 }}
            >
              <span
                className={
                  index === activeStep
                    ? "h-2 w-2 rounded-full bg-lm-indigo"
                    : "h-2 w-2 rounded-full bg-muted-foreground/30"
                }
              />
              <span>{step}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ArtifactStatusMessage({
  icon,
  message
}: {
  icon?: ReactNode;
  message: string;
}) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        {icon}
        <span>{message}</span>
      </div>
    </div>
  );
}

function getArtifactTitle(value: string) {
  if (value === "mindmap") return "Mind Map";
  if (value === "flashcards") return "Flashcards";
  return value.charAt(0).toUpperCase() + value.slice(1);
}
