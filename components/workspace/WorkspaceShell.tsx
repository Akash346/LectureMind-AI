"use client";

import * as React from "react";
import {
  Group as PanelGroup,
  Panel,
  Separator as PanelResizeHandle,
  useDefaultLayout
} from "react-resizable-panels";

import { ArtifactDock } from "./ArtifactDock";
import { ArtifactPanel } from "./ArtifactPanel";
import { ChatRail } from "./ChatRail";
import { ChatSurface, type ChatMessage } from "./ChatSurface";
import { VideoPanel } from "./VideoPanel";
import { WorkspaceHeader } from "./WorkspaceHeader";

type WorkspaceChat = {
  id: string;
  title: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  createdAt?: string;
  status?: string;
  language?: string;
  videoId?: string | null;
  videoTitle?: string | null;
  durationSec?: number | null;
  errorType?: string | null;
  errorMessage?: string | null;
  segmentCount?: number;
};

type WorkspaceShellProps = {
  activeChat: WorkspaceChat;
  chats: WorkspaceChat[];
  initialMessages?: ChatMessage[];
  isDemo?: boolean;
  user?: {
    image?: string | null;
    name?: string | null;
  } | null;
};

export function WorkspaceShell({
  activeChat,
  chats,
  initialMessages = [],
  isDemo = false,
  user
}: WorkspaceShellProps) {
  const [status, setStatus] = React.useState(() =>
    normalizeWorkspaceStatus(activeChat, isDemo)
  );
  const [indexStatus, setIndexStatus] =
    React.useState<WorkspaceIndexStatus | null>(null);
  const processStartedRef = React.useRef(false);
  const indexStartedRef = React.useRef(false);
  const workspaceLayout = useDefaultLayout({
    id: "workspace-layout-v2",
    panelIds: ["left", "center"]
  });

  React.useEffect(() => {
    setStatus(normalizeWorkspaceStatus(activeChat, isDemo));
    setIndexStatus(null);
    processStartedRef.current = false;
    indexStartedRef.current = false;
  }, [activeChat, isDemo]);

  const refreshStatus = React.useCallback(async () => {
    if (isDemo) return;

    const response = await fetch(`/api/notebooks/${activeChat.id}/status`, {
      cache: "no-store"
    });

    if (!response.ok) return;

    const payload = (await response.json()) as WorkspaceStatus;
    setStatus((current) => ({
      ...current,
      ...payload,
      language: current.language
    }));
  }, [activeChat.id, isDemo]);

  const refreshIndexStatus = React.useCallback(async () => {
    if (isDemo) return;

    const response = await fetch(`/api/notebooks/${activeChat.id}/index/status`, {
      cache: "no-store"
    });

    if (!response.ok) return;

    const payload = (await response.json()) as WorkspaceIndexStatus;
    setIndexStatus(payload);
  }, [activeChat.id, isDemo]);

  React.useEffect(() => {
    if (isDemo || status.status !== "PENDING" || processStartedRef.current) {
      return;
    }

    processStartedRef.current = true;
    void fetch(`/api/notebooks/${activeChat.id}/process`, {
      method: "POST"
    }).finally(() => {
      void refreshStatus();
    });
  }, [activeChat.id, isDemo, refreshStatus, status.status]);

  React.useEffect(() => {
    if (isDemo || !["PENDING", "PROCESSING"].includes(status.status)) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshStatus();
    }, 1500);

    return () => window.clearInterval(interval);
  }, [isDemo, refreshStatus, status.status]);

  React.useEffect(() => {
    if (isDemo || status.status !== "READY" || status.segmentCount <= 0) {
      return;
    }

    void refreshIndexStatus();
  }, [isDemo, refreshIndexStatus, status.segmentCount, status.status]);

  React.useEffect(() => {
    if (
      isDemo ||
      !indexStatus?.shouldIndex ||
      indexStartedRef.current ||
      status.status !== "READY"
    ) {
      return;
    }

    indexStartedRef.current = true;
    void fetch(`/api/notebooks/${activeChat.id}/index`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: false })
    }).finally(() => {
      void refreshIndexStatus();
    });
  }, [
    activeChat.id,
    indexStatus?.shouldIndex,
    isDemo,
    refreshIndexStatus,
    status.status
  ]);

  React.useEffect(() => {
    if (
      isDemo ||
      !indexStatus ||
      !["QUEUED", "RUNNING"].includes(indexStatus.status)
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshIndexStatus();
    }, 2500);

    return () => window.clearInterval(interval);
  }, [indexStatus, isDemo, refreshIndexStatus]);

  const videoUrl = status.videoId
    ? `https://www.youtube.com/watch?v=${status.videoId}`
    : activeChat.videoUrl;

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-lm-paper text-lm-ink dark:bg-lm-ink dark:text-lm-paper">
      <WorkspaceHeader title={activeChat.title} isDemo={isDemo} user={user} />
      <PanelGroup
        id="workspace-layout-v2"
        data-auto-save-id="workspace-layout-v2"
        defaultLayout={workspaceLayout.defaultLayout}
        onLayoutChanged={workspaceLayout.onLayoutChanged}
        orientation="horizontal"
      >
        <Panel id="left" defaultSize="18%" minSize="5%" maxSize="28%">
          <ChatRail
            activeChatId={activeChat.id}
            chats={chats}
            collapsed={false}
            isDemo={isDemo}
          />
        </Panel>
        <ResizeHandle />
        <Panel id="center" minSize="40%">
          <div className="flex h-full min-h-0">
            <div className="min-w-0 flex-1">
              <PanelGroup orientation="vertical">
                <Panel id="video" defaultSize="48%" minSize="28%">
                  <section className="h-full overflow-y-auto p-4">
                    <VideoPanel
                      errorMessage={status.errorMessage}
                      status={status.status}
                      title={status.videoTitle ?? activeChat.title}
                      videoUrl={videoUrl}
                    />
                  </section>
                </Panel>
                <ResizeHandle direction="vertical" />
                <Panel id="chat" minSize="24%">
                  <ChatSurface
                    chatId={activeChat.id}
                    evidenceCount={status.segmentCount}
                    initialMessages={initialMessages}
                    isDemo={isDemo}
                    language={status.language}
                    notebookStatus={status.status}
                  />
                </Panel>
              </PanelGroup>
            </div>
            <ArtifactDock
              canGenerate={
                isDemo || (status.status === "READY" && status.segmentCount > 0)
              }
              chatId={activeChat.id}
              isDemo={isDemo}
              language={status.language}
            />
            <ArtifactPanel chatId={activeChat.id} />
          </div>
        </Panel>
      </PanelGroup>
    </main>
  );
}

