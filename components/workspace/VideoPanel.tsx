"use client";

import * as React from "react";
import YouTube, { type YouTubeEvent } from "react-youtube";

import { usePlayerStore } from "@/lib/stores/usePlayerStore";
import { extractYouTubeId } from "@/lib/utils/youtube";

type VideoPanelProps = {
  videoUrl?: string;
  title?: string;
  status?: string;
  errorMessage?: string | null;
};

export function VideoPanel({
  videoUrl,
  title,
  status,
  errorMessage
}: VideoPanelProps) {
  const videoId = videoUrl ? extractYouTubeId(videoUrl) : null;
  const setPlayer = usePlayerStore((state) => state.setPlayer);
  const playerFlashKey = usePlayerStore((state) => state.playerFlashKey);
  const seekRequest = usePlayerStore((state) => state.seekRequest);
  const [isFlashing, setIsFlashing] = React.useState(false);
  const [playerError, setPlayerError] = React.useState(false);
  const playerVars = React.useMemo(() => {
    const values: Record<string, string | number> = {
      enablejsapi: 1,
      playsinline: 1,
      rel: 0,
      modestbranding: 1
    };

    if (typeof window !== "undefined") {
      values.origin = window.location.origin;
    }

    return values;
  }, []);

  React.useEffect(() => {
    setPlayerError(false);
  }, [videoId]);

  React.useEffect(() => {
    if (playerFlashKey === 0) return;

    setIsFlashing(true);
    const timeout = setTimeout(() => setIsFlashing(false), 300);

    return () => clearTimeout(timeout);
  }, [playerFlashKey]);

  React.useEffect(() => {
    if (!seekRequest) return;

    const player = usePlayerStore.getState().playerRef.current;
    player?.seekTo?.(seekRequest.seconds, true);
    player?.playVideo?.();
  }, [seekRequest]);

  if (status === "FAILED") {
    return (
      <div className="flex aspect-video flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 px-6 text-center text-sm text-red-950 dark:border-red-900 dark:bg-red-950 dark:text-red-50">
        <p className="font-medium">Video could not be prepared.</p>
        {errorMessage ? <p className="mt-2 opacity-80">{errorMessage}</p> : null}
      </div>
    );
  }

  if (!videoId) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl border border-black/10 bg-black/[0.03] text-sm text-black/50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/50">
        {status === "PENDING" || status === "PROCESSING"
          ? "Preparing lecture video"
          : "Video preview will appear here"}
      </div>
    );
  }

  if (playerError) {
    return (
      <div className="flex aspect-video flex-col items-center justify-center rounded-xl border border-black/10 bg-black/[0.03] px-6 text-center text-sm text-black/60 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/60">
        <p className="font-medium">This video could not load here.</p>
        {videoUrl ? (
          <a
            className="mt-3 rounded-md border border-black/10 px-3 py-2 text-sm font-medium text-lm-indigo transition hover:border-lm-indigo dark:border-white/10 dark:text-lm-amber"
            href={videoUrl}
            rel="noreferrer"
            target="_blank"
          >
            Open on YouTube
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={[
        "relative aspect-video overflow-hidden rounded-xl border border-black/10 bg-black transition-shadow dark:border-white/10",
        isFlashing ? "shadow-[0_0_0_3px_rgba(245,181,68,0.45)]" : ""
      ].join(" ")}
    >
      <YouTube
        videoId={videoId}
        className="absolute inset-0 h-full w-full"
        iframeClassName="h-full w-full"
        title={title}
        onReady={(event: YouTubeEvent) => {
          setPlayerError(false);
          setPlayer(event.target);
          const pendingSeek = usePlayerStore.getState().seekRequest;

          if (pendingSeek) {
            event.target.seekTo?.(pendingSeek.seconds, true);
            event.target.playVideo?.();
          }
        }}
        onError={() => setPlayerError(true)}
        opts={{
          width: "100%",
          height: "100%",
          playerVars
        }}
      />
    </div>
  );
}
