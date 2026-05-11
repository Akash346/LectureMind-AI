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
  const [isFlashing, setIsFlashing] = React.useState(false);

  React.useEffect(() => {
    if (playerFlashKey === 0) return;

    setIsFlashing(true);
    const timeout = window.setTimeout(() => setIsFlashing(false), 300);

    return () => window.clearTimeout(timeout);
  }, [playerFlashKey]);

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

  return (
    <div
      className={[
        "overflow-hidden rounded-xl border border-black/10 bg-black transition-shadow dark:border-white/10",
        isFlashing ? "shadow-[0_0_0_3px_rgba(245,181,68,0.45)]" : ""
      ].join(" ")}
    >
      <YouTube
        videoId={videoId}
        className="aspect-video w-full"
        iframeClassName="aspect-video w-full"
        title={title}
        onReady={(event: YouTubeEvent) => setPlayer(event.target)}
        opts={{
          width: "100%",
          height: "100%",
          playerVars: {
            rel: 0,
            modestbranding: 1
          }
        }}
      />
    </div>
  );
}
