"use client";

import * as React from "react";
import Link from "next/link";

import { FacultyArtifactCards } from "@/components/faculty/FacultyArtifactCards";
import {
  FacultyArtifactPanel,
  type FacultyArtifactRecord
} from "@/components/faculty/FacultyArtifactPanel";
import { FacultyChatPane } from "@/components/faculty/FacultyChatPane";
import { LectureVideoEmbed } from "@/components/faculty/LectureVideoEmbed";
import { FacultySignoutButton } from "@/components/faculty/FacultySignoutButton";
import { FacultyTranscriptPane } from "@/components/faculty/FacultyTranscriptPane";
import { LMLogo, LMWordmark } from "@/components/ui/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  getFacultyWorkspacePollIntervalMs,
  useFacultyStore
} from "@/lib/faculty/store";

type WorkspacePayload = {
  status: string;
  title?: string | null;
  lectureUrl?: string | null;
  videoId?: string | null;
  transcriptText?: string | null;
  segmentCount: number;
  indexedCount: number;
  artifacts: FacultyArtifactRecord[];
};

export function FacultyWorkspace({ sessionId }: { sessionId: string }) {
  const setSession = useFacultyStore((state) => state.setSession);
  const setStatus = useFacultyStore((state) => state.setStatus);
  const reportRunning = useFacultyStore((state) => state.reportRunning);
  const uploadInProgress = useFacultyStore((state) => state.uploadInProgress);
  const [payload, setPayload] = React.useState<WorkspacePayload | null>(null);

  const refresh = React.useCallback(async () => {
    const response = await fetch(`/api/faculty/workspace/${sessionId}/status`, {
      cache: "no-store"
    });
    if (!response.ok) return;
    const next = (await response.json()) as WorkspacePayload;
    setPayload(next);
    setStatus(normalizeStatus(next.status));
  }, [sessionId, setStatus]);
  const pollIntervalMs = getFacultyWorkspacePollIntervalMs({
    workspaceStatus: payload?.status,
    artifactStatuses: (payload?.artifacts ?? []).map((artifact) => artifact.status),
    reportRunning,
    uploadInProgress
  });

  React.useEffect(() => {
    setSession({ sessionId, workspaceId: null });
    window.localStorage.setItem("lecturemind_faculty_session", sessionId);
    void refresh();
  }, [refresh, sessionId, setSession]);

  React.useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;

    const schedule = () => {
      timeoutId = window.setTimeout(() => {
        void refresh().finally(() => {
          if (!cancelled) {
            schedule();
          }
        });
      }, pollIntervalMs);
    };

    schedule();

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [pollIntervalMs, refresh]);

  React.useEffect(() => {
    const interval = window.setInterval(() => {
      void fetch(`/api/faculty/session/${sessionId}/heartbeat`, {
        method: "POST"
      });
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [sessionId]);

  const ready = payload?.status === "ready" && (payload.indexedCount ?? 0) > 0;
  const statuses = Object.fromEntries(
    (payload?.artifacts ?? []).map((artifact) => [artifact.type, artifact.status])
  );

  return (
    <main className="flex min-h-screen flex-col bg-lm-paper text-lm-ink dark:bg-lm-ink dark:text-lm-paper">
      <header className="sticky top-0 z-40 border-b border-black/10 bg-lm-paper/85 backdrop-blur-2xl dark:border-white/10 dark:bg-lm-ink/85">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-3">
            <LMLogo size={30} />
            <LMWordmark className="text-xl" />
          </Link>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <FacultySignoutButton sessionId={sessionId} />
          </div>
        </div>
      </header>
      <section className="mx-auto grid w-full max-w-7xl flex-1 gap-5 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-h-[calc(100vh-7rem)] flex-col gap-4">
          <div className="rounded-lg border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-lm-indigo dark:text-lm-amber">
              Faculty workspace
            </p>
            <h1 className="mt-2 font-space-grotesk text-2xl font-semibold">
              {payload?.title ?? "Preparing lecture review"}
            </h1>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-black/10 px-2 py-1 capitalize dark:border-white/10">
                {payload?.status ?? "pending"}
              </span>
              <span className="rounded-full border border-black/10 px-2 py-1 dark:border-white/10">
                {payload?.segmentCount ?? 0} segments
              </span>
              <span className="rounded-full border border-black/10 px-2 py-1 dark:border-white/10">
                {payload?.indexedCount ?? 0} indexed
              </span>
            </div>
          </div>
          <LectureVideoEmbed videoId={payload?.videoId} />
          <FacultyTranscriptPane transcriptText={payload?.transcriptText} />
          <FacultyChatPane sessionId={sessionId} ready={ready} />
        </div>
        <div className="space-y-4">
          <FacultyArtifactCards statuses={statuses} />
        </div>
      </section>
      <FacultyArtifactPanel
        sessionId={sessionId}
        artifacts={payload?.artifacts ?? []}
        onRefresh={refresh}
      />
    </main>
  );
}

function normalizeStatus(status: string): "idle" | "creating" | "ingesting" | "indexing" | "ready" | "failed" {
  if (
    status === "creating" ||
    status === "ingesting" ||
    status === "indexing" ||
    status === "ready" ||
    status === "failed"
  ) {
    return status;
  }
  return "idle";
}
