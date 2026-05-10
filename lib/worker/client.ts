import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  VideoProcessingError,
  videoErrorTypes
} from "@/lib/video-errors";

const workerErrorTypeSchema = z.enum(videoErrorTypes);

const workerMetadataSchema = z.object({
  videoId: z.string().min(1),
  title: z.string().min(1),
  author: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),
  durationSec: z.number().int().positive().nullable().optional(),
  isLive: z.boolean().optional(),
  normalizedUrl: z.string().url()
});

const workerSegmentSchema = z.object({
  startSec: z.number().min(0),
  endSec: z.number().min(0),
  text: z.string().trim().min(1),
  sourceType: z.enum(["CAPTION", "AUTO_CAPTION", "ASR"]),
  confidence: z.number().min(0).max(1).default(1),
  language: z.string().nullable().optional(),
  extractionEngine: z.enum([
    "yt-dlp-caption",
    "yt-dlp-auto-caption",
    "azure-speech"
  ]),
  rawSource: z.enum(["manual-caption", "auto-caption", "audio-asr"])
});

const workerDiagnosticsSchema = z.object({
  engine: z.string().default("yt-dlp"),
  captionTrackFound: z.boolean().default(false),
  asrUsed: z.boolean().default(false),
  segmentCount: z.number().int().min(0).default(0),
  requestId: z.string().nullable().optional(),
  details: z.record(z.unknown()).optional()
});

const workerSuccessSchema = z.object({
  status: z.literal("READY"),
  metadata: workerMetadataSchema,
  segments: z.array(workerSegmentSchema).min(1),
  diagnostics: workerDiagnosticsSchema
});

const workerFailureSchema = z.object({
  status: z.literal("FAILED"),
  error: z.object({
    type: workerErrorTypeSchema,
    userTitle: z.string().min(1),
    userMessage: z.string().min(1),
    retryable: z.boolean()
  }),
  diagnostics: workerDiagnosticsSchema
});

const workerResponseSchema = z.discriminatedUnion("status", [
  workerSuccessSchema,
  workerFailureSchema
]);

export type WorkerProcessResult = z.infer<typeof workerSuccessSchema>;

export type WorkerProcessInput = {
  notebookId: string;
  videoUrl: string;
  videoId: string;
  preferredLanguage: string;
  allowAsrFallback: boolean;
  maxDurationSeconds: number;
};

const DEFAULT_WORKER_URL = "http://localhost:8000";
const WORKER_TIMEOUT_MS = 20 * 60 * 1000;

export async function processWithWorker(
  input: WorkerProcessInput
): Promise<WorkerProcessResult> {
  const workerUrl = process.env.PYTHON_WORKER_URL?.trim() || DEFAULT_WORKER_URL;
  const endpoint = new URL("/process-youtube", workerUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WORKER_TIMEOUT_MS);
  const requestId = randomUUID();

  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "x-request-id": requestId
    };
    const sharedSecret = process.env.WORKER_SHARED_SECRET?.trim();

    if (sharedSecret) {
      headers["x-lecturemind-worker-secret"] = sharedSecret;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      body: JSON.stringify(input),
      headers,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new VideoProcessingError({
        type: "WORKER_UNAVAILABLE",
        technicalMessage: `Worker returned HTTP ${response.status}.`
      });
    }

    const raw = await response.json();
    const parsed = workerResponseSchema.safeParse(raw);

    if (!parsed.success) {
      throw new VideoProcessingError({
        type: "WORKER_UNAVAILABLE",
        technicalMessage: `Worker returned an invalid payload: ${parsed.error.message}`
      });
    }

    if (parsed.data.status === "FAILED") {
      throw new VideoProcessingError({
        type: parsed.data.error.type,
        userTitle: parsed.data.error.userTitle,
        userMessage: parsed.data.error.userMessage,
        retryable: parsed.data.error.retryable,
        technicalMessage: `Worker failed: ${parsed.data.error.type}`
      });
    }

    return parsed.data;
  } catch (error) {
    if (error instanceof VideoProcessingError) {
      throw error;
    }

    throw new VideoProcessingError({
      type: "WORKER_UNAVAILABLE",
      technicalMessage: error instanceof Error ? error.message : String(error)
    });
  } finally {
    clearTimeout(timeout);
  }
}
