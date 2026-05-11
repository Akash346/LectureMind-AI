import {
  type EvidenceSourceType,
  type Job,
  type Notebook,
  type NotebookStatus,
  type Prisma
} from "@prisma/client";

import {
  normalizeVideoError,
  VideoProcessingError,
  type VideoErrorType
} from "@/lib/video-errors";
import { isEmbeddingConfigured } from "@/lib/ai/embeddings";
import { enqueueJob } from "@/lib/jobs/job-store";
import { runJobSoon } from "@/lib/jobs/job-runner";
import { prisma } from "@/lib/prisma";
import {
  getSearchIndexName,
  isSearchConfigured
} from "@/lib/search/search-client";
import {
  processWithWorker,
  type WorkerProcessResult
} from "@/lib/worker/client";
import { fetchYouTubeMetadata, type YouTubeMetadata } from "@/lib/youtube/metadata";
import {
  fetchTranscriptSegments,
  type TranscriptSegment
} from "@/lib/youtube/transcript";
import { parseYouTubeUrl } from "@/lib/youtube/url";

const DEFAULT_MAX_VIDEO_DURATION_SEC = 3 * 60 * 60;
const FRESH_PROCESSING_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_TRANSCRIPT_LANGUAGE = "en";

const fallbackEligibleErrors = new Set<VideoErrorType>([
  "NO_CAPTIONS",
  "TRANSCRIPT_UNAVAILABLE",
  "NETWORK_ERROR",
  "RATE_LIMITED",
  "UNSUPPORTED_URL",
  // Production environments can receive transient YouTube gating states that
  // look restricted even for public videos; allow worker fallback before failing.
  "LOGIN_REQUIRED",
  "VIDEO_UNAVAILABLE",
  "AGE_RESTRICTED"
]);

type IngestionEngine = "node" | "worker" | "hybrid";

type NotebookForProcessing = Notebook & {
  jobs: Job[];
  _count: {
    evidenceSegments: number;
  };
};

type EvidenceRowInput = {
  notebookId: string;
  videoId: string;
  startSec: number;
  endSec: number;
  text: string;
  sourceType: EvidenceSourceType;
  confidence: number;
  language?: string | null;
  extractionEngine?: string | null;
  rawSource?: string | null;
};

type IngestionSuccess = {
  engine: IngestionEngine | "worker-fallback";
  engineLabel: string;
  fallbackUsed: boolean;
  asrUsed: boolean;
  metadata: YouTubeMetadata;
  segments: Array<{
    startSec: number;
    endSec: number;
    text: string;
    sourceType: EvidenceSourceType;
    confidence: number;
    language?: string | null;
    extractionEngine?: string | null;
    rawSource?: string | null;
  }>;
  diagnostics?: Prisma.InputJsonValue;
};

type IngestionRuntime = {
  startedAt: number;
  setStep: (step: string) => string;
};

export type ProcessNotebookVideoOptions = {
  force?: boolean;
};

export type ProcessNotebookVideoResult = {
  notebookId: string;
  status: NotebookStatus;
  videoId?: string | null;
  segmentCount?: number;
  errorType?: string | null;
  errorMessage?: string | null;
};

