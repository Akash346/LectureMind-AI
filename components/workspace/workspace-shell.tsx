"use client";

import Image from "next/image";
import Link from "next/link";
import {
  forwardRef,
  type RefObject,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  BookOpen,
  Captions,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Clock3,
  ExternalLink,
  FileText,
  History,
  Loader2,
  PanelLeftClose,
  PanelRightClose,
  Plus,
  Send,
  Video
} from "lucide-react";
import type { User } from "next-auth";

import { SignOutButton } from "@/components/auth-buttons";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { StudioArtifactsPanel } from "@/components/workspace/artifacts/studio-panel";
import type { StudioArtifact } from "@/components/workspace/artifacts/types";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  type VideoErrorType,
  videoErrorCopy
} from "@/lib/video-errors";
import {
  languageNames,
  normalizeArtifactLanguage,
  type LanguageCode
} from "@/lib/ai/schemas";
import { useWorkspaceStore } from "@/lib/workspace-store";
import { cn } from "@/lib/utils";

type NotebookStatus = "DRAFT" | "PENDING" | "PROCESSING" | "READY" | "FAILED";
type JobStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

type PreferenceValues = {
  theme: string;
  defaultLanguage: string;
  chatMode: string;
  responseLength: string;
};

type LatestJobVm = {
  status: JobStatus;
  progress: number;
  progressPercent?: number;
  currentStep: string | null;
  errorType: string | null;
  errorMessage: string | null;
  errorCode?: string | null;
  safeErrorMessage?: string | null;
  attempts?: number;
  attemptCount?: number;
  maxAttempts?: number;
  metadata?: Record<string, unknown> | null;
};

type IndexStatusVm = {
  notebookId: string;
  status: JobStatus | "READY" | "FALLBACK" | "NOT_STARTED";
  retrievalMode: "azure_hybrid" | "local_lexical_fallback";
  indexName?: string;
  indexEnvSource?: string;
  fallbackReason?: string | null;
  totalEvidenceSegments?: number;
  totalSegmentCount: number;
  indexedSegmentCount: number;
  failedSegmentCount: number;
  schemaCompatible?: boolean | null;
  schemaMismatchReasons?: string[];
  shouldIndex?: boolean;
  indexingRequiredReason?: string | null;
  searchConfigured: boolean;
  embeddingsConfigured?: boolean;
  embeddingConfigured: boolean;
  chatReady: boolean;
  latestIndexJob?: {
    id: string;
    status: JobStatus;
    progress: number;
    progressPercent?: number;
    currentStep: string | null;
    errorCode: string | null;
    safeErrorMessage: string | null;
  } | null;
  job: {
    id: string;
    status: JobStatus;
    progress: number;
    progressPercent?: number;
    currentStep: string | null;
    errorCode: string | null;
    safeErrorMessage: string | null;
  } | null;
};

type ChatCitationVm = {
  evidenceSegmentId: string;
  startSec: number;
  endSec: number;
  label: string;
};

type ChatMessageVm = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: ChatCitationVm[];
  retrievalMode?: "azure_hybrid" | "local_lexical_fallback";
  contextSegmentCount?: number;
};

type ChatSuccessPayload = {
  answer: string;
  citations: ChatCitationVm[];
  followUps: string[];
  retrievalMode: "azure_hybrid" | "local_lexical_fallback";
  metadata: {
    contextSegmentCount: number;
  };
};

type ChatErrorPayload = {
  error?: {
    code: string;
    message: string;
    details?: {
      retrievalMode?: "azure_hybrid" | "local_lexical_fallback";
      retrievedSegmentCount?: number;
      verificationReason?: string;
      indexName?: string;
      fallbackReason?: string | null;
    };
  };
};

type ChatErrorVm = {
  code: string;
  message: string;
  details?: NonNullable<ChatErrorPayload["error"]>["details"];
};

type NotebookVm = {
  id: string;
  title: string;
  sourceUrl: string;
  status: NotebookStatus;
  language: string;
  createdAt: string;
  videoId: string | null;
  videoTitle: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  errorType: string | null;
  errorMessage: string | null;
  segmentCount: number;
  latestJob: LatestJobVm | null;
  artifacts: StudioArtifact[];
};

type NotebookStatusVm = {
  notebookId: string;
  status: NotebookStatus;
  videoId: string | null;
  videoTitle: string | null;
  thumbnailUrl: string | null;
  durationSec: number | null;
  segmentCount: number;
  errorType: string | null;
  errorMessage: string | null;
  job: LatestJobVm | null;
};

type EvidenceVm = {
  id: string;
  videoId: string;
  startSec: number;
  endSec: number;
  text: string;
  sourceType: "CAPTION" | "AUTO_CAPTION" | "ASR" | "METADATA";
  confidence: number;
  language: string | null;
  extractionEngine: string | null;
  rawSource: string | null;
};

type PlayerHandle = {
  seekTo: (seconds: number) => void;
};

