import { z } from "zod";

import { VideoProcessingError } from "@/lib/video-errors";

const videoIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{11}$/, "Invalid YouTube video ID.");

const urlSchema = z.string().trim().url();

export type ParsedYouTubeUrl = {
  videoId: string;
  normalizedUrl: string;
  startTimeSec?: number;
};

export function parseYouTubeUrl(input: string): ParsedYouTubeUrl {
  const parsedInput = urlSchema.safeParse(input);

  if (!parsedInput.success) {
    throw new VideoProcessingError({
      type: "UNSUPPORTED_URL",
      technicalMessage: "Input was not a valid URL."
    });
  }

  let url: URL;

  try {
    url = new URL(parsedInput.data);
  } catch {
    throw new VideoProcessingError({
      type: "UNSUPPORTED_URL",
      technicalMessage: "URL constructor rejected input."
    });
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const pathParts = url.pathname.split("/").filter(Boolean);
  let candidate: string | null = null;

  if (hostname === "youtu.be") {
    candidate = pathParts[0] ?? null;
  } else if (hostname === "youtube.com" || hostname.endsWith(".youtube.com")) {
    if (url.pathname === "/watch") {
      candidate = url.searchParams.get("v");
    } else if (pathParts[0] === "shorts" || pathParts[0] === "live") {
      candidate = pathParts[1] ?? null;
    }
  }

  const videoIdResult = videoIdSchema.safeParse(candidate);

  if (!videoIdResult.success) {
    throw new VideoProcessingError({
      type: "UNSUPPORTED_URL",
      technicalMessage: `Unsupported YouTube URL shape: ${url.hostname}${url.pathname}`
    });
  }

  const startTimeSec = parseStartTime(url);

  return {
    videoId: videoIdResult.data,
    normalizedUrl: `https://www.youtube.com/watch?v=${videoIdResult.data}`,
    ...(startTimeSec === undefined ? {} : { startTimeSec })
  };
}

function parseStartTime(url: URL) {
  const raw =
    url.searchParams.get("t") ??
    url.searchParams.get("start") ??
    url.searchParams.get("time_continue");

  if (!raw) {
    return undefined;
  }

  const clean = raw.trim().toLowerCase();

  if (/^\d+$/.test(clean)) {
    return Number(clean);
  }

  const match = clean.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)?$/);

  if (!match) {
    return undefined;
  }

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  const total = hours * 3600 + minutes * 60 + seconds;

  return Number.isFinite(total) && total > 0 ? total : undefined;
}
