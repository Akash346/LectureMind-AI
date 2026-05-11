"use client";

import * as React from "react";

import { useDemoUiFlag } from "@/components/ui/brand/useDemoUiFlag";
import { useDemoStore } from "@/lib/stores/useDemoStore";
import { WorkspaceShell } from "./WorkspaceShell";

type WorkspaceChat = {
  id: string;
  title: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  createdAt?: string;
};

type WorkspaceRouteClientProps = {
  chatId: string;
  initialChat?: WorkspaceChat | null;
  initialChats?: WorkspaceChat[];
  initialIsDemo?: boolean;
};

export function WorkspaceRouteClient({
  chatId,
  initialChat,
  initialChats = [],
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
      title: "Untitled Chat"
    } satisfies WorkspaceChat);

  return (
    <WorkspaceShell activeChat={activeChat} chats={chats} isDemo={isDemo} />
  );
}
