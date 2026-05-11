"use client";

import * as React from "react";
import YouTube, { type YouTubeEvent } from "react-youtube";

import { usePlayerStore } from "@/lib/stores/usePlayerStore";
import { extractYouTubeId } from "@/lib/utils/youtube";

type VideoPanelProps = {
  notebookId?: string;
  videoUrl?: string;
  title?: string;
  status?: string;
  errorMessage?: string | null;
  errorType?: string | null;
  onTranscriptUploaded?: () => Promise<void> | void;
};

export function VideoPanel({
  notebookId,
  videoUrl,
  title,
  status,
  errorMessage,
  errorType,
  onTranscriptUploaded
}: VideoPanelProps) {
  const videoId = videoUrl ? extractYouTubeId(videoUrl) : null;
  const setPlayer = usePlayerStore((state) => state.setPlayer);
  const playerFlashKey = usePlayerStore((state) => state.playerFlashKey);
  const seekRequest = usePlayerStore((state) => state.seekRequest);
  const [isFlashing, setIsFlashing] = React.useState(false);
  const [playerError, setPlayerError] = React.useState(false);
  const [transcriptFile, setTranscriptFile] = React.useState<File | null>(null);
  const [uploadingTranscript, setUploadingTranscript] = React.useState(false);
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = React.useState<string | null>(null);
  const playerVars = React.useMemo(() => {
    const values: Record<string, string | number> = {
      enablejsapi: 1,
      playsinline: 1,
      rel: 0,
      modestbranding: 1
    };

    if (typeof window !== "undefined") {
      values.origin = window.location.origin;
    }

    return values;
  }, []);

  React.useEffect(() => {
    setPlayerError(false);
  }, [videoId]);

  React.useEffect(() => {
    setUploadError(null);
    setUploadSuccess(null);
    setTranscriptFile(null);
  }, [videoId, errorType, status]);

  React.useEffect(() => {
    if (playerFlashKey === 0) return;

    setIsFlashing(true);
    const timeout = setTimeout(() => setIsFlashing(false), 300);

    return () => clearTimeout(timeout);
  }, [playerFlashKey]);

  React.useEffect(() => {
    if (!seekRequest) return;

    const player = usePlayerStore.getState().playerRef.current;
    player?.seekTo?.(seekRequest.seconds, true);
    player?.playVideo?.();
  }, [seekRequest]);

  const showTranscriptWarning = Boolean(
    errorType &&
      errorMessage &&
      (status === "FAILED" || status === "READY")
  );
  const loginBlockedByYouTube =
    errorType === "LOGIN_REQUIRED" || errorType === "AGE_RESTRICTED";
  const canUploadTranscriptFallback =
    Boolean(notebookId) && showTranscriptWarning;

  if (!videoId) {
    if (status === "FAILED") {
      return (
        <div className="rounded-xl border border-red-200 bg-red-50 px-6 py-4 text-sm text-red-950 dark:border-red-900 dark:bg-red-950 dark:text-red-50">
          <div className="text-center">
            <p className="font-medium">Video could not be prepared.</p>
            {errorMessage ? <p className="mt-2 opacity-80">{errorMessage}</p> : null}
            {errorType ? (
              <p className="mt-2 font-mono text-xs opacity-70">Error code: {errorType}</p>
            ) : null}
          </div>
          {canUploadTranscriptFallback ? renderTranscriptUploadFallback() : null}
        </div>
      );
    }

    return (
      <div className="flex aspect-video items-center justify-center rounded-xl border border-black/10 bg-black/[0.03] text-sm text-black/50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/50">
        {status === "PENDING" || status === "PROCESSING"
          ? "Preparing lecture video"
          : "Video preview will appear here"}
      </div>
    );
  }

  if (playerError) {
    return (
      <div className="flex aspect-video flex-col items-center justify-center rounded-xl border border-black/10 bg-black/[0.03] px-6 text-center text-sm text-black/60 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60">
        <p className="font-medium">This video could not load here.</p>
        {videoUrl ? (
          <a
            className="mt-3 rounded-md border border-black/10 px-3 py-2 text-sm font-medium text-lm-indigo transition hover:border-lm-indigo dark:border-white/10 dark:text-lm-amber"
            href={videoUrl}
            rel="noreferrer"
            target="_blank"
          >
            Open on YouTube
          </a>
        ) : null}
      </div>
    );
  }

  async function handleTranscriptUpload() {
    if (!notebookId || !transcriptFile || uploadingTranscript) {
      return;
    }

    setUploadError(null);
    setUploadSuccess(null);
    setUploadingTranscript(true);

    try {
      const formData = new FormData();
      formData.set("file", transcriptFile);

      const response = await fetch(`/api/notebooks/${notebookId}/evidence`, {
        method: "POST",
        body: formData
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; segmentCount?: number }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Transcript upload failed.");
      }

      const segmentCount = typeof payload.segmentCount === "number" ? payload.segmentCount : 0;
      setUploadSuccess(
        segmentCount > 0
          ? `Transcript uploaded. ${segmentCount} evidence segments are ready.`
          : "Transcript uploaded. Evidence is ready."
      );
      setTranscriptFile(null);
      await onTranscriptUploaded?.();
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Transcript upload failed."
      );
    } finally {
      setUploadingTranscript(false);
    }
  }

  function renderTranscriptUploadFallback() {
    return (
      <div className="mt-3 space-y-2 rounded-lg border border-amber-300/70 bg-white/70 p-3 dark:border-amber-700/60 dark:bg-black/20">
        <p className="text-xs font-medium uppercase tracking-wide opacity-80">
          Continue with your own transcript
        </p>
        <p className="text-xs opacity-85">
          Upload `.vtt`, `.srt`, `.txt`, or `.json` transcript files to continue with chat and artifacts in this workspace.
        </p>
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <input
            type="file"
            accept=".vtt,.srt,.txt,.json,text/plain,text/vtt,application/json"
            onChange={(event) => {
              setUploadError(null);
              setUploadSuccess(null);
              setTranscriptFile(event.target.files?.[0] ?? null);
            }}
            className="block w-full text-xs"
          />
          <button
            type="button"
            disabled={!transcriptFile || uploadingTranscript}
            onClick={() => void handleTranscriptUpload()}
            className="rounded-md border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-xs font-medium transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploadingTranscript ? "Uploading..." : "Upload Transcript"}
          </button>
        </div>
        {uploadError ? <p className="text-xs text-red-700 dark:text-red-300">{uploadError}</p> : null}
        {uploadSuccess ? <p className="text-xs text-emerald-700 dark:text-emerald-300">{uploadSuccess}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className={[
          "relative aspect-video overflow-hidden rounded-xl border border-black/10 bg-black transition-shadow dark:border-white/10",
          isFlashing ? "shadow-[0_0_0_3px_rgba(245,181,68,0.45)]" : ""
        ].join(" ")}
      >
        <YouTube
          videoId={videoId}
          className="absolute inset-0 h-full w-full"
          iframeClassName="h-full w-full"
          title={title}
          onReady={(event: YouTubeEvent) => {
            setPlayerError(false);
            setPlayer(event.target);
            const pendingSeek = usePlayerStore.getState().seekRequest;

            if (pendingSeek) {
              event.target.seekTo?.(pendingSeek.seconds, true);
              event.target.playVideo?.();
            }
          }}
          onError={() => setPlayerError(true)}
          opts={{
            width: "100%",
            height: "100%",
            playerVars
          }}
        />
      </div>

      {showTranscriptWarning ? (
        <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
          <p className="font-medium">
            {loginBlockedByYouTube
              ? "YouTube blocked transcript extraction for this video."
              : "Transcript is unavailable for this video."}
          </p>
          <p className="opacity-90">
            {loginBlockedByYouTube
              ? "Error: LOGIN_REQUIRED. YouTube requires direct user access and did not allow server-side extraction for this request."
              : errorMessage}
          </p>
          <p className="mt-1 font-mono text-xs opacity-70">Error code: {errorType}</p>

          {canUploadTranscriptFallback ? renderTranscriptUploadFallback() : null}
        </div>
      ) : null}
    </div>
  );
}
