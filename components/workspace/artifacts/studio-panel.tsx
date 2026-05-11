"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import {
  BrainCircuit,
  FileText,
  Layers3,
  ListChecks,
  Loader2,
  Network,
  Play,
  RotateCw,
  Sparkles
} from "lucide-react";

import { ArtifactErrorCard } from "@/components/workspace/artifacts/artifact-error-card";
import { ArtifactLoadingCard } from "@/components/workspace/artifacts/artifact-loading-card";
import { FlashcardsView } from "@/components/workspace/artifacts/flashcards-view";
import { MindMapView } from "@/components/workspace/artifacts/mind-map-view";
import { OutlineView } from "@/components/workspace/artifacts/outline-view";
import { QuizView } from "@/components/workspace/artifacts/quiz-view";
import { StudyGuideView } from "@/components/workspace/artifacts/study-guide-view";
import { SummaryView } from "@/components/workspace/artifacts/summary-view";
import type {
  StudioArtifact,
  StudioEvidence
} from "@/components/workspace/artifacts/types";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  artifactTypes,
  languageNames,
  type ArtifactType,
  type FlashcardsArtifact,
  type MediumSummaryArtifact,
  type MindMapArtifact,
  normalizeArtifactLanguage,
  type OutlineArtifact,
  type QuizArtifact,
  type ShortSummaryArtifact,
  type StudyGuideArtifact
} from "@/lib/ai/schemas";

type NotebookStatus = "DRAFT" | "PENDING" | "PROCESSING" | "READY" | "FAILED";
type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

const artifactStatusLabel: Record<StudioArtifact["status"], string> = {
  EMPTY: "Empty",
  GENERATING: "Generating",
  READY: "Ready",
  FAILED: "Failed"
};

type JobPayload = {
  id: string;
  status: JobStatus;
  errorCode?: string | null;
  safeErrorMessage?: string | null;
  errorMessage?: string | null;
};

const artifactCopy: Record<
  ArtifactType,
  {
    title: string;
    description: string;
    icon: typeof Layers3;
  }
> = {
  OUTLINE: {
    title: "Structured Outline",
    description: "Chapter-style lecture structure with cited sections.",
    icon: Layers3
  },
  SUMMARY_SHORT: {
    title: "90-second Summary",
    description: "A quick cited pass over the lecture.",
    icon: FileText
  },
  SUMMARY_MEDIUM: {
    title: "5-minute Summary",
    description: "A deeper cited section summary.",
    icon: FileText
  },
  STUDY_GUIDE: {
    title: "Study Guide",
    description: "Exam-focused concepts, examples, mistakes, and review plan.",
    icon: BrainCircuit
  },
  FLASHCARDS: {
    title: "Flashcards",
    description: "Cited active-recall cards.",
    icon: Sparkles
  },
  QUIZ: {
    title: "Quiz",
    description: "Multiple-choice practice with cited explanations.",
    icon: ListChecks
  },
  MIND_MAP: {
    title: "Mind Map",
    description: "A source-grounded concept graph.",
    icon: Network
  }
};