const progressSteps = [
  { progress: 5, label: "Validating YouTube URL" },
  { progress: 10, label: "Reading video details" },
  { progress: 20, label: "Checking existing captions" },
  { progress: 35, label: "Building caption transcript" },
  { progress: 45, label: "Caption path unavailable, preparing fallback" },
  { progress: 55, label: "Contacting processing worker" },
  { progress: 65, label: "Extracting audio for speech fallback" },
  { progress: 80, label: "Transcribing audio" },
  { progress: 90, label: "Saving grounded evidence" },
  { progress: 100, label: "Ready" }
];

const statusVariant: Record<NotebookStatus, BadgeProps["variant"]> = {
  DRAFT: "secondary",
  PENDING: "warning",
  PROCESSING: "warning",
  READY: "success",
  FAILED: "destructive"
};

export function WorkspaceShell({
  notebook,
  user,
  preference,
  initialChatMessages = []
}: {
  notebook: NotebookVm;
  user: User;
  preference: PreferenceValues;
  initialChatMessages?: ChatMessageVm[];
}) {
  const { sourceOpen, studioOpen, toggleSource, toggleStudio } =
    useWorkspaceStore();
  const [status, setStatus] = useState<NotebookStatusVm>({
    notebookId: notebook.id,
    status: notebook.status,
    videoId: notebook.videoId,
    videoTitle: notebook.videoTitle,
    thumbnailUrl: notebook.thumbnailUrl,
    durationSec: notebook.durationSec,
    segmentCount: notebook.segmentCount,
    errorType: notebook.errorType,
    errorMessage: notebook.errorMessage,
    job: notebook.latestJob
  });
  const [evidence, setEvidence] = useState<EvidenceVm[]>([]);
  const [indexStatus, setIndexStatus] = useState<IndexStatusVm | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const selectedLanguage = useMemo(
    () => normalizeArtifactLanguage(notebook.language),
    [notebook.language]
  );
  const processStartedRef = useRef(false);
  const indexStartedRef = useRef(false);
  const playerRef = useRef<PlayerHandle>(null);

  const refreshStatus = useCallback(async () => {
    const response = await fetch(`/api/notebooks/${notebook.id}/status`, {
      cache: "no-store"
    });

    if (!response.ok) {
      return;
    }

    setStatus((await response.json()) as NotebookStatusVm);
  }, [notebook.id]);

  const refreshIndexStatus = useCallback(async () => {
    const response = await fetch(`/api/notebooks/${notebook.id}/index/status`, {
      cache: "no-store"
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as IndexStatusVm;

    setIndexStatus(payload);
    return payload;
  }, [notebook.id]);

  useEffect(() => {
    if (status.status !== "PENDING" || processStartedRef.current) {
      return;
    }

    processStartedRef.current = true;
    setIsStarting(true);

    void fetch(`/api/notebooks/${notebook.id}/process`, {
      method: "POST"
    })
      .then(() => refreshStatus())
      .catch(() => refreshStatus())
      .finally(() => setIsStarting(false));
  }, [notebook.id, refreshStatus, status.status]);

  useEffect(() => {
    if (
      !["PENDING", "PROCESSING"].includes(status.status) &&
      !isStarting &&
      !isRetrying
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshStatus();
    }, 1500);

    return () => window.clearInterval(interval);
  }, [isRetrying, isStarting, refreshStatus, status.status]);

  useEffect(() => {
    if (status.status !== "READY" || evidence.length > 0) {
      return;
    }

    void fetch(`/api/notebooks/${notebook.id}/evidence`, {
      cache: "no-store"
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { evidence?: EvidenceVm[] } | null) => {
        if (payload?.evidence) {
          setEvidence(payload.evidence);
        }
      });
  }, [evidence.length, notebook.id, status.status]);

  useEffect(() => {
    if (status.status !== "READY") {
      return;
    }

    void refreshIndexStatus();
  }, [refreshIndexStatus, status.status]);

  useEffect(() => {
    if (
      status.status !== "READY" ||
      status.segmentCount === 0 ||
      !indexStatus ||
      !indexStatus.shouldIndex ||
      indexStatus.status === "QUEUED" ||
      indexStatus.status === "RUNNING" ||
      indexStartedRef.current
    ) {
      return;
    }

    indexStartedRef.current = true;
    void fetch(`/api/notebooks/${notebook.id}/index`, {
      method: "POST"
    }).finally(() => {
      void refreshIndexStatus();
    });
  }, [
    indexStatus,
    notebook.id,
    refreshIndexStatus,
    status.segmentCount,
    status.status
  ]);

  useEffect(() => {
    if (
      !indexStatus ||
      (indexStatus.status !== "QUEUED" && indexStatus.status !== "RUNNING")
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshIndexStatus();
    }, 2000);

    return () => window.clearInterval(interval);
  }, [indexStatus, refreshIndexStatus]);

  const hydratedNotebook = useMemo<NotebookVm>(
    () => ({
      ...notebook,
      status: status.status,
      videoId: status.videoId ?? notebook.videoId,
      videoTitle: status.videoTitle ?? notebook.videoTitle,
      thumbnailUrl: status.thumbnailUrl ?? notebook.thumbnailUrl,
      durationSec: status.durationSec ?? notebook.durationSec,
      segmentCount: status.segmentCount,
      errorType: status.errorType,
      errorMessage: status.errorMessage,
      latestJob: status.job
    }),
    [notebook, status]
  );

  const handleSeek = useCallback((seconds: number) => {
    playerRef.current?.seekTo(seconds);
  }, []);

  const handleRetry = useCallback(() => {
    setIsRetrying(true);
    setEvidence([]);
    processStartedRef.current = true;

    void fetch(`/api/notebooks/${notebook.id}/process`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ force: true })
    })
      .then(() => refreshStatus())
      .catch(() => refreshStatus())
      .finally(() => setIsRetrying(false));
  }, [notebook.id, refreshStatus]);

  return (
    <main className="flex min-h-screen flex-col bg-muted/20">
      <WorkspaceTopBar
        studyLanguage={selectedLanguage}
        user={user}
      />
      <div className="hidden flex-1 gap-3 p-3 md:grid md:grid-cols-[auto_1fr_auto]">
        <motion.aside
          animate={{ width: sourceOpen ? 316 : 48 }}
          className="overflow-hidden rounded-lg border bg-background"
          transition={{ duration: 0.2 }}
        >
          {sourceOpen ? (
            <SourcePane
              isRetrying={isRetrying}
              notebook={hydratedNotebook}
              onRetry={handleRetry}
              onToggle={toggleSource}
            />
          ) : (
            <CollapsedPane
              label="Open sources"
              onClick={toggleSource}
              side="left"
            />
          )}
        </motion.aside>
        <CenterPane
          evidence={evidence}
          indexStatus={indexStatus}
          isStarting={isStarting || isRetrying}
          isRetrying={isRetrying}
          notebook={hydratedNotebook}
          onRetry={handleRetry}
          onSeek={handleSeek}
          playerRef={playerRef}
          preference={preference}
          selectedLanguage={selectedLanguage}
          initialChatMessages={initialChatMessages}
        />
        <motion.aside
          animate={{ width: studioOpen ? 340 : 48 }}
          className="overflow-hidden rounded-lg border bg-background"
          transition={{ duration: 0.2 }}
        >
          {studioOpen ? (
            <StudioPane
              artifacts={notebook.artifacts}
              evidence={evidence}
              notebookId={notebook.id}
              notebookStatus={hydratedNotebook.status}
              onSeek={handleSeek}
              onToggle={toggleStudio}
              selectedLanguage={selectedLanguage}
            />
          ) : (
            <CollapsedPane
              label="Open studio"
              onClick={toggleStudio}
              side="right"
            />
          )}
        </motion.aside>
      </div>

      <div className="flex-1 p-3 md:hidden">
        <Tabs defaultValue="chat">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="source">Source</TabsTrigger>
            <TabsTrigger value="chat">Chat</TabsTrigger>
            <TabsTrigger value="studio">Studio</TabsTrigger>
          </TabsList>
          <TabsContent value="source">
            <SourcePane
              isRetrying={isRetrying}
              notebook={hydratedNotebook}
              onRetry={handleRetry}
            />
          </TabsContent>
          <TabsContent value="chat">
            <CenterPane
              evidence={evidence}
              indexStatus={indexStatus}
              isStarting={isStarting || isRetrying}
              isRetrying={isRetrying}
              notebook={hydratedNotebook}
              onRetry={handleRetry}
              onSeek={handleSeek}
              playerRef={playerRef}
              preference={preference}
              selectedLanguage={selectedLanguage}
              initialChatMessages={initialChatMessages}
            />
          </TabsContent>
          <TabsContent value="studio">
            <StudioPane
              artifacts={notebook.artifacts}
              evidence={evidence}
              notebookId={notebook.id}
              notebookStatus={hydratedNotebook.status}
              onSeek={handleSeek}
              selectedLanguage={selectedLanguage}
            />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function WorkspaceTopBar({
  user,
  studyLanguage
}: {
  user: User;
  studyLanguage: LanguageCode;
}) {
  const studyLanguageLabel = languageNames[studyLanguage];
  const studyLanguageHelp =
    "Generated study materials use this language. Source transcript stays original for accuracy.";

  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-3 px-4">
        <Brand />
        <div className="flex items-center gap-2">
          <Button asChild className="hidden sm:inline-flex" size="sm">
            <Link href="/notebooks/new">
              <Plus className="h-4 w-4" />
              New notebook
            </Link>
          </Button>
          <div
            aria-label={`Study language: ${studyLanguageLabel}. ${studyLanguageHelp}`}
            className="hidden items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs sm:flex"
            title={studyLanguageHelp}
          >
            <span className="text-muted-foreground">Study language:</span>
            <span className="font-semibold">{studyLanguageLabel}</span>
          </div>
          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Open user menu"
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border bg-muted"
                type="button"
              >
                {user.image ? (
                  <Image
                    alt={user.name ?? "User"}
                    height={36}
                    src={user.image}
                    width={36}
                  />
                ) : (
                  <span className="text-sm font-semibold">
                    {user.name?.charAt(0) ?? "U"}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href="/dashboard">Dashboard</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/notebooks/new">New notebook</Link>
              </DropdownMenuItem>
              <div className="px-2 py-1.5 text-xs text-muted-foreground sm:hidden">
                Study language:{" "}
                <span className="font-semibold text-foreground">
                  {studyLanguageLabel}
                </span>
              </div>
              <SignOutButton />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

function SourcePane({
  notebook,
  isRetrying = false,
  onRetry,
  onToggle
}: {
  notebook: NotebookVm;
  isRetrying?: boolean;
  onRetry?: () => void;
  onToggle?: () => void;
}) {
  const sourceSummary = getSourceSummary(notebook);
  const retryAllowed = canRetryNotebook(notebook);

  return (
    <section className="h-full overflow-y-auto rounded-lg border bg-background p-4 md:border-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Source
          </p>
          <h2 className="mt-1 text-lg font-semibold">Lecture source</h2>
        </div>
        {onToggle ? (
          <Button
            aria-label="Collapse source pane"
            onClick={onToggle}
            size="icon"
            variant="ghost"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      <div className="mt-5 space-y-4">
        <div className="overflow-hidden rounded-md border bg-muted/20">
          {notebook.thumbnailUrl ? (
            <Image
              alt={notebook.videoTitle ?? notebook.title}
              className="aspect-video w-full object-cover"
              height={180}
              src={notebook.thumbnailUrl}
              width={320}
            />
          ) : (
            <div className="flex aspect-video items-center justify-center">
              <Video className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
          <div className="space-y-3 p-4">
            <div>
              <p className="text-xs font-medium uppercase text-muted-foreground">
                YouTube lecture
              </p>
              <h3 className="mt-1 line-clamp-3 text-sm font-semibold">
                {notebook.videoTitle ?? notebook.title}
              </h3>
            </div>
            <a
              className="flex items-center gap-2 break-all text-xs text-primary hover:underline"
              href={notebook.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              {notebook.sourceUrl}
            </a>
          </div>
        </div>

        <div className="rounded-md border p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant={statusVariant[notebook.status]}>
              {notebook.status}
            </Badge>
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Clock3 className="h-4 w-4" />
            Created {notebook.createdAt}
          </div>
          {notebook.status === "READY" ? (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Captions className="h-4 w-4" />
                {notebook.segmentCount.toLocaleString()} evidence segments
              </div>
              <MetricRow label="Source type" value={sourceSummary.sourceLabel} />
              <MetricRow label="Engine" value={sourceSummary.engineLabel} />
              {sourceSummary.language ? (
                <MetricRow label="Language" value={sourceSummary.language} />
              ) : null}
            </div>
          ) : null}
        </div>

        {notebook.status === "FAILED" ? (
          <FailureCard
            compact
            errorMessage={notebook.errorMessage}
            errorType={notebook.errorType}
            isRetrying={isRetrying}
            onRetry={onRetry}
            retryAllowed={retryAllowed}
          />
        ) : null}

        <Button className="w-full justify-start" disabled variant="outline">
          <History className="h-4 w-4" />
          Source history
        </Button>
      </div>
    </section>
  );
}

function CenterPane({
  notebook,
  evidence,
  indexStatus,
  isStarting,
  isRetrying,
  onRetry,
  onSeek,
  playerRef,
  preference,
  selectedLanguage,
  initialChatMessages
}: {
  notebook: NotebookVm;
  evidence: EvidenceVm[];
  indexStatus: IndexStatusVm | null;
  isStarting: boolean;
  isRetrying: boolean;
  onRetry: () => void;
  onSeek: (seconds: number) => void;
  playerRef: RefObject<PlayerHandle>;
  preference: PreferenceValues;
  selectedLanguage: string;
  initialChatMessages: ChatMessageVm[];
}) {
  const isReady = notebook.status === "READY";
  const isFailed = notebook.status === "FAILED";
  const retryAllowed = canRetryNotebook(notebook);
  const studyLanguage = normalizeArtifactLanguage(selectedLanguage);
  const studyLanguageLabel = languageNames[studyLanguage];
  const isProcessing =
    notebook.status === "PENDING" ||
    notebook.status === "PROCESSING" ||
    isStarting;

  return (
    <section className="flex min-h-[calc(100vh-5.5rem)] flex-col overflow-hidden rounded-lg border bg-background">
      <div className="border-b p-4">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Workspace
            </p>
            <h1 className="truncate text-xl font-semibold">{notebook.title}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Study language:{" "}
              <span className="font-medium text-foreground">
                {studyLanguageLabel}
              </span>
              . Source transcript and timestamps remain original.
            </p>
          </div>
          <Badge variant={statusVariant[notebook.status]}>
            Evidence {notebook.status.toLowerCase()}
          </Badge>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {isFailed ? (
          <FailureCard
            errorMessage={notebook.errorMessage}
            errorType={notebook.errorType}
            isRetrying={isRetrying}
            onRetry={onRetry}
            retryAllowed={retryAllowed}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
            {notebook.videoId ? (
              <YouTubePlayer
                ref={playerRef}
                title={notebook.videoTitle ?? notebook.title}
                videoId={notebook.videoId}
              />
            ) : (
              <div className="flex aspect-video min-h-52 items-center justify-center rounded-lg border bg-muted/30 p-6 text-center">
                <div>
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Video className="h-6 w-6" />
                  </div>
                  <h2 className="mt-4 text-lg font-semibold">
                    Preparing video
                  </h2>
                  <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                    The source will appear here after the YouTube URL is
                    validated.
                  </p>
                </div>
              </div>
            )}

            {isReady ? (
              <SourceReadyCard
                evidence={evidence}
                indexStatus={indexStatus}
                notebook={notebook}
              />
            ) : (
              <ProgressPanel
                currentStep={notebook.latestJob?.currentStep}
                isStarting={isStarting}
                metadata={notebook.latestJob?.metadata}
                progress={notebook.latestJob?.progress ?? 5}
                status={notebook.latestJob?.status ?? "QUEUED"}
              />
            )}
          </div>
        )}

        {isReady ? (
          <TranscriptTimeline
            evidence={evidence}
            segmentCount={notebook.segmentCount}
            onSeek={onSeek}
          />
        ) : isProcessing ? (
          <TranscriptSkeleton />
        ) : null}
      </div>

      <ChatPane
        evidenceCount={notebook.segmentCount}
        indexStatus={indexStatus}
        notebookId={notebook.id}
        notebookStatus={notebook.status}
        onSeek={onSeek}
        preference={preference}
        selectedLanguage={selectedLanguage}
        initialChatMessages={initialChatMessages}
      />
    </section>
  );
}

const YouTubePlayer = forwardRef<
  PlayerHandle,
  { videoId: string; title: string }
>(function YouTubePlayer({ videoId, title }, ref) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const src = useMemo(() => {
    const params = new URLSearchParams({
      enablejsapi: "1",
      rel: "0",
      modestbranding: "1"
    });

    if (origin) {
      params.set("origin", origin);
    }

    return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
  }, [origin, videoId]);

  useImperativeHandle(
    ref,
    () => ({
      seekTo(seconds: number) {
        const target = iframeRef.current?.contentWindow;

        if (!target) {
          return;
        }

        target.postMessage(
          JSON.stringify({
            event: "command",
            func: "seekTo",
            args: [seconds, true]
          }),
          "https://www.youtube.com"
        );
        target.postMessage(
          JSON.stringify({
            event: "command",
            func: "playVideo",
            args: []
          }),
          "https://www.youtube.com"
        );
      }
    }),
    []
  );

  return (
    <div className="overflow-hidden rounded-lg border bg-black">
      <iframe
        ref={iframeRef}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        className="aspect-video w-full"
        src={src}
        title={title}
      />
    </div>
  );
});

function SourceReadyCard({
  notebook,
  evidence,
  indexStatus
}: {
  notebook: NotebookVm;
  evidence: EvidenceVm[];
  indexStatus: IndexStatusVm | null;
}) {
  const sourceSummary = getSourceSummary(notebook, evidence);
  const indexLabel = getIndexLabel(indexStatus);

  return (
    <Card className="rounded-lg">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Timestamped source</CardTitle>
            <CardDescription>
              Transcript ready. Studio artifacts can now be generated.
            </CardDescription>
          </div>
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <MetricRow label="Evidence segments" value={notebook.segmentCount} />
        <MetricRow
          label="Duration"
          value={
            notebook.durationSec ? formatDuration(notebook.durationSec) : "Unknown"
          }
        />
        <MetricRow label="Source type" value={sourceSummary.sourceLabel} />
        <MetricRow label="Engine" value={sourceSummary.engineLabel} />
        <MetricRow label="Search index" value={indexLabel} />
        {sourceSummary.language ? (
          <MetricRow label="Language" value={sourceSummary.language} />
        ) : null}
        {indexStatus?.retrievalMode === "local_lexical_fallback" ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            Chat can still run with local retrieval fallback.
          </div>
        ) : null}
        {sourceSummary.asrUsed ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            Captions were not available, so LectureMind used speech
            transcription.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function MetricRow({
  label,
  value
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ProgressPanel({
  progress,
  currentStep,
  metadata,
  status,
  isStarting
}: {
  progress: number;
  currentStep: string | null | undefined;
  metadata?: Record<string, unknown> | null;
  status: JobStatus;
  isStarting: boolean;
}) {
  const activeStep = currentStep ?? "Validating URL";
  const clampedProgress = Math.max(5, Math.min(progress, 100));
  const sourceSummary = getSourceSummaryFromMetadata(metadata);
  const labelIndex = progressSteps.findIndex((step) =>
    activeStep.includes(step.label)
  );
  const progressIndex = progressSteps.reduce(
    (latest, step, index) => (clampedProgress >= step.progress ? index : latest),
    0
  );
  const activeIndex = labelIndex >= 0 ? labelIndex : progressIndex;

  return (
    <Card className="rounded-lg">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Ingestion progress</CardTitle>
            <CardDescription>{activeStep}</CardDescription>
          </div>
          {isStarting || status === "RUNNING" || status === "QUEUED" ? (
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          ) : (
            <CircleDashed className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{sourceSummary.engineLabel}</Badge>
          {sourceSummary.fallbackUsed ? (
            <Badge variant="warning">Fallback path</Badge>
          ) : null}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${clampedProgress}%` }}
          />
        </div>
        <div className="mt-5 space-y-3">
          {progressSteps.map((step, index) => {
            const complete =
              clampedProgress === 100 || (activeIndex >= 0 && index < activeIndex);
            const active = index === activeIndex && clampedProgress < 100;

            return (
              <div
                key={step.label}
                className={cn(
                  "flex items-center gap-3 text-sm",
                  complete || active
                    ? "text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {complete ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : active ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <CircleDashed className="h-4 w-4" />
                )}
                <span>{step.label}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function TranscriptTimeline({
  evidence,
  segmentCount,
  onSeek
}: {
  evidence: EvidenceVm[];
  segmentCount: number;
  onSeek: (seconds: number) => void;
}) {
  if (evidence.length === 0) {
    return (
      <Card className="rounded-lg">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading {segmentCount.toLocaleString()} evidence segments
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-lg">
      <CardHeader className="pb-3">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <CardTitle className="text-base">Transcript timeline</CardTitle>
            <CardDescription>
              {evidence.length.toLocaleString()} timestamped source segments
            </CardDescription>
          </div>
          <Badge variant="success">Grounded evidence</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
          {evidence.map((segment) => (
            <div
              key={segment.id}
              className="grid gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-muted/30 sm:grid-cols-[5.5rem_1fr]"
            >
              <button
                className="inline-flex h-8 w-fit items-center justify-center rounded-full border bg-background px-3 text-xs font-semibold text-primary shadow-sm hover:bg-primary hover:text-primary-foreground"
                onClick={() => onSeek(segment.startSec)}
                type="button"
              >
                {formatTimestamp(segment.startSec)}
              </button>
              <div className="space-y-2">
                <p className="leading-6">{segment.text}</p>
                {segment.sourceType === "AUTO_CAPTION" ? (
                  <Badge variant="secondary">Auto caption</Badge>
                ) : null}
                {segment.sourceType === "ASR" ? (
                  <Badge variant="warning">Azure Speech</Badge>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TranscriptSkeleton() {
  return (
    <Card className="rounded-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Transcript timeline</CardTitle>
        <CardDescription>Building timestamped source evidence</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="grid gap-3 sm:grid-cols-[5.5rem_1fr]">
            <Skeleton className="h-8 w-20 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ChatPane({
  notebookId,
  notebookStatus,
  evidenceCount,
  indexStatus,
  selectedLanguage,
  preference,
  initialChatMessages,
  onSeek
}: {
  notebookId: string;
  notebookStatus: NotebookStatus;
  evidenceCount: number;
  indexStatus: IndexStatusVm | null;
  selectedLanguage: string;
  preference: PreferenceValues;
  initialChatMessages: ChatMessageVm[];
  onSeek: (seconds: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessageVm[]>(initialChatMessages);
  const [error, setError] = useState<ChatErrorVm | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const ready = notebookStatus === "READY" && evidenceCount > 0;
  const examples = [
    "What is this lecture about?",
    "Explain the main concept simply.",
    "Quiz me on this lecture",
    "What should I review before an exam?"
  ];

  const sendMessage = useCallback(
    async (message: string) => {
      const trimmed = message.trim();

      if (!ready || !trimmed || isSending) {
        return;
      }

      const userMessage: ChatMessageVm = {
        id: `user-${Date.now()}`,
        role: "user",
        content: trimmed
      };

      setMessages((current) => [...current, userMessage]);
      setDraft("");
      setError(null);
      setLastFailedMessage(null);
      setIsSending(true);

      try {
        const response = await fetch(`/api/notebooks/${notebookId}/chat`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            message: trimmed,
            language: selectedLanguage,
            mode: normalizeChatMode(preference.chatMode),
            responseLength: normalizeResponseLength(preference.responseLength)
          })
        });
        const payload = (await response.json()) as
          | ChatSuccessPayload
          | ChatErrorPayload;

        if (!response.ok || isChatErrorPayload(payload)) {
          setError(toChatError(payload));
          setLastFailedMessage(trimmed);
          return;
        }

        setMessages((current) => [
          ...current,
          {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            content: payload.answer,
            citations: payload.citations,
            retrievalMode: payload.retrievalMode,
            contextSegmentCount: payload.metadata.contextSegmentCount
          }
        ]);
      } catch {
        setError({
          code: "NETWORK_ERROR",
          message: "Chat failed safely. Try again in a moment."
        });
        setLastFailedMessage(trimmed);
      } finally {
        setIsSending(false);
      }
    },
    [
      isSending,
      notebookId,
      preference.chatMode,
      preference.responseLength,
      ready,
      selectedLanguage
    ]
  );

  return (
    <div className="flex flex-1 flex-col border-t">
      <div className="flex max-h-[420px] flex-1 flex-col gap-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-8 text-center">
            <div className="max-w-md">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent">
                <BookOpen className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-xl font-semibold">Ask from the lecture</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {ready
                  ? "Answers will use retrieved transcript evidence and verified citations."
                  : "Chat is paused until timestamped evidence is ready."}
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {examples.map((example) => (
                  <Button
                    key={example}
                    className="h-auto justify-start whitespace-normal text-left"
                    disabled={!ready}
                    onClick={() => setDraft(example)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {example}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "max-w-[86%] rounded-lg border px-3 py-2 text-sm leading-6",
                message.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "mr-auto bg-muted/40"
              )}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.role === "assistant" ? (
                <div className="mt-3 space-y-2">
                  {message.citations?.length ? (
                    <div className="flex flex-wrap gap-2">
                      {message.citations.map((citation) => (
                        <button
                          key={citation.evidenceSegmentId}
                          className="rounded-full border bg-background px-2.5 py-1 text-xs font-medium text-primary shadow-sm hover:bg-primary hover:text-primary-foreground"
                          onClick={() => onSeek(citation.startSec)}
                          type="button"
                        >
                          [{citation.label}]
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {message.retrievalMode === "local_lexical_fallback"
                      ? "Using local retrieval fallback"
                      : "Grounded in lecture evidence"}
                    {message.contextSegmentCount
                      ? ` across ${message.contextSegmentCount} moments`
                      : ""}
                    .
                  </p>
                </div>
              ) : null}
            </div>
          ))
        )}
        {isSending ? (
          <div className="mr-auto flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Retrieving lecture evidence
          </div>
        ) : null}
        {error ? (
          <ChatErrorCard
            error={error}
            isRetrying={isSending}
            onRetry={
              lastFailedMessage
                ? () => {
                    void sendMessage(lastFailedMessage);
                  }
                : undefined
            }
          />
        ) : null}
        {indexStatus?.retrievalMode === "azure_hybrid" && ready ? (
          <p className="text-center text-xs text-muted-foreground">
            Grounded in lecture evidence.
          </p>
        ) : null}
        {indexStatus?.retrievalMode === "local_lexical_fallback" && ready ? (
          <p className="text-center text-xs text-muted-foreground">
            Using local retrieval fallback.
          </p>
        ) : null}
      </div>
      <form
        className="border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();

          void sendMessage(draft);
        }}
      >
        <div className="flex gap-2">
          <textarea
            className="min-h-10 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!ready || isSending}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendMessage(draft);
              }
            }}
            placeholder={
              ready
                ? "Ask a question about this lecture..."
                : "Waiting for transcript grounding..."
            }
            rows={1}
            value={draft}
          />
          <Button
            disabled={!ready || !draft.trim() || isSending}
            size="icon"
            type="submit"
          >
            {isSending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            <span className="sr-only">Send</span>
          </Button>
        </div>
      </form>
    </div>
  );
}

function ChatErrorCard({
  error,
  isRetrying,
  onRetry
}: {
  error: ChatErrorVm;
  isRetrying: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className="mr-auto max-w-[86%] rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 shadow-sm dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-2">
          <p>{error.message}</p>
          <p className="text-xs text-amber-800/80 dark:text-amber-200/80">
            {error.code}
            {error.details?.verificationReason
              ? ` · ${error.details.verificationReason}`
              : ""}
          </p>
          {onRetry ? (
            <Button
              disabled={isRetrying}
              onClick={onRetry}
              size="sm"
              type="button"
              variant="outline"
            >
              {isRetrying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <History className="h-4 w-4" />
              )}
              Retry
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StudioPane({
  artifacts,
  evidence,
  notebookId,
  notebookStatus,
  onSeek,
  selectedLanguage,
  onToggle
}: {
  artifacts: StudioArtifact[];
  evidence: EvidenceVm[];
  notebookId: string;
  notebookStatus: NotebookStatus;
  onSeek: (seconds: number) => void;
  selectedLanguage: string;
  onToggle?: () => void;
}) {
  return (
    <section className="h-full overflow-y-auto rounded-lg border bg-background p-4 md:border-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            Studio
          </p>
          <h2 className="mt-1 text-lg font-semibold">Study artifacts</h2>
        </div>
        {onToggle ? (
          <Button
            aria-label="Collapse studio pane"
            onClick={onToggle}
            size="icon"
            variant="ghost"
          >
            <PanelRightClose className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      <StudioArtifactsPanel
        evidence={evidence}
        initialArtifacts={artifacts}
        notebookId={notebookId}
        notebookStatus={notebookStatus}
        onSeek={onSeek}
        selectedLanguage={selectedLanguage}
      />
    </section>
  );
}

function FailureCard({
  errorType,
  errorMessage,
  compact = false,
  isRetrying = false,
  onRetry,
  retryAllowed = true
}: {
  errorType: string | null;
  errorMessage: string | null;
  compact?: boolean;
  isRetrying?: boolean;
  onRetry?: () => void;
  retryAllowed?: boolean;
}) {
  const key =
    errorType && errorType in videoErrorCopy
      ? (errorType as VideoErrorType)
      : "UNKNOWN";
  const copy = videoErrorCopy[key];

  return (
    <Card
      className={cn(
        "rounded-lg border-red-200 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950 dark:text-red-50",
        compact && "rounded-md"
      )}
    >
      <CardHeader className={compact ? "p-4 pb-2" : "pb-3"}>
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <CardTitle className={compact ? "text-sm" : "text-lg"}>
              {copy.userTitle}
            </CardTitle>
            <CardDescription className="mt-1 text-red-800 dark:text-red-200">
              {errorMessage ?? copy.userMessage}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      {copy.examples || copy.retryable ? (
        <CardContent className={compact ? "p-4 pt-0" : "pt-0"}>
          <div className="space-y-2">
            {copy.retryable && onRetry && retryAllowed ? (
              <Button
                className="w-full justify-start"
                disabled={isRetrying}
                onClick={onRetry}
                size="sm"
                variant="outline"
              >
                {isRetrying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <History className="h-4 w-4" />
                )}
                Retry processing
              </Button>
            ) : null}
            {copy.examples?.map((example) => (
              <Button
                key={example}
                className="h-auto w-full justify-start whitespace-normal text-left"
                disabled
                size="sm"
                variant="outline"
              >
                <FileText className="h-4 w-4 shrink-0" />
                {example}
              </Button>
            ))}
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}

function CollapsedPane({
  label,
  onClick,
  side
}: {
  label: string;
  onClick: () => void;
  side: "left" | "right";
}) {
  const Icon = side === "left" ? ChevronRight : ChevronLeft;

  return (
    <button
      aria-label={label}
      className="flex h-full w-12 items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={onClick}
      type="button"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

type SourceSummary = {
  sourceLabel: string;
  engineLabel: string;
  language: string | null;
  asrUsed: boolean;
  fallbackUsed: boolean;
};

function getSourceSummary(
  notebook: NotebookVm,
  evidence: EvidenceVm[] = []
): SourceSummary {
  const metadataSummary = getSourceSummaryFromMetadata(
    notebook.latestJob?.metadata
  );
  const firstEvidence = evidence[0];

  if (!firstEvidence) {
    return metadataSummary;
  }

  return {
    sourceLabel: getSourceLabel(firstEvidence.sourceType),
    engineLabel:
      getEngineLabel(firstEvidence.extractionEngine) ??
      metadataSummary.engineLabel,
    language: firstEvidence.language ?? metadataSummary.language,
    asrUsed: firstEvidence.sourceType === "ASR" || metadataSummary.asrUsed,
    fallbackUsed: metadataSummary.fallbackUsed
  };
}

function getSourceSummaryFromMetadata(
  metadata?: Record<string, unknown> | null
): SourceSummary {
  return {
    sourceLabel: getString(metadata?.sourceLabel) ?? "YouTube captions",
    engineLabel: getString(metadata?.engineLabel) ?? "YouTube captions",
    language: getString(metadata?.language),
    asrUsed: metadata?.asrUsed === true,
    fallbackUsed: metadata?.fallbackUsed === true
  };
}

function getSourceLabel(sourceType: EvidenceVm["sourceType"] | unknown) {
  if (sourceType === "ASR") {
    return "Azure Speech transcription";
  }

  if (sourceType === "AUTO_CAPTION") {
    return "YouTube auto-captions";
  }

  return "YouTube captions";
}

function getEngineLabel(engine?: string | null) {
  if (engine === "azure-speech") {
    return "Azure Speech fallback";
  }

  if (engine === "yt-dlp-caption" || engine === "yt-dlp-auto-caption") {
    return "Advanced worker";
  }

  if (engine === "node-transcript") {
    return "YouTube captions";
  }

  return null;
}

function getString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function getNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function canRetryNotebook(notebook: NotebookVm) {
  const attempts = notebook.latestJob?.attempts ?? 0;
  const retryLimit =
    getNumber(notebook.latestJob?.metadata?.retryLimit) ??
    getNumber(notebook.latestJob?.metadata?.retry_limit) ??
    2;

  return attempts < retryLimit;
}

function getIndexLabel(indexStatus: IndexStatusVm | null) {
  if (!indexStatus) {
    return "Checking";
  }

  if (indexStatus.indexedSegmentCount > 0) {
    return `${indexStatus.indexedSegmentCount.toLocaleString()} indexed`;
  }

  if (indexStatus.status === "RUNNING" || indexStatus.status === "QUEUED") {
    return "Indexing";
  }

  if (indexStatus.status === "FALLBACK") {
    return "Local fallback";
  }

  if (indexStatus.status === "FAILED") {
    return "Fallback available";
  }

  return "Not started";
}

function normalizeChatMode(value: string): "study" | "exam" | "simple" | "deep" {
  if (value === "learning-guide") {
    return "study";
  }

  if (value === "custom") {
    return "deep";
  }

  if (value === "exam" || value === "simple" || value === "deep") {
    return value;
  }

  return "study";
}

function normalizeResponseLength(value: string): "short" | "medium" | "long" {
  if (value === "longer") {
    return "long";
  }

  if (value === "short" || value === "long") {
    return value;
  }

  return "medium";
}

function isChatErrorPayload(
  payload: ChatSuccessPayload | ChatErrorPayload
): payload is ChatErrorPayload {
  return "error" in payload;
}

function toChatError(payload: ChatSuccessPayload | ChatErrorPayload): ChatErrorVm {
  if (isChatErrorPayload(payload) && payload.error) {
    return {
      code: payload.error.code,
      message: payload.error.message,
      details: payload.error.details
    };
  }

  return {
    code: "CHAT_FAILED",
    message: "Chat failed safely. Try again in a moment."
  };
}

function formatTimestamp(seconds: number) {
  const rounded = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function formatDuration(seconds: number) {
  return formatTimestamp(seconds);
}
