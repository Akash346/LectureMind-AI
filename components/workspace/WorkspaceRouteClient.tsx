"use client";

import * as React from "react";

import { useDemoUiFlag } from "@/components/ui/brand/useDemoUiFlag";
import { useDemoStore } from "@/lib/stores/useDemoStore";
import type { ChatMessage } from "./ChatSurface";
import { WorkspaceShell } from "./WorkspaceShell";

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

type WorkspaceRouteClientProps = {
  chatId: string;
  initialChat?: WorkspaceChat | null;
  initialChats?: WorkspaceChat[];
  initialMessages?: ChatMessage[];
  initialIsDemo?: boolean;
};

export function WorkspaceRouteClient({
  chatId,
  initialChat,
  initialChats = [],
  initialMessages = [],
  initialIsDemo = false
}: WorkspaceRouteClientProps) {
  const isDemoUiFlag = useDemoUiFlag();
  const demoChats = useDemoStore((state) => state.chats);
  const startDemo = useDemoStore((state) => state.startDemo);
  const isDemo = initialIsDemo || isDemoUiFlag;

  React.useEffect(() => {
    if (isDemo && demoChats.length === 0) {
      startDemo();
    }
  }, [demoChats.length, isDemo, startDemo]);

  const chats = isDemo && demoChats.length > 0 ? demoChats : initialChats;
  const activeChat =
    chats.find((chat) => chat.id === chatId) ??
    initialChat ??
    ({
      id: chatId,
      title: "Untitled Chat",
      status: "PENDING",
      language: "en",
      segmentCount: 0
    } satisfies WorkspaceChat);

  return (
    <WorkspaceShell
      activeChat={activeChat}
      chats={chats}
      initialMessages={initialMessages}
      isDemo={isDemo}
    />
  );
}