export async function processNotebookVideo(
  notebookId: string,
  userId: string,
  options: ProcessNotebookVideoOptions = {}
): Promise<ProcessNotebookVideoResult> {
  const startedAt = Date.now();
  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, userId },
    include: {
      jobs: {
        orderBy: { updatedAt: "desc" },
        take: 1
      },
      _count: {
        select: { evidenceSegments: true }
      }
    }
  });

  if (!notebook) {
    throw new VideoProcessingError({
      type: "UNKNOWN",
      technicalMessage: `Notebook ${notebookId} was not found for user.`
    });
  }

  if (notebook.status === "READY" && !options.force) {
    return {
      notebookId,
      status: notebook.status,
      videoId: notebook.videoId,
      segmentCount: notebook._count.evidenceSegments
    };
  }

  if (
    options.force &&
    notebook.status === "FAILED" &&
    (notebook.jobs[0]?.attempts ?? 0) >= getRetryLimit()
  ) {
    return {
      notebookId,
      status: notebook.status,
      videoId: notebook.videoId,
      errorType: notebook.errorType,
      errorMessage: notebook.errorMessage
    };
  }

  const runningJob = notebook.jobs.find((job) => job.status === "RUNNING");
  const isFreshRunningJob =
    runningJob &&
    Date.now() - runningJob.updatedAt.getTime() < FRESH_PROCESSING_WINDOW_MS;

  if (notebook.status === "PROCESSING" && isFreshRunningJob && !options.force) {
    return {
      notebookId,
      status: notebook.status,
      videoId: notebook.videoId,
      errorType: notebook.errorType,
      errorMessage: notebook.errorMessage
    };
  }

  let job: Job | null = null;
  let parsedVideoId: string | null = notebook.videoId;
  let currentStep = "Validating YouTube URL";
  const setCurrentStep = (step: string) => {
    currentStep = step;
    return step;
  };

  try {
    await prisma.notebook.update({
      where: { id: notebookId },
      data: {
        status: "PROCESSING",
        errorType: null,
        errorMessage: null
      }
    });

    job = await prisma.job.create({
      data: {
        notebookId,
        userId,
        type: "YOUTUBE_INGESTION",
        status: "RUNNING",
        progress: 5,
        progressPercent: 5,
        currentStep: "Validating YouTube URL",
        attempts: (notebook.jobs[0]?.attempts ?? 0) + 1,
        attemptCount: (notebook.jobs[0]?.attempts ?? 0) + 1,
        maxAttempts: getRetryLimit(),
        startedAt: new Date(),
        metadata: {
          engine: getIngestionEngine(),
          engineLabel: "YouTube captions"
        }
      }
    });

    logIngestionEvent("started", {
      notebookId,
      userId,
      jobId: job.id,
      engine: getIngestionEngine(),
      step: currentStep,
      durationMs: Date.now() - startedAt
    });

    const parsedUrl = parseYouTubeUrl(notebook.sourceUrl);
    parsedVideoId = parsedUrl.videoId;
    logIngestionEvent("youtube_url_parsed", {
      notebookId,
      userId,
      videoId: parsedUrl.videoId,
      jobId: job.id,
      engine: getIngestionEngine(),
      step: currentStep,
      durationMs: Date.now() - startedAt
    });
    const maxDurationSeconds = getMaxVideoDurationSeconds();

    await updateNotebookAndJob({
      notebookId,
      jobId: job.id,
      progress: 10,
      currentStep: setCurrentStep("Reading video details"),
      notebookData: {
        videoId: parsedUrl.videoId,
        sourceUrl: parsedUrl.normalizedUrl
      }
    });

    const result = await runIngestionStrategy({
      notebook,
      job,
      parsedUrl,
      maxDurationSeconds,
      runtime: {
        startedAt,
        setStep: setCurrentStep
      }
    });

    await updateJob(job.id, {
      progress: 90,
      currentStep: setCurrentStep("Saving grounded evidence"),
      metadata: buildJobMetadata(result)
    });

    const evidenceRows = result.segments.map((segment) => ({
      notebookId,
      videoId: result.metadata.videoId,
      startSec: segment.startSec,
      endSec: segment.endSec,
      text: segment.text,
      sourceType: segment.sourceType,
      confidence: segment.confidence,
      language: segment.language ?? null,
      extractionEngine: segment.extractionEngine ?? null,
      rawSource: segment.rawSource ?? null
    })) satisfies EvidenceRowInput[];

    await prisma.$transaction([
      prisma.evidenceSegment.deleteMany({
        where: { notebookId }
      }),
      prisma.evidenceSegment.createMany({
        data: evidenceRows
      }),
      prisma.notebook.update({
        where: { id: notebookId },
        data: {
          title: result.metadata.title,
          videoId: result.metadata.videoId,
          sourceUrl: result.metadata.normalizedUrl,
          videoTitle: result.metadata.title,
          thumbnailUrl: result.metadata.thumbnailUrl,
          durationSec: result.metadata.durationSec ?? null,
          status: "READY",
          errorType: null,
          errorMessage: null
        }
      }),
      prisma.job.update({
        where: { id: job.id },
        data: {
          status: "SUCCEEDED",
          progress: 100,
          progressPercent: 100,
          currentStep: "Ready",
          finishedAt: new Date(),
          errorType: null,
          errorMessage: null,
          errorCode: null,
          safeErrorMessage: null,
          metadata: buildJobMetadata(result)
        }
      })
    ]);

    logIngestionEvent("completed", {
      notebookId,
      userId,
      videoId: result.metadata.videoId,
      jobId: job.id,
      engine: result.engine,
      step: "Ready",
      durationMs: Date.now() - startedAt,
      segmentCount: evidenceRows.length
    });
    console.info(
      "[youtube:process]",
      JSON.stringify({
        event: "transcript_segments_ready",
        notebookId,
        segmentCount: evidenceRows.length
      })
    );

    await enqueueIndexEvidenceAfterTranscript({
      notebookId,
      userId,
      segmentCount: evidenceRows.length
    });

    return {
      notebookId,
      status: "READY",
      videoId: result.metadata.videoId,
      segmentCount: evidenceRows.length
    };
  } catch (error) {
    const safeError = normalizeVideoError(error);

    logIngestionEvent("youtube_process_failed", {
      notebookId,
      userId,
      videoId: parsedVideoId,
      jobId: job?.id,
      engine: getIngestionEngine(),
      step: currentStep,
      durationMs: Date.now() - startedAt,
      errorType: safeError.type
    });

    await prisma.notebook.update({
      where: { id: notebookId },
      data: {
        status: "FAILED",
        errorType: safeError.type,
        errorMessage: safeError.userMessage
      }
    });

    if (job) {
      await updateJob(job.id, {
        status: "FAILED",
        progress: 100,
        progressPercent: 100,
        currentStep: safeError.userTitle,
        errorType: safeError.type,
        errorMessage: safeError.userMessage,
        errorCode: safeError.type,
        safeErrorMessage: safeError.userMessage,
        finishedAt: new Date(),
        metadata: {
          ...(toRecord(job.metadata) ?? {}),
          errorType: safeError.type,
          retryable: safeError.retryable,
          retryLimit: getRetryLimit()
        }
      });
    }

    return {
      notebookId,
      status: "FAILED",
      errorType: safeError.type,
      errorMessage: safeError.userMessage
    };
  }
}

