"use client";

import * as React from "react";
import { Download, Loader2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FacultyProgressTimeline } from "@/components/faculty/FacultyProgressTimeline";
import { useFacultyStore } from "@/lib/faculty/store";
import type { FacultyAccessibilityRemediation } from "@/lib/faculty/prompts";

const STEPS = [
  "Upload received",
  "OCR with Mistral",
  "Reading order rebuilt",
  "Accessibility remediation",
  "Accessible DOCX created",
  "Report ready"
];

export function FacultyAccessibilityUploadView({
  sessionId,
  report,
  docxArtifactId,
  onComplete
}: {
  sessionId: string;
  report?: FacultyAccessibilityRemediation | null;
  docxArtifactId?: string | null;
  onComplete: () => void;
}) {
  const addUpload = useFacultyStore((state) => state.addUpload);
  const updateUpload = useFacultyStore((state) => state.updateUpload);
  const setUploadInProgress = useFacultyStore(
    (state) => state.setUploadInProgress
  );
  const [file, setFile] = React.useState<File | null>(null);
  const [activeStep, setActiveStep] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setActiveStep(0);
    setError(null);
  }, [file]);

  async function run() {
    if (!file) return;

    setBusy(true);
    setUploadInProgress(true);
    setError(null);
    setActiveStep(0);
    const optimisticId = `upload-${Date.now()}`;
    addUpload({
      id: optimisticId,
      originalName: file.name,
      status: "uploaded"
    });
    let progressTimer: number | null = null;
    let persistedUploadId: string | null = null;

    try {
      const formData = new FormData();
      formData.append("sessionId", sessionId);
      formData.append("file", file);
      const uploadResponse = await fetch("/api/faculty/upload", {
        method: "POST",
        body: formData
      });
      const uploadPayload = await uploadResponse.json();
      if (!uploadResponse.ok) {
        throw new Error(uploadPayload.error ?? "Upload failed.");
      }
      persistedUploadId = uploadPayload.uploadId;
      updateUpload(optimisticId, {
        id: uploadPayload.uploadId,
        status: "ocr"
      });
      setActiveStep(1);
      progressTimer = window.setInterval(() => {
        setActiveStep((current) => Math.min(current + 1, 4));
      }, 1400);
      const reportResponse = await fetch("/api/faculty/reports/accessibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          uploadId: uploadPayload.uploadId
        })
      });
      const reportPayload = await reportResponse.json();
      if (!reportResponse.ok) {
        throw new Error(
          reportPayload.error ?? "Accessibility remediation could not be completed."
        );
      }
      updateUpload(uploadPayload.uploadId, { status: "complete" });
      setActiveStep(STEPS.length);
      onComplete();
    } catch (caught) {
      updateUpload(persistedUploadId ?? optimisticId, { status: "failed" });
      setError(
        caught instanceof Error
          ? caught.message
          : "Accessibility remediation could not be completed."
      );
    } finally {
      if (progressTimer !== null) {
        window.clearInterval(progressTimer);
      }
      setBusy(false);
      setUploadInProgress(false);
    }
  }

  return (
    <div className="space-y-5">
      <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-black/20 bg-black/[0.02] p-6 text-center transition hover:border-lm-indigo/40 dark:border-white/20 dark:bg-white/[0.04]">
        <Upload className="h-6 w-6 text-lm-indigo dark:text-lm-amber" />
        <span className="mt-3 text-sm font-medium">
          {file ? file.name : "Upload PDF or DOCX"}
        </span>
        <input
          className="sr-only"
          type="file"
          accept="application/pdf,.docx"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
      </label>
      {file ? (
        <Button disabled={busy} onClick={() => void run()} type="button">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Generate accessibility report
        </Button>
      ) : null}
      {busy || (activeStep > 0 && activeStep < STEPS.length && !report) ? (
        <FacultyProgressTimeline steps={STEPS} activeIndex={activeStep} />
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {report ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.04]">
            <h3 className="font-space-grotesk font-semibold">Remediation Summary</h3>
            <p className="mt-2 text-sm leading-6">
              {report.remediation_report.summary}
            </p>
          </div>
          {report.remediation_report.applied_fixes.map((fix) => (
            <div key={`${fix.issue_type}-${fix.after}`} className="rounded-lg border border-black/10 p-3 text-sm dark:border-white/10">
              <p className="font-medium">{fix.issue_type}</p>
              <p className="mt-1 text-black/65 dark:text-white/65">{fix.reason}</p>
            </div>
          ))}
        </div>
      ) : null}
      {docxArtifactId ? (
        <Button asChild variant="outline">
          <a href={`/api/faculty/download/${docxArtifactId}?sessionId=${sessionId}`}>
            <Download className="h-4 w-4" />
            Download Accessible DOCX
          </a>
        </Button>
      ) : null}
    </div>
  );
}
