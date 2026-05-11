"use client";

import * as React from "react";
import { AlertCircle, X, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FacultyAccessibilityUploadView } from "@/components/faculty/FacultyAccessibilityUploadView";
import { FacultyBiasReportView } from "@/components/faculty/FacultyBiasReportView";
import { FacultyImprovementReportView } from "@/components/faculty/FacultyImprovementReportView";
import { useFacultyStore, type FacultyArtifactType } from "@/lib/faculty/store";
import {
  FacultyBiasReportSchema,
  FacultyImprovementReportSchema,
  type FacultyAccessibilityRemediation,
  type FacultyBiasReport,
  type FacultyImprovementReport
} from "@/lib/faculty/prompts";

export type FacultyArtifactRecord = {
  id: string;
  type: string;
  status: string;
  title?: string | null;
  json?: unknown;
  storageKey?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
};

export function FacultyArtifactPanel({
  sessionId,
  artifacts,
  onRefresh
}: {
  sessionId: string;
  artifacts: FacultyArtifactRecord[];
  onRefresh: () => void | Promise<void>;
}) {
  const activeArtifact = useFacultyStore((state) => state.activeArtifact);
  const setActiveArtifact = useFacultyStore((state) => state.setActiveArtifact);
  const setReportRunning = useFacultyStore((state) => state.setReportRunning);
  const [loading, setLoading] = React.useState(false);
  const [revealed, setRevealed] = React.useState<
    FacultyImprovementReport | FacultyBiasReport | null
  >(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setRevealed(null);
    setError(null);
  }, [activeArtifact]);

  if (!activeArtifact) return null;

  const backendType =
    activeArtifact === "improvement"
      ? "improvement_report"
      : activeArtifact === "bias"
        ? "bias_report"
        : "accessibility_report";
  const artifact = artifacts.find((item) => item.type === backendType);
  const docxArtifact = artifacts.find((item) => item.type === "accessibility_docx");
  const report = revealed ?? artifact?.json ?? null;
  const reportCanRender = canRenderReport(activeArtifact, report);

  async function generateReport() {
    if (activeArtifact === "accessibility") return;

    const reportName =
      activeArtifact === "bias" ? "Bias report" : "Improvement report";

    setLoading(true);
    setReportRunning(true);
    setRevealed(null);
    setError(null);
    const endpoint =
      activeArtifact === "improvement"
        ? "/api/faculty/reports/improvement"
        : "/api/faculty/reports/bias";

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId })
      });
      const payload = await readJsonBody(response);

      if (!response.ok) {
        throw new Error(`${reportName} could not be generated. Please try again.`);
      }

      setRevealed(payload.report as FacultyImprovementReport | FacultyBiasReport);
      refreshSafely(onRefresh);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : `${reportName} could not be generated. Please try again.`
      );
      refreshSafely(onRefresh);
    } finally {
      setLoading(false);
      setReportRunning(false);
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-2xl overflow-y-auto border-l border-black/10 bg-lm-paper p-5 shadow-2xl dark:border-white/10 dark:bg-lm-ink">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="font-space-grotesk text-2xl font-semibold capitalize">
          {activeArtifact} Report
        </h2>
        <Button size="icon" variant="ghost" onClick={() => setActiveArtifact(null)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      {activeArtifact !== "accessibility" && !reportCanRender ? (
        <Button disabled={loading} onClick={() => void generateReport()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading
            ? "Generating..."
            : activeArtifact === "bias"
              ? "Generate Bias Report"
              : "Generate Report"}
        </Button>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="mt-4 flex gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}
      {loading ? (
        <div className="mt-6 space-y-3">
          <div className="h-5 w-1/2 animate-pulse rounded bg-black/10 dark:bg-white/10" />
          <div className="h-28 w-full animate-pulse rounded-lg bg-black/10 dark:bg-white/10" />
          <div className="h-28 w-full animate-pulse rounded-lg bg-black/10 dark:bg-white/10" />
        </div>
      ) : null}
      <div className="mt-5">
        {activeArtifact === "improvement" ? (
          <FacultyImprovementReportView
            report={report as FacultyImprovementReport | null}
          />
        ) : activeArtifact === "bias" ? (
          <FacultyBiasReportView report={report as FacultyBiasReport | null} />
        ) : (
          <FacultyAccessibilityUploadView
            sessionId={sessionId}
            report={artifact?.json as FacultyAccessibilityRemediation | null}
            docxArtifactId={docxArtifact?.id ?? null}
            onComplete={onRefresh}
          />
        )}
      </div>
    </div>
  );
}

async function readJsonBody(response: Response) {
  try {
    return (await response.json()) as { report?: unknown };
  } catch {
    return {};
  }
}

function refreshSafely(refresh: () => void | Promise<void>) {
  void Promise.resolve(refresh()).catch(() => undefined);
}

function canRenderReport(
  activeArtifact: FacultyArtifactType,
  report: unknown
) {
  if (!report) return false;
  if (activeArtifact === "improvement") {
    return FacultyImprovementReportSchema.safeParse(report).success;
  }
  if (activeArtifact === "bias") {
    return FacultyBiasReportSchema.safeParse(report).success;
  }
  return true;
}