async function runIngestionStrategy({
  notebook,
  job,
  parsedUrl,
  maxDurationSeconds,
  runtime
}: {
  notebook: NotebookForProcessing;
  job: Job;
  parsedUrl: ReturnType<typeof parseYouTubeUrl>;
  maxDurationSeconds: number;
  runtime: IngestionRuntime;
}): Promise<IngestionSuccess> {
  const engine = getIngestionEngine();

  if (engine === "node") {
    return runNodeCaptionIngestion({
      notebook,
      job,
      parsedUrl,
      maxDurationSeconds,
      runtime
    });
  }

  if (engine === "worker") {
    return runWorkerIngestion({
      notebook,
      job,
      parsedUrl,
      maxDurationSeconds,
      fallbackUsed: false,
      runtime
    });
  }

  try {
    return await runNodeCaptionIngestion({
      notebook,
      job,
      parsedUrl,
      maxDurationSeconds,
      runtime
    });
  } catch (error) {
    const safeError = normalizeVideoError(error);

    if (!canFallbackToWorker(safeError.type)) {
      throw safeError;
    }

    await updateJob(job.id, {
      progress: 45,
      currentStep: runtime.setStep("Caption path unavailable, preparing fallback"),
      errorType: null,
      errorMessage: null,
      metadata: {
        engine: "hybrid",
        engineLabel: "Advanced worker",
        fallbackUsed: true,
        nodeErrorType: safeError.type
      }
    });

    return runWorkerIngestion({
      notebook,
      job,
      parsedUrl,
      maxDurationSeconds,
      fallbackUsed: true,
      runtime
    });
  }
}

