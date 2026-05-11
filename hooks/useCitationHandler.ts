"use client";

import { useCallback } from "react";

import { usePlayerStore } from "@/lib/stores/usePlayerStore";

type YouTubePlayerLike = {
  seekTo?: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo?: () => void;
};

export function useCitationHandler() {
  const playerRef = usePlayerStore((state) => state.playerRef);
  const flashPlayer = usePlayerStore((state) => state.flashPlayer);
  const seekTo = usePlayerStore((state) => state.seekTo);

  return useCallback(
    (timestampSec: number) => {
      const player = playerRef?.current as YouTubePlayerLike | null | undefined;

      if (player && typeof player.seekTo === "function") {
        player.seekTo(timestampSec, true);
        player.playVideo?.();
      } else {
        seekTo(timestampSec);
      }

      if (typeof flashPlayer === "function") {
        flashPlayer();
      }
    },
    [playerRef, flashPlayer, seekTo]
  );
}
