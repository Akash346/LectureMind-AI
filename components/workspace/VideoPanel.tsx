"use client";

import YouTube, { type YouTubeEvent } from "react-youtube";

import { usePlayerStore } from "@/lib/stores/usePlayerStore";
import { extractYouTubeId } from "@/lib/utils/youtube";

type VideoPanelProps = {
  videoUrl?: string;
};

export function VideoPanel({ videoUrl }: VideoPanelProps) {
  const videoId = videoUrl ? extractYouTubeId(videoUrl) : null;
  const setPlayer = usePlayerStore((state) => state.setPlayer);

  if (!videoId) {
    return (
      <div className="flex aspect-video items-center justify-center rounded-xl border border-black/10 bg-black/[0.03] text-sm text-black/50 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/50">
        Video preview will appear here
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-black/10 bg-black dark:border-white/10">
      <YouTube
        videoId={videoId}
        className="aspect-video w-full"
        iframeClassName="aspect-video w-full"
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