async function runNodeCaptionIngestion({
  notebook,
  job,
  parsedUrl,
  maxDurationSeconds,
  runtime
}: {
  notebook: NotebookForProcessing;
  job: Job;
  parsedUrl: ReturnType<typeof parseYouTubeUrl>;
  maxDurationSeconds: number;
  runtime: IngestionRuntime;
}): Promise<IngestionSuccess> {
  const engine = getIngestionEngine();
  const metadataStep = runtime.setStep("Reading video details");
  const metadataStartedAt = Date.now();

  logIngestionEvent("youtube_metadata_started", {
    notebookId: notebook.id,
    userId: notebook.userId,
    videoId: parsedUrl.videoId,
    jobId: job.id,
    engine,
    step: metadataStep,
    durationMs: Date.now() - runtime.startedAt
  });

  let metadata: YouTubeMetadata;

  try {
    metadata = await fetchYouTubeMetadata({
      videoId: parsedUrl.videoId,
      normalizedUrl: parsedUrl.normalizedUrl
    });
  } catch (error) {
    const safeError = normalizeVideoError(error);
    logIngestionEvent("youtube_metadata_failed", {
      notebookId: notebook.id,
      userId: notebook.userId,
      videoId: parsedUrl.videoId,
      jobId: job.id,
      engine,
      step: metadataStep,
      errorType: safeError.type,
      durationMs: Date.now() - metadataStartedAt
    });
    throw error;
  }

  if (metadata.metadataSource === "fallback") {
    logIngestionEvent("youtube_metadata_fallback_used", {
      notebookId: notebook.id,
      userId: notebook.userId,
      videoId: parsedUrl.videoId,
      jobId: job.id,
      engine,
      step: metadataStep,
      errorType: metadata.metadataErrorType ?? null,
      durationMs: Date.now() - metadataStartedAt
    });
  }

  if (metadata.isLive) {
    throw new VideoProcessingError({
      type: "LIVE_STREAM_ACTIVE",
      technicalMessage: "Metadata marked video as actively live."
    });
  }

  if (
    metadata.durationSec !== undefined &&
    metadata.durationSec > maxDurationSeconds
  ) {
    throw new VideoProcessingError({
      type: "VIDEO_TOO_LONG",
      technicalMessage: `Duration ${metadata.durationSec}s exceeds ${maxDurationSeconds}s.`
    });
  }

  await updateNotebookAndJob({
    notebookId: notebook.id,
    jobId: job.id,
    progress: 20,
    currentStep: runtime.setStep("Checking existing captions"),
    notebookData: {
      title: metadata.title,
      videoTitle: metadata.title,
      thumbnailUrl: metadata.thumbnailUrl,
      durationSec: metadata.durationSec ?? null
    }
  });

  const captionStep = runtime.setStep("Checking existing captions");
  const captionStartedAt = Date.now();

  logIngestionEvent("youtube_caption_started", {
    notebookId: notebook.id,
    userId: notebook.userId,
    videoId: parsedUrl.videoId,
    jobId: job.id,
    engine,
    step: captionStep,
    durationMs: Date.now() - runtime.startedAt
  });

  let transcript: TranscriptSegment[];

  try {
    transcript = await fetchTranscriptSegments({
      videoId: parsedUrl.videoId,
      preferredLanguage: DEFAULT_TRANSCRIPT_LANGUAGE
    });
  } catch (error) {
    const safeError =
      metadata.requiresAgeVerification === true
        ? new VideoProcessingError({
            type: "AGE_RESTRICTED",
            technicalMessage:
              "Metadata indicated age verification and captions could not be read."
          })
        : normalizeVideoError(error);

    logIngestionEvent("youtube_caption_failed", {
      notebookId: notebook.id,
      userId: notebook.userId,
      videoId: parsedUrl.videoId,
      jobId: job.id,
      engine,
      step: captionStep,
      errorType: safeError.type,
      durationMs: Date.now() - captionStartedAt
    });

    throw safeError;
  }

  logIngestionEvent("youtube_caption_success", {
    notebookId: notebook.id,
    userId: notebook.userId,
    videoId: parsedUrl.videoId,
    jobId: job.id,
    engine,
    step: captionStep,
    durationMs: Date.now() - captionStartedAt,
    segmentCount: transcript.length
  });

  await updateJob(job.id, {
    progress: 35,
    currentStep: runtime.setStep("Building caption transcript"),
    metadata: {
      engine: "node",
      engineLabel: "YouTube captions"
    }
  });

  return {
    engine: "node",
    engineLabel: "YouTube captions",
    fallbackUsed: false,
    asrUsed: false,
    metadata,
    segments: transcript.map((segment) =>
      mapNodeTranscriptSegment(segment)
    ),
    diagnostics: {
      engine: "node-transcript",
      segmentCount: transcript.length
    }
  };
}

