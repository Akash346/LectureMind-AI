"use client";

import { create } from "zustand";

type YouTubePlayerLike = {
  seekTo?: (seconds: number, allowSeekAhead?: boolean) => void;
  pauseVideo?: () => void;
  playVideo?: () => void;
};

const playerRef: { current: YouTubePlayerLike | null } = {
  current: null
};

type PlayerState = {
  player: YouTubePlayerLike | null;
  playerRef: typeof playerRef;
  playerFlashKey: number;
  seekRequest: { seconds: number; key: number } | null;
  setPlayer: (player: YouTubePlayerLike | null) => void;
  flashPlayer: () => void;
  seekTo: (seconds: number) => void;
  pauseVideo: () => void;
};

export const usePlayerStore = create<PlayerState>((set, get) => ({
  player: null,
  playerRef,
  playerFlashKey: 0,
  seekRequest: null,
  setPlayer: (player) => {
    playerRef.current = player;
    set({ player });
  },
  flashPlayer: () =>
    set((state) => ({ playerFlashKey: state.playerFlashKey + 1 })),
  seekTo: (seconds) => {
    const player = get().playerRef.current ?? get().player;
    player?.seekTo?.(seconds, true);
    player?.playVideo?.();
    set((state) => ({
      seekRequest: {
        seconds,
        key: (state.seekRequest?.key ?? 0) + 1
      }
    }));
  },
  pauseVideo: () => {
    (get().playerRef.current ?? get().player)?.pauseVideo?.();
  }
}));
