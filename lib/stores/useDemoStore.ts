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
    mindMap?: boolean;
    quiz?: boolean;
  };
};

type DemoState = {
  isDemo: boolean;
  chats: DemoChat[];
  startDemo: () => void;
  resetDemo: () => void;
  addDemoChat: (title: string, videoUrl: string) => DemoChat;
};

const initialDemoChat: DemoChat = {
  id: "demo-chat",
  title: "How large language models understand context",
  videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  thumbnailUrl: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
  createdAt: new Date().toISOString(),
  artifacts: {
    outline: true,
    mindMap: true,
    quiz: true
  }
};

export const useDemoStore = create<DemoState>((set, get) => ({
  isDemo: false,
  chats: [],
  startDemo: () =>
    set({
      isDemo: true,
      chats: [initialDemoChat]
    }),
  resetDemo: () => set({ isDemo: false, chats: [] }),
  addDemoChat: (title, videoUrl) => {
    const chat = {
      id: `demo-${Date.now()}`,
      title,
      videoUrl,
      thumbnailUrl: getYouTubeThumbnail(videoUrl),
      createdAt: new Date().toISOString(),
      artifacts: {
        outline: false,
        mindMap: false,
        quiz: false
      }
    };
    set({ chats: [chat, ...get().chats], isDemo: true });
    return chat;
  }
}));

function getYouTubeThumbnail(url: string) {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
  const id = match?.[1];
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : undefined;
}
