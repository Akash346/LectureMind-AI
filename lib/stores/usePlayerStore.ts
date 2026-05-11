"use client";

import { create } from "zustand";

type YouTubePlayerLike = {
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
  pauseVideo?: () => void;
};

type PlayerState = {
  player: YouTubePlayerLike | null;
  setPlayer: (player: YouTubePlayerLike | null) => void;
  seekTo: (seconds: number) => void;
  pauseVideo: () => void;
};

export const usePlayerStore = create<PlayerState>((set, get) => ({
  player: null,
  setPlayer: (player) => set({ player }),
  seekTo: (seconds) => {
    const player = get().player;
    player?.seekTo?.(seconds, true);
  },
  pauseVideo: () => {
    get().player?.pauseVideo?.();
  }
}));