export function StudioArtifactsPanel({
  notebookId,
  notebookStatus,
  selectedLanguage,
  initialArtifacts,
  evidence,
  onSeek
}: {
  notebookId: string;
  notebookStatus: NotebookStatus;
  selectedLanguage: string;
  initialArtifacts: StudioArtifact[];
  evidence: StudioEvidence[];
  onSeek: (seconds: number) => void;
}) {
  const language = normalizeArtifactLanguage(selectedLanguage);
  const languageLabel = languageNames[language];
  const ready = notebookStatus === "READY";
  const [artifacts, setArtifacts] = useState<StudioArtifact[]>(
    normalizeArtifactList(initialArtifacts, notebookId, language)
  );
  const [generating, setGenerating] = useState<Set<ArtifactType>>(new Set());
  const [activeSteps, setActiveSteps] = useState<Record<string, number>>({});
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);

  const evidenceById = useMemo(
    () => new Map(evidence.map((item) => [item.id, item])),
    [evidence]
  );

  const refreshArtifacts = useCallback(async () => {
    const response = await fetch(
      `/api/notebooks/${notebookId}/artifacts?language=${language}`,
      {
        cache: "no-store"
      }
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { artifacts?: StudioArtifact[] };

    if (!payload.artifacts) {
      return null;
    }

    const normalized = normalizeArtifactList(
      payload.artifacts,
      notebookId,
      language
    );
    setArtifacts(normalized);
    return normalized;
  }, [language, notebookId]);

  useEffect(() => {
    setArtifacts(normalizeArtifactList(initialArtifacts, notebookId, language));
  }, [initialArtifacts, language, notebookId]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    let cancelled = false;

    void refreshArtifacts().then((nextArtifacts) => {
      if (!cancelled && nextArtifacts) {
        setArtifacts(nextArtifacts);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [ready, refreshArtifacts]);

  useEffect(() => {
    if (generating.size === 0) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveSteps((current) => {
        const next = { ...current };
        generating.forEach((type) => {
          next[type] = Math.min((next[type] ?? 0) + 1, 3);
        });
        return next;
      });
    }, 2500);

    return () => window.clearInterval(interval);
  }, [generating]);

  const waitForJob = useCallback(async (jobId: string) => {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      const response = await fetch(`/api/jobs/${jobId}`, {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error("Job status unavailable.");
      }

      const payload = (await response.json()) as { job?: JobPayload };
      const job = payload.job;

      if (!job) {
        throw new Error("Job status unavailable.");
      }

      if (job.status === "SUCCEEDED") {
        return job;
      }

      if (job.status === "FAILED" || job.status === "CANCELLED") {
        throw new Error(
          job.safeErrorMessage ?? job.errorMessage ?? "Artifact job failed."
        );
      }

      await sleep(1500);
    }

    throw new Error("Artifact job timed out.");
  }, []);

  const getArtifact = useCallback(
    (type: ArtifactType) =>
      artifacts.find((artifact) => artifact.type === type) ??
      createEmptyArtifact(notebookId, type, language),
    [artifacts, language, notebookId]
  );

  const generateOne = useCallback(
    async (type: ArtifactType) => {
      if (!ready) {
        return;
      }

      setGenerating((current) => new Set(current).add(type));
      setActiveSteps((current) => ({ ...current, [type]: 0 }));
      setArtifacts((current) =>
        upsertArtifact(current, {
          ...getArtifact(type),
          status: "GENERATING",
          errorType: null,
          errorTitle: null,
          errorMessage: null
        })
      );

      try {
        const response = await fetch(
          `/api/notebooks/${notebookId}/artifacts/generate`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              artifactType: type,
              language,
              mode: "async"
            })
          }
        );
        const payload = (await response.json()) as {
          artifact?: StudioArtifact;
          jobId?: string;
          job?: JobPayload;
          error?: string;
          errorMessage?: string;
          errorType?: string;
        };

        if (response.ok && payload.artifact) {
          setArtifacts((current) => upsertArtifact(current, payload.artifact!));
        } else if (response.ok && (payload.jobId || payload.job?.id)) {
          await waitForJob(payload.jobId ?? payload.job!.id);
          await refreshArtifacts();
        } else {
          setArtifacts((current) =>
            upsertArtifact(
              current,
              createFailedArtifact({
                notebookId,
                type,
                language,
                title: payload.error,
                message: payload.errorMessage,
                errorType: payload.errorType
              })
            )
          );
        }
      } catch (error) {
        setArtifacts((current) =>
          upsertArtifact(
            current,
            createFailedArtifact({
              notebookId,
              type,
              language,
              title: "Artifact generation failed.",
              message:
                error instanceof Error
                  ? error.message
                  : `Could not generate this artifact in ${languageLabel}. Try again.`,
              errorType: "UNKNOWN"
            })
          )
        );
      } finally {
        setGenerating((current) => {
          const next = new Set(current);
          next.delete(type);
          return next;
        });
        setActiveSteps((current) => ({ ...current, [type]: 4 }));
      }
    },
    [
      getArtifact,
      language,
      languageLabel,
      notebookId,
      ready,
      refreshArtifacts,
      waitForJob
    ]
  );

  const generateAll = useCallback(async () => {
    const missingTypes = artifactTypes.filter(
      (type) => getArtifact(type).status !== "READY"
    );

    if (missingTypes.length === 0) {
      return;
    }

    setIsGeneratingAll(true);
    setGenerating(new Set(missingTypes));
    setActiveSteps((current) =>
      missingTypes.reduce(
        (next, type) => ({
          ...next,
          [type]: 0
        }),
        { ...current }
      )
    );
    setArtifacts((current) =>
      missingTypes.reduce(
        (next, type) =>
          upsertArtifact(next, {
            ...getArtifact(type),
            status: "GENERATING",
            errorType: null,
            errorTitle: null,
            errorMessage: null
          }),
        current
      )
    );

    try {
      const response = await fetch(
        `/api/notebooks/${notebookId}/artifacts/generate`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            types: missingTypes,
            language,
            mode: "async"
          })
        }
      );
      const payload = (await response.json()) as {
        jobId?: string;
        job?: JobPayload;
        error?: string;
        errorMessage?: string;
      };

      if (response.ok && (payload.jobId || payload.job?.id)) {
        await waitForJob(payload.jobId ?? payload.job!.id);
        await refreshArtifacts();
      } else {
        throw new Error(
          payload.errorMessage ?? payload.error ?? "Artifact generation failed."
        );
      }
    } catch (error) {
      const refreshed = await refreshArtifacts();

      if (!refreshed) {
        setArtifacts((current) =>
          missingTypes.reduce(
            (next, type) =>
              upsertArtifact(
                next,
                createFailedArtifact({
                  notebookId,
                  type,
                  language,
                  title: "Artifact generation failed.",
                  message:
                    error instanceof Error
                      ? error.message
                      : `Could not generate this artifact in ${languageLabel}. Try again.`,
                  errorType: "UNKNOWN"
                })
              ),
            current
          )
        );
      }
    } finally {
      setGenerating(new Set());
      setIsGeneratingAll(false);
    }
  }, [
    getArtifact,
    language,
    languageLabel,
    notebookId,
    refreshArtifacts,
    waitForJob
  ]);

  const summaryShort = getArtifact("SUMMARY_SHORT");
  const summaryMedium = getArtifact("SUMMARY_MEDIUM");
  const hasAnySummaryJson = Boolean(summaryShort.json || summaryMedium.json);

  return (
    <div className="mt-5 space-y-3">
      <div className="rounded-md border bg-muted/20 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">AI study artifacts</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {ready
                ? `Study language: ${languageLabel}.`
                : "Waiting for timestamped evidence."}
            </p>
          </div>
          <Button
            disabled={!ready || generating.size > 0 || isGeneratingAll}
            onClick={() => void generateAll()}
            size="sm"
          >
            {isGeneratingAll ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Generate All
          </Button>
        </div>
      </div>

      <ArtifactShell
        activeStep={activeSteps.OUTLINE}
        artifact={getArtifact("OUTLINE")}
        disabled={!ready || generating.size > 0}
        onGenerate={() => void generateOne("OUTLINE")}
        onRetry={() => void generateOne("OUTLINE")}
      >
        {(artifact) =>
          artifact.json ? (
            <OutlineView
              artifact={artifact.json as OutlineArtifact}
              evidenceById={evidenceById}
              onSeek={onSeek}
            />
          ) : null
        }
      </ArtifactShell>

      <Card className="rounded-md">
        <CardHeader className="p-4 pb-2">
          <ArtifactHeader
            description="Short and medium cited summaries."
            disabled={!ready || generating.size > 0}
            icon={FileText}
            onGenerate={() => {
              void (async () => {
                await generateOne("SUMMARY_SHORT");
                await generateOne("SUMMARY_MEDIUM");
              })();
            }}
            status={combineSummaryStatus(summaryShort, summaryMedium)}
            title="Summary"
          />
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-2">
          {summaryShort.status === "GENERATING" ||
          summaryMedium.status === "GENERATING" ? (
            <ArtifactLoadingCard
              activeStep={Math.max(
                activeSteps.SUMMARY_SHORT ?? 0,
                activeSteps.SUMMARY_MEDIUM ?? 0
              )}
            />
          ) : null}
          {!hasAnySummaryJson && summaryShort.status === "FAILED" ? (
            <ArtifactErrorCard
              disabled={generating.size > 0}
              message={summaryShort.errorMessage}
              onRetry={() => void generateOne("SUMMARY_SHORT")}
              title={summaryShort.errorTitle}
            />
          ) : null}
          {!hasAnySummaryJson && summaryMedium.status === "FAILED" ? (
            <ArtifactErrorCard
              disabled={generating.size > 0}
              message={summaryMedium.errorMessage}
              onRetry={() => void generateOne("SUMMARY_MEDIUM")}
              title={summaryMedium.errorTitle}
            />
          ) : null}
          {hasAnySummaryJson ? (
            <SummaryView
              evidenceById={evidenceById}
              mediumFallback={
                summaryMedium.status === "FAILED" ? (
                  <ArtifactErrorCard
                    disabled={generating.size > 0}
                    message={summaryMedium.errorMessage}
                    onRetry={() => void generateOne("SUMMARY_MEDIUM")}
                    title={summaryMedium.errorTitle}
                  />
                ) : undefined
              }
              mediumSummary={summaryMedium.json as MediumSummaryArtifact | null}
              onSeek={onSeek}
              shortFallback={
                summaryShort.status === "FAILED" ? (
                  <ArtifactErrorCard
                    disabled={generating.size > 0}
                    message={summaryShort.errorMessage}
                    onRetry={() => void generateOne("SUMMARY_SHORT")}
                    title={summaryShort.errorTitle}
                  />
                ) : undefined
              }
              shortSummary={summaryShort.json as ShortSummaryArtifact | null}
            />
          ) : summaryShort.status !== "GENERATING" &&
            summaryMedium.status !== "GENERATING" &&
            summaryShort.status !== "FAILED" &&
            summaryMedium.status !== "FAILED" ? (
            <EmptyArtifactMessage
              ready={ready}
              text="Generate summaries to replace this placeholder with cited study notes."
              languageLabel={languageLabel}
            />
          ) : null}
          <div className="grid grid-cols-2 gap-2">
            <Button
              disabled={!ready || generating.size > 0}
              onClick={() => void generateOne("SUMMARY_SHORT")}
              size="sm"
              variant="outline"
            >
              90 sec
            </Button>
            <Button
              disabled={!ready || generating.size > 0}
              onClick={() => void generateOne("SUMMARY_MEDIUM")}
              size="sm"
              variant="outline"
            >
              5 min
            </Button>
          </div>
        </CardContent>
      </Card>

      <ArtifactShell
        activeStep={activeSteps.STUDY_GUIDE}
        artifact={getArtifact("STUDY_GUIDE")}
        disabled={!ready || generating.size > 0}
        onGenerate={() => void generateOne("STUDY_GUIDE")}
        onRetry={() => void generateOne("STUDY_GUIDE")}
      >
        {(artifact) =>
          artifact.json ? (
            <StudyGuideView
              artifact={artifact.json as StudyGuideArtifact}
              evidenceById={evidenceById}
              onSeek={onSeek}
            />
          ) : null
        }
      </ArtifactShell>

      <ArtifactShell
        activeStep={activeSteps.FLASHCARDS}
        artifact={getArtifact("FLASHCARDS")}
        disabled={!ready || generating.size > 0}
        onGenerate={() => void generateOne("FLASHCARDS")}
        onRetry={() => void generateOne("FLASHCARDS")}
      >
        {(artifact) =>
          artifact.json ? (
            <FlashcardsView
              artifact={artifact.json as FlashcardsArtifact}
              evidenceById={evidenceById}
              onSeek={onSeek}
            />
          ) : null
        }
      </ArtifactShell>

      <ArtifactShell
        activeStep={activeSteps.QUIZ}
        artifact={getArtifact("QUIZ")}
        disabled={!ready || generating.size > 0}
        onGenerate={() => void generateOne("QUIZ")}
        onRetry={() => void generateOne("QUIZ")}
      >
        {(artifact) =>
          artifact.json ? (
            <QuizView
              artifact={artifact.json as QuizArtifact}
              evidenceById={evidenceById}
              onSeek={onSeek}
            />
          ) : null
        }
      </ArtifactShell>

      <ArtifactShell
        activeStep={activeSteps.MIND_MAP}
        artifact={getArtifact("MIND_MAP")}
        disabled={!ready || generating.size > 0}
        onGenerate={() => void generateOne("MIND_MAP")}
        onRetry={() => void generateOne("MIND_MAP")}
      >
        {(artifact) =>
          artifact.json ? (
            <MindMapView
              artifact={artifact.json as MindMapArtifact}
              evidenceById={evidenceById}
              onSeek={onSeek}
            />
          ) : null
        }
      </ArtifactShell>
    </div>
  );
}