async function runWorkerIngestion({
  notebook,
  job,
  parsedUrl,
  maxDurationSeconds,
  fallbackUsed,
  runtime
}: {
  notebook: NotebookForProcessing;
  job: Job;
  parsedUrl: ReturnType<typeof parseYouTubeUrl>;
  maxDurationSeconds: number;
  fallbackUsed: boolean;
  runtime: IngestionRuntime;
}): Promise<IngestionSuccess> {
  if (!isWorkerEnabled()) {
    throw new VideoProcessingError({
      type: "WORKER_UNAVAILABLE",
      technicalMessage: "ENABLE_YTDLP_WORKER is false."
    });
  }

  await updateJob(job.id, {
    progress: 55,
    currentStep: runtime.setStep("Contacting processing worker"),
    metadata: {
      engine: fallbackUsed ? "worker-fallback" : "worker",
      engineLabel: "Advanced worker",
      fallbackUsed
    }
  });

  const workerResult = await processWithWorker({
    notebookId: notebook.id,
    videoUrl: parsedUrl.normalizedUrl,
    videoId: parsedUrl.videoId,
    preferredLanguage: DEFAULT_TRANSCRIPT_LANGUAGE,
    allowAsrFallback: isAzureSpeechFallbackEnabled(),
    maxDurationSeconds
  });

  if (workerResult.diagnostics.asrUsed) {
    await updateJob(job.id, {
      progress: 80,
      currentStep: runtime.setStep("Transcribing audio"),
      metadata: {
        engine: fallbackUsed ? "worker-fallback" : "worker",
        engineLabel: "Azure Speech fallback",
        fallbackUsed,
        asrUsed: true
      }
    });
  }

  const metadata = mapWorkerMetadata(workerResult);
  const sourceType = workerResult.segments[0]?.sourceType ?? "CAPTION";
  const asrUsed = workerResult.diagnostics.asrUsed || sourceType === "ASR";

  return {
    engine: fallbackUsed ? "worker-fallback" : "worker",
    engineLabel: asrUsed ? "Azure Speech fallback" : "Advanced worker",
    fallbackUsed,
    asrUsed,
    metadata,
    segments: workerResult.segments.map((segment) => ({
      startSec: segment.startSec,
      endSec: segment.endSec,
      text: segment.text,
      sourceType: segment.sourceType,
      confidence: segment.confidence,
      language: segment.language ?? DEFAULT_TRANSCRIPT_LANGUAGE,
      extractionEngine: segment.extractionEngine,
      rawSource: segment.rawSource
    })),
    diagnostics: workerResult.diagnostics as Prisma.InputJsonValue
  };
}

function mapNodeTranscriptSegment(
  segment: TranscriptSegment
): IngestionSuccess["segments"][number] {
  const isAutoCaption = segment.sourceType === "AUTO_CAPTION";

  return {
    startSec: segment.startSec,
    endSec: segment.endSec,
    text: segment.text,
    sourceType: segment.sourceType,
    confidence: segment.confidence,
    language: segment.language ?? DEFAULT_TRANSCRIPT_LANGUAGE,
    extractionEngine: "node-transcript",
    rawSource: isAutoCaption ? "auto-caption" : "manual-caption"
  };
}

function mapWorkerMetadata(workerResult: WorkerProcessResult): YouTubeMetadata {
  return {
    videoId: workerResult.metadata.videoId,
    title: workerResult.metadata.title,
    author: workerResult.metadata.author ?? undefined,
    thumbnailUrl:
      workerResult.metadata.thumbnailUrl ??
      `https://i.ytimg.com/vi/${workerResult.metadata.videoId}/hqdefault.jpg`,
    durationSec: workerResult.metadata.durationSec ?? undefined,
    isLive: workerResult.metadata.isLive,
    normalizedUrl: workerResult.metadata.normalizedUrl
  };
}

function buildJobMetadata(result: IngestionSuccess): Prisma.InputJsonValue {
  const firstSegment = result.segments[0];
  return {
    engine: result.engine,
    engineLabel: result.engineLabel,
    sourceType: firstSegment?.sourceType ?? null,
    sourceLabel: getSourceLabel(firstSegment?.sourceType),
    language: firstSegment?.language ?? null,
    extractionEngine: firstSegment?.extractionEngine ?? null,
    rawSource: firstSegment?.rawSource ?? null,
    asrUsed: result.asrUsed,
    fallbackUsed: result.fallbackUsed,
    segmentCount: result.segments.length,
    diagnostics: result.diagnostics ?? null
  };
}

function getSourceLabel(sourceType?: EvidenceSourceType | null) {
  if (sourceType === "ASR") {
    return "Azure Speech transcription";
  }

  if (sourceType === "AUTO_CAPTION") {
    return "YouTube auto-captions";
  }

  return "YouTube captions";
}