type WorkspaceStatus = {
  status: string;
  videoId: string | null;
  videoTitle: string | null;
  durationSec: number | null;
  errorType: string | null;
  errorMessage: string | null;
  segmentCount: number;
  language: string;
};

type WorkspaceIndexStatus = {
  status: string;
  shouldIndex: boolean;
  indexedSegmentCount: number;
  totalEvidenceSegments: number;
  fallbackReason: string | null;
};

function normalizeWorkspaceStatus(
  chat: WorkspaceChat,
  isDemo: boolean
): WorkspaceStatus {
  return {
    status: isDemo ? "READY" : chat.status ?? "PENDING",
    videoId: chat.videoId ?? null,
    videoTitle: chat.videoTitle ?? null,
    durationSec: chat.durationSec ?? null,
    errorType: chat.errorType ?? null,
    errorMessage: chat.errorMessage ?? null,
    segmentCount: isDemo ? Math.max(chat.segmentCount ?? 3, 3) : chat.segmentCount ?? 0,
    language: chat.language ?? "en"
  };
}

function ResizeHandle({ direction = "horizontal" }: { direction?: "horizontal" | "vertical" }) {
  if (direction === "vertical") {
    return (
      <PanelResizeHandle className="h-1 bg-black/10 transition hover:bg-lm-indigo/40 dark:bg-white/10" />
    );
  }

  return (
    <PanelResizeHandle className="w-1 bg-black/10 transition hover:bg-lm-indigo/40 dark:bg-white/10" />
  );
}