function ArtifactShell({
  artifact,
  disabled,
  activeStep = 0,
  onGenerate,
  onRetry,
  children
}: {
  artifact: StudioArtifact;
  disabled: boolean;
  activeStep?: number;
  onGenerate: () => void;
  onRetry: () => void;
  children: (artifact: StudioArtifact) => ReactNode;
}) {
  const copy = artifactCopy[artifact.type];

  return (
    <Card className="rounded-md">
      <CardHeader className="p-4 pb-2">
        <ArtifactHeader
          description={copy.description}
          disabled={disabled}
          icon={copy.icon}
          onGenerate={onGenerate}
          status={artifact.status}
          title={copy.title}
        />
      </CardHeader>
      <CardContent className="space-y-3 p-4 pt-2">
        {artifact.status === "GENERATING" ? (
          <ArtifactLoadingCard activeStep={activeStep} />
        ) : null}
        {artifact.status === "FAILED" ? (
          <ArtifactErrorCard
            disabled={disabled}
            message={artifact.errorMessage}
            onRetry={onRetry}
            title={artifact.errorTitle}
          />
        ) : null}
        {artifact.status === "READY" ? children(artifact) : null}
        {artifact.status === "EMPTY" ? (
          <EmptyArtifactMessage
            ready={!disabled}
            text="Generate this artifact to fill the card with cited lecture content."
            languageLabel={languageNames[artifact.language]}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

function ArtifactHeader({
  title,
  description,
  status,
  icon: Icon,
  disabled,
  onGenerate
}: {
  title: string;
  description: string;
  status: StudioArtifact["status"];
  icon: typeof Layers3;
  disabled: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm">{title}</CardTitle>
        </div>
        <CardDescription className="mt-1 text-xs leading-5">
          {description}
        </CardDescription>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <Badge variant={statusVariant(status)}>
          {artifactStatusLabel[status]}
        </Badge>
        <Button
          disabled={disabled || status === "GENERATING"}
          onClick={onGenerate}
          size="sm"
          variant={status === "FAILED" ? "outline" : "secondary"}
        >
          {status === "FAILED" ? (
            <RotateCw className="h-3.5 w-3.5" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {status === "READY" ? "Regenerate" : "Generate"}
        </Button>
      </div>
    </div>
  );
}

function EmptyArtifactMessage({
  ready,
  text,
  languageLabel
}: {
  ready: boolean;
  text: string;
  languageLabel: string;
}) {
  return (
    <div className="flex min-h-16 items-center gap-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
      <Layers3 className="h-4 w-4 shrink-0" />
      {ready
        ? `${text} Generate in ${languageLabel}.`
        : "Waiting for transcript evidence."}
    </div>
  );
}

function statusVariant(
  status: StudioArtifact["status"]
): BadgeProps["variant"] {
  if (status === "READY") {
    return "success";
  }

  if (status === "GENERATING") {
    return "warning";
  }

  if (status === "FAILED") {
    return "destructive";
  }

  return "secondary";
}

function combineSummaryStatus(
  shortSummary: StudioArtifact,
  mediumSummary: StudioArtifact
) {
  if (
    shortSummary.status === "GENERATING" ||
    mediumSummary.status === "GENERATING"
  ) {
    return "GENERATING";
  }

  if (shortSummary.status === "READY" || mediumSummary.status === "READY") {
    return "READY";
  }

  if (shortSummary.status === "FAILED" || mediumSummary.status === "FAILED") {
    return "FAILED";
  }

  return "EMPTY";
}

function normalizeArtifactList(
  artifacts: StudioArtifact[],
  notebookId: string,
  language: StudioArtifact["language"]
) {
  const byType = new Map(
    artifacts
      .filter((artifact) => artifact.language === language)
      .map((artifact) => [artifact.type, artifact])
  );

  return artifactTypes.map(
    (type) =>
      byType.get(type) ?? createEmptyArtifact(notebookId, type, language)
  );
}

function upsertArtifact(
  artifacts: StudioArtifact[],
  nextArtifact: StudioArtifact
) {
  const found = artifacts.some(
    (artifact) =>
      artifact.type === nextArtifact.type &&
      artifact.language === nextArtifact.language
  );

  if (!found) {
    return [...artifacts, nextArtifact];
  }

  return artifacts.map((artifact) =>
    artifact.type === nextArtifact.type &&
    artifact.language === nextArtifact.language
      ? nextArtifact
      : artifact
  );
}

function createEmptyArtifact(
  notebookId: string,
  type: ArtifactType,
  language: StudioArtifact["language"]
): StudioArtifact {
  return {
    id: `${notebookId}-${type}-${language}-empty`,
    notebookId,
    type,
    language,
    status: "EMPTY",
    json: null,
    errorType: null,
    errorTitle: null,
    errorMessage: null,
    generatedBy: null,
    verifiedAt: null,
    sourceSegmentCount: null,
    metadata: null,
    updatedAt: new Date(0).toISOString()
  };
}

function createFailedArtifact({
  notebookId,
  type,
  language,
  title,
  message,
  errorType
}: {
  notebookId: string;
  type: ArtifactType;
  language: StudioArtifact["language"];
  title?: string | null;
  message?: string | null;
  errorType?: string | null;
}): StudioArtifact {
  return {
    ...createEmptyArtifact(notebookId, type, language),
    status: "FAILED",
    errorType: errorType ?? "UNKNOWN",
    errorTitle: title ?? "Artifact generation failed.",
    errorMessage:
      message ?? "Try again. Your transcript evidence is still saved.",
    updatedAt: new Date().toISOString()
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
