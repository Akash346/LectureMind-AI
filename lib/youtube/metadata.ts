import {
  VideoProcessingError,
  type VideoErrorType
} from "@/lib/video-errors";

const WATCH_BASE_URL = "https://www.youtube.com/watch";
const REQUEST_HEADERS = {
  "accept-language": "en-US,en;q=0.9",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
};

export type YouTubeMetadata = {
  videoId: string;
  title: string;
  author?: string;
  thumbnailUrl: string;
  durationSec?: number;
  isLive?: boolean;
  normalizedUrl: string;
  metadataSource?: "player" | "fallback";
  metadataErrorType?: VideoErrorType;
  requiresAgeVerification?: boolean;
};

type Thumbnail = {
  url?: string;
  width?: number;
};

type PlayerResponse = {
  playabilityStatus?: {
    status?: string;
    reason?: string;
  };
  videoDetails?: {
    videoId?: string;
    title?: string;
    author?: string;
    lengthSeconds?: string;
    isLive?: boolean;
    isLiveContent?: boolean;
    thumbnail?: {
      thumbnails?: Thumbnail[];
    };
  };
  microformat?: {
    playerMicroformatRenderer?: {
      title?: {
        simpleText?: string;
      };
      ownerChannelName?: string;
      lengthSeconds?: string;
      liveBroadcastDetails?: {
        isLiveNow?: boolean;
      };
      thumbnail?: {
        thumbnails?: Thumbnail[];
      };
    };
  };
  captions?: unknown;
};

export type YouTubePlayerResponse = PlayerResponse;

export async function fetchYouTubeMetadata({
  videoId,
  normalizedUrl
}: {
  videoId: string;
  normalizedUrl: string;
}): Promise<YouTubeMetadata> {
  try {
    const playerResponse = await fetchYouTubePlayerResponse(videoId);
    assertPlayable(playerResponse);

    const details = playerResponse.videoDetails;
    const microformat = playerResponse.microformat?.playerMicroformatRenderer;
    const durationSec = parseDuration(
      details?.lengthSeconds ?? microformat?.lengthSeconds
    );
    const thumbnailUrl =
      pickLargestThumbnail(
        details?.thumbnail?.thumbnails ?? microformat?.thumbnail?.thumbnails
      ) ?? getFallbackThumbnailUrl(videoId);
    const isLive =
      details?.isLive === true ||
      microformat?.liveBroadcastDetails?.isLiveNow === true;

    return {
      videoId,
      title:
        details?.title ??
        microformat?.title?.simpleText ??
        "YouTube lecture",
      author: details?.author ?? microformat?.ownerChannelName,
      thumbnailUrl,
      ...(durationSec === undefined ? {} : { durationSec }),
      isLive,
      normalizedUrl,
      metadataSource: "player"
    };
  } catch (error) {
    if (error instanceof VideoProcessingError) {
      if (!shouldUseFallbackMetadata(error.type)) {
        throw error;
      }

      return createFallbackMetadata({
        videoId,
        normalizedUrl,
        errorType: error.type
      });
    }

    console.warn("[youtube:metadata] Falling back to basic metadata", {
      videoId,
      error: error instanceof Error ? error.message : String(error)
    });

    return createFallbackMetadata({
      videoId,
      normalizedUrl,
      errorType: "NETWORK_ERROR"
    });
  }
}

