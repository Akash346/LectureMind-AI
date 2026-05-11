"use client";

import * as React from "react";

type FacultyTranscriptUploadFallbackProps = {
  sessionId: string;
  ingestErrorCode?: string | null;
  ingestErrorMessage?: string | null;
  onUploaded?: () => Promise<void> | void;
};

export function FacultyTranscriptUploadFallback({
  sessionId,
  ingestErrorCode,
  ingestErrorMessage,
  onUploaded
}: FacultyTranscriptUploadFallbackProps) {
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const isLoginBlocked =
    ingestErrorCode === "LOGIN_REQUIRED" || ingestErrorCode === "AGE_RESTRICTED";

  async function uploadTranscript() {
    if (!file || busy) return;

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.set("sessionId", sessionId);
      formData.set("file", file);

      const response = await fetch("/api/faculty/lecture/transcript", {
        method: "POST",
        body: formData
      });
      const payload = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            segmentCount?: number;
            indexedCount?: number;
          }
        | null;

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? "Transcript upload failed.");
      }

      const segmentCount = typeof payload.segmentCount === "number" ? payload.segmentCount : 0;
      setSuccess(
        segmentCount > 0
          ? `Transcript uploaded. ${segmentCount} segments are now ready for Faculty analysis.`
          : "Transcript uploaded. Faculty analysis is now ready."
      );
      setFile(null);
      await onUploaded?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Transcript upload failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100">
      <p className="font-medium">
        {isLoginBlocked
          ? "YouTube blocked transcript extraction for this lecture."
          : "Transcript evidence is not available yet for this lecture."}
      </p>
      <p className="mt-2 opacity-90">
        {isLoginBlocked
          ? "Error: LOGIN_REQUIRED. YouTube requires direct user access, so backend extraction was blocked in this environment."
          : ingestErrorMessage ||
            "If this lecture transcript is blocked or missing, upload your own transcript file to continue Faculty reports and chat."}
      </p>
      {ingestErrorCode ? (
        <p className="mt-2 font-mono text-xs opacity-75">Error code: {ingestErrorCode}</p>
      ) : null}

      <div className="mt-3 rounded-md border border-amber-300/70 bg-white/75 p-3 dark:border-amber-700/60 dark:bg-black/20">
        <p className="text-xs font-medium uppercase tracking-wide opacity-80">
          Upload transcript to continue
        </p>
        <p className="mt-1 text-xs opacity-85">
          Accepted formats: `.vtt`, `.srt`, `.txt`, `.json`.
        </p>
        <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center">
          <input
            type="file"
            accept=".vtt,.srt,.txt,.json,text/plain,text/vtt,application/json"
            onChange={(event) => {
              setError(null);
              setSuccess(null);
              setFile(event.target.files?.[0] ?? null);
            }}
            className="block w-full text-xs"
          />
          <button
            type="button"
            onClick={() => void uploadTranscript()}
            disabled={!file || busy}
            className="rounded-md border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-xs font-medium transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Uploading..." : "Upload Transcript"}
          </button>
        </div>
        {error ? <p className="mt-2 text-xs text-red-700 dark:text-red-300">{error}</p> : null}
        {success ? (
          <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">{success}</p>
        ) : null}
      </div>
    </section>
  );
}
