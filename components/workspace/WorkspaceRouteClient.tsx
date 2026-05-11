"use client";

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
  user?: {
    image?: string | null;
    name?: string | null;
  } | null;
};

export function WorkspaceRouteClient({
  chatId,
  initialChat,
  initialChats = [],
  initialMessages = [],
  user
}: WorkspaceRouteClientProps) {
  const chats = initialChats;
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
      user={user}
    />
  );
}