export async function fetchYouTubePlayerResponse(videoId: string) {
  const url = new URL(WATCH_BASE_URL);
  url.searchParams.set("v", videoId);
  url.searchParams.set("bpctr", "9999999999");
  url.searchParams.set("has_verified", "1");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      headers: REQUEST_HEADERS,
      signal: controller.signal
    });

    if (response.status === 429) {
      throw new VideoProcessingError({
        type: "RATE_LIMITED",
        technicalMessage: "YouTube watch page returned HTTP 429."
      });
    }

    if (!response.ok) {
      throw new VideoProcessingError({
        type: "NETWORK_ERROR",
        technicalMessage: `YouTube watch page returned HTTP ${response.status}.`
      });
    }

    const html = await response.text();
    const json = extractJsonObject(html, "ytInitialPlayerResponse");

    if (!json) {
      throw new Error("ytInitialPlayerResponse was not found.");
    }

    return JSON.parse(json) as PlayerResponse;
  } catch (error) {
    if (error instanceof VideoProcessingError) {
      throw error;
    }

    throw new VideoProcessingError({
      type: "NETWORK_ERROR",
      technicalMessage: error instanceof Error ? error.message : String(error)
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function assertPlayable(playerResponse: PlayerResponse) {
  const status = playerResponse.playabilityStatus?.status ?? "";
  const reason = playerResponse.playabilityStatus?.reason ?? "";
  const normalizedReason = reason.toLowerCase();

  if (status === "OK" || !status) {
    return;
  }

  if (normalizedReason.includes("private")) {
    throw new VideoProcessingError({
      type: "PRIVATE_VIDEO",
      technicalMessage: `Playability ${status}: ${reason}`
    });
  }

  if (
    normalizedReason.includes("members-only") ||
    normalizedReason.includes("members only") ||
    normalizedReason.includes("join this channel")
  ) {
    throw new VideoProcessingError({
      type: "MEMBERS_ONLY",
      technicalMessage: `Playability ${status}: ${reason}`
    });
  }

  if (isExplicitAgeVerification(status, normalizedReason)) {
    throw new VideoProcessingError({
      type: "AGE_RESTRICTED",
      technicalMessage: `Playability ${status}: ${reason}`
    });
  }

  if (
    normalizedReason.includes("video unavailable") ||
    normalizedReason.includes("unavailable") ||
    normalizedReason.includes("removed") ||
    normalizedReason.includes("deleted") ||
    normalizedReason.includes("does not exist") ||
    normalizedReason.includes("doesn't exist")
  ) {
    throw new VideoProcessingError({
      type: "VIDEO_UNAVAILABLE",
      technicalMessage: `Playability ${status}: ${reason}`
    });
  }

  if (isGenericYouTubeInterruption(normalizedReason)) {
    throw new VideoProcessingError({
      type: "NETWORK_ERROR",
      technicalMessage: `Playability ${status}: ${reason}`
    });
  }

  if (status === "LOGIN_REQUIRED" || normalizedReason.includes("sign in")) {
    throw new VideoProcessingError({
      type: "LOGIN_REQUIRED",
      technicalMessage: `Playability ${status}: ${reason}`
    });
  }

  if (
    normalizedReason.includes("country") ||
    normalizedReason.includes("region") ||
    normalizedReason.includes("not available in your")
  ) {
    throw new VideoProcessingError({
      type: "REGION_BLOCKED",
      technicalMessage: `Playability ${status}: ${reason}`
    });
  }

  if (
    normalizedReason.includes("live") ||
    normalizedReason.includes("stream")
  ) {
    throw new VideoProcessingError({
      type: "LIVE_STREAM_ACTIVE",
      technicalMessage: `Playability ${status}: ${reason}`
    });
  }

  throw new VideoProcessingError({
    type: "UNKNOWN",
    technicalMessage: `Playability ${status}: ${reason || "No reason"}`
  });
}

export function getFallbackThumbnailUrl(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function createFallbackMetadata({
  videoId,
  normalizedUrl,
  errorType,
  requiresAgeVerification = false
}: {
  videoId: string;
  normalizedUrl: string;
  errorType?: VideoErrorType;
  requiresAgeVerification?: boolean;
}): YouTubeMetadata {
  return {
    videoId,
    title: "YouTube lecture",
    thumbnailUrl: getFallbackThumbnailUrl(videoId),
    normalizedUrl,
    metadataSource: "fallback",
    ...(errorType ? { metadataErrorType: errorType } : {}),
    ...(requiresAgeVerification ? { requiresAgeVerification } : {})
  };
}

function shouldUseFallbackMetadata(type: VideoErrorType) {
  return type === "NETWORK_ERROR" || type === "RATE_LIMITED";
}

function isExplicitAgeVerification(status: string, normalizedReason: string) {
  return (
    normalizedReason.includes("confirm your age") ||
    normalizedReason.includes("age verification") ||
    normalizedReason.includes("age-restricted") ||
    normalizedReason.includes("age restricted") ||
    normalizedReason.includes("may be inappropriate for some users") ||
    (status === "AGE_CHECK_REQUIRED" && normalizedReason.includes("age"))
  );
}

function isGenericYouTubeInterruption(normalizedReason: string) {
  return (
    normalizedReason.includes("not a bot") ||
    normalizedReason.includes("confirm you") ||
    normalizedReason.includes("consent")
  );
}

function parseDuration(value?: string) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}

function pickLargestThumbnail(thumbnails?: Thumbnail[]) {
  return thumbnails
    ?.filter((thumbnail) => thumbnail.url)
    .sort((left, right) => (right.width ?? 0) - (left.width ?? 0))[0]?.url;
}

function extractJsonObject(html: string, marker: string) {
  const markerIndex = html.indexOf(marker);

  if (markerIndex < 0) {
    return null;
  }

  const objectStart = html.indexOf("{", markerIndex);

  if (objectStart < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = objectStart; index < html.length; index += 1) {
    const char = html[index];

    if (escaping) {
      escaping = false;
      continue;
    }

    if (char === "\\") {
      escaping = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === "{") {
      depth += 1;
    }

    if (char === "}") {
      depth -= 1;
    }

    if (depth === 0) {
      return html.slice(objectStart, index + 1);
    }
  }

  return null;
}
