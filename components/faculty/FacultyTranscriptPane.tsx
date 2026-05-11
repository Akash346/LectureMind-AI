"use client";

export function FacultyTranscriptPane({
  transcriptText
}: {
  transcriptText?: string | null;
}) {
  const chunks = (transcriptText ?? "")
    .split(/\n{2,}/)
    .map((text) => text.trim())
    .filter(Boolean);

  return (
    <section className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-space-grotesk text-lg font-semibold">Transcript</h2>
        <span className="text-xs text-black/50 dark:text-white/50">
          {chunks.length} segments
        </span>
      </div>
      {chunks.length === 0 ? (
        <div className="space-y-3">
          <div className="h-4 w-2/3 animate-pulse rounded bg-black/10 dark:bg-white/10" />
          <div className="h-4 w-full animate-pulse rounded bg-black/10 dark:bg-white/10" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-black/10 dark:bg-white/10" />
        </div>
      ) : (
        <div className="space-y-4 text-sm leading-7 text-black/72 dark:text-white/72">
          {chunks.map((chunk, index) => (
            <p
              id={`C${index + 1}`}
              key={`${chunk.slice(0, 20)}-${index}`}
              className="rounded-md p-2 transition"
            >
              <span className="mr-2 font-semibold text-lm-indigo dark:text-lm-amber">
                C{index + 1}
              </span>
              {chunk}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
