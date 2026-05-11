"use client";

export function LectureVideoEmbed({ videoId }: { videoId?: string | null }) {
  if (!videoId) {
    return null;
  }

  return (
    <section className="rounded-lg border border-black/10 bg-white/70 p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.04]">
      <div className="aspect-video overflow-hidden rounded-md border border-black/10 bg-black dark:border-white/10">
        <iframe
          className="h-full w-full"
          src={`https://www.youtube.com/embed/${encodeURIComponent(
            videoId
          )}?rel=0&modestbranding=1`}
          title="Lecture video player"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
        />
      </div>
    </section>
  );
}
