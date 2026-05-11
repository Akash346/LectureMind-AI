"use client";

import { create } from "zustand";

export type DemoChat = {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl?: string;
  createdAt: string;
  artifacts?: {
    outline?: boolean;
    summary?: boolean;
    flashcards?: boolean;
    mindMap?: boolean;
    quiz?: boolean;
    report?: boolean;
  };
};

export type DemoChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type DemoState = {
  isDemo: boolean;
  chats: DemoChat[];
  messagesByChatId: Record<string, DemoChatMessage[]>;
  startDemo: () => void;
  resetDemo: () => void;
  addDemoChat: (title: string, videoUrl: string) => DemoChat;
  setDemoMessages: (chatId: string, messages: DemoChatMessage[]) => void;
};

const initialDemoChat: DemoChat = {
  id: "demo-chat",
  title: "How large language models understand context",
  videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  createdAt: new Date().toISOString(),
  artifacts: {
    outline: true,
    summary: true,
    flashcards: true,
    mindMap: true,
    quiz: true,
    report: true
  }
};

export const useDemoStore = create<DemoState>((set, get) => ({
  isDemo: false,
  chats: [],
  messagesByChatId: {},
  startDemo: () =>
    set({
      isDemo: true,
      chats: [initialDemoChat]
    }),
  resetDemo: () => set({ isDemo: false, chats: [], messagesByChatId: {} }),
  addDemoChat: (title, videoUrl) => {
    const chat = {
      id: `demo-${Date.now()}`,
      title,
      videoUrl,
      thumbnailUrl: getYouTubeThumbnail(videoUrl),
      createdAt: new Date().toISOString(),
      artifacts: {
        outline: false,
        summary: false,
        flashcards: false,
        mindMap: false,
        quiz: false,
        report: false
      }
    };
    set({ chats: [chat, ...get().chats], isDemo: true });
    return chat;
  },
  setDemoMessages: (chatId, messages) =>
    set((state) => ({
      messagesByChatId: {
        ...state.messagesByChatId,
        [chatId]: messages
      }
    }))
}));

function getYouTubeThumbnail(url: string) {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
  const id = match?.[1];
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined;
}
