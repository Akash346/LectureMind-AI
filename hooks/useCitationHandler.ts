"use client";

import { useCallback } from "react";

import { usePlayerStore } from "@/lib/stores/usePlayerStore";

type YouTubePlayerLike = {
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
  pauseVideo?: () => void;
};

export function useCitationHandler() {
  const playerRef = usePlayerStore((state) => state.playerRef);
  const flashPlayer = usePlayerStore((state) => state.flashPlayer);

  return useCallback(
    (timestampSec: number) => {
      const player = playerRef?.current as YouTubePlayerLike | null | undefined;

      if (!player || typeof player.seekTo !== "function") {
        return;
      }

      player.seekTo(timestampSec, true);

      if (typeof player.pauseVideo === "function") {
        player.pauseVideo();
      }

      if (typeof flashPlayer === "function") {
        flashPlayer();
      }
    },
    [playerRef, flashPlayer]
  );
}