function getIngestionEngine(): IngestionEngine {
  const value = process.env.INGESTION_ENGINE?.trim().toLowerCase();

  if (value === "node" || value === "worker" || value === "hybrid") {
    return value;
  }

  return "hybrid";
}

function getMaxVideoDurationSeconds() {
  const parsed = Number(process.env.MAX_VIDEO_DURATION_SECONDS);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.round(parsed)
    : DEFAULT_MAX_VIDEO_DURATION_SEC;
}

function isAzureSpeechFallbackEnabled() {
  return process.env.ENABLE_AZURE_SPEECH_FALLBACK !== "false";
}

function isWorkerEnabled() {
  return process.env.ENABLE_YTDLP_WORKER !== "false";
}

function getRetryLimit() {
  const parsed = Number(process.env.INGESTION_RETRY_LIMIT);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 2;
}

function canFallbackToWorker(errorType: VideoErrorType) {
  return isWorkerEnabled() && fallbackEligibleErrors.has(errorType);
}

async function updateNotebookAndJob({
  notebookId,
  jobId,
  progress,
  currentStep,
  notebookData
}: {
  notebookId: string;
  jobId: string;
  progress: number;
  currentStep: string;
  notebookData: Prisma.NotebookUpdateInput;
}) {
  await prisma.$transaction([
    prisma.notebook.update({
      where: { id: notebookId },
      data: notebookData
    }),
    prisma.job.update({
      where: { id: jobId },
      data: {
        progress,
        progressPercent: progress,
        currentStep
      }
    })
  ]);
}

async function updateJob(
  jobId: string,
  data: Prisma.JobUpdateInput
) {
  const progress =
    typeof data.progress === "number"
      ? data.progress
      : typeof data.progress === "object" &&
          data.progress &&
          "set" in data.progress &&
          typeof data.progress.set === "number"
        ? data.progress.set
        : null;

  await prisma.job.update({
    where: { id: jobId },
    data: {
      ...data,
      ...(progress !== null ? { progressPercent: progress } : {})
    }
  });
}

async function enqueueIndexEvidenceAfterTranscript({
  notebookId,
  userId,
  segmentCount
}: {
  notebookId: string;
  userId: string;
  segmentCount: number;
}) {
  if (segmentCount === 0) {
    logIndexQueueEvent("index_evidence_not_enqueued", {
      notebookId,
      fallbackReason: "no_segments"
    });
    return;
  }

  const searchConfigured = isSearchConfigured();
  const embeddingsConfigured = isEmbeddingConfigured();

  if (!searchConfigured || !embeddingsConfigured) {
    logIndexQueueEvent("index_evidence_not_enqueued", {
      notebookId,
      segmentCount,
      indexName: getSearchIndexName(),
      searchConfigured,
      embeddingsConfigured,
      fallbackReason: !searchConfigured
        ? "search_not_configured"
        : "embeddings_not_configured"
    });
    return;
  }

  const existingJob = await prisma.job.findFirst({
    where: {
      notebookId,
      userId,
      type: "INDEX_EVIDENCE",
      status: {
        in: ["QUEUED", "RUNNING"]
      }
    },
    orderBy: {
      updatedAt: "desc"
    },
    select: {
      id: true
    }
  });

  if (existingJob) {
    logIndexQueueEvent("index_evidence_enqueued", {
      notebookId,
      jobId: existingJob.id,
      segmentCount,
      reusedExistingJob: true
    });
    runJobSoon(existingJob.id);
    return;
  }

  const job = await enqueueJob({
    notebookId,
    userId,
    type: "INDEX_EVIDENCE",
    currentStep: "Queued evidence indexing",
    maxAttempts: 2,
    metadata: {
      force: true,
      source: "youtube_ingestion",
      segmentCount
    } satisfies Prisma.InputJsonValue
  });

  logIndexQueueEvent("index_evidence_enqueued", {
    notebookId,
    jobId: job.id,
    segmentCount
  });
  runJobSoon(job.id);
}

function toRecord(value: Prisma.JsonValue | null) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, Prisma.JsonValue>)
    : null;
}

function logIngestionEvent(
  event: string,
  fields: Record<string, string | number | null | undefined>
) {
  console.info(
    "[youtube:process]",
    JSON.stringify({
      event,
      ...fields
    })
  );
}

function logIndexQueueEvent(
  event: string,
  fields: Record<string, unknown>
) {
  console.info(
    "[index]",
    JSON.stringify({
      event,
      ...fields
    })
  );
}
