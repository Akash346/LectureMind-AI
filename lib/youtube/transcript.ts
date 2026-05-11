import { XMLParser } from "fast-xml-parser";
import {
  fetchTranscript,
  YoutubeTranscriptDisabledError,
  YoutubeTranscriptNotAvailableError,
  YoutubeTranscriptTooManyRequestError,
  YoutubeTranscriptVideoUnavailableError
} from "youtube-transcript";

import { VideoProcessingError } from "@/lib/video-errors";
import {
  assertPlayable,
  fetchYouTubePlayerResponse,
  type YouTubePlayerResponse
} from "@/lib/youtube/metadata";

export type TranscriptSegment = {
  startSec: number;
  endSec: number;
  text: string;
  sourceType: "CAPTION" | "AUTO_CAPTION";
  confidence: number;
  language?: string | null;
};

type CaptionTrack = {
  baseUrl?: string;
  languageCode?: string;
  name?: {
    simpleText?: string;
    runs?: Array<{ text?: string }>;
  };
  kind?: string;
};

type Json3Caption = {
  events?: Array<{
    tStartMs?: number;
    dDurationMs?: number;
    segs?: Array<{ utf8?: string }>;
  }>;
};

type XmlCaptionText = {
  start?: string;
  dur?: string;
  "#text"?: string;
};

export async function fetchTranscriptSegments({
  videoId,
  preferredLanguage = "en"
}: {
  videoId: string;
  preferredLanguage?: string;
}): Promise<TranscriptSegment[]> {
  try {
    return await fetchDirectYouTubeTranscript(videoId, preferredLanguage);
  } catch (error) {
    if (error instanceof VideoProcessingError && !canTryTranscriptFallback(error)) {
      throw error;
    }

    console.info("[youtube:transcript] Trying transcript library fallback", {
      videoId,
      reason: error instanceof Error ? error.message : String(error)
    });

    return fetchYoutubeTranscriptFallback(videoId, preferredLanguage, error);
  }
}

async function fetchDirectYouTubeTranscript(
  videoId: string,
  preferredLanguage: string
) {
  const playerResponse = await fetchYouTubePlayerResponse(videoId);
  assertPlayable(playerResponse);

  const tracks = getCaptionTracks(playerResponse);

  if (tracks.length === 0) {
    throw new VideoProcessingError({
      type: "NO_CAPTIONS",
      technicalMessage: "Player response did not include caption tracks."
    });
  }

  const track = chooseCaptionTrack(tracks, preferredLanguage);

  if (!track.baseUrl) {
    throw new VideoProcessingError({
      type: "TRANSCRIPT_UNAVAILABLE",
      technicalMessage: "Chosen caption track did not include a baseUrl."
    });
  }

  const sourceType = track.kind === "asr" ? "AUTO_CAPTION" : "CAPTION";
  const rawSegments = await fetchCaptionTrack(track.baseUrl);
  const normalized = normalizeSegments(rawSegments, sourceType);

  if (normalized.length === 0) {
    throw new VideoProcessingError({
      type: "TRANSCRIPT_UNAVAILABLE",
      technicalMessage: "Caption track was empty after normalization."
    });
  }

  return normalized.map((segment) => ({
    ...segment,
    language: track.languageCode ?? preferredLanguage
  }));
}

async function fetchYoutubeTranscriptFallback(
  videoId: string,
  preferredLanguage: string,
  originalError: unknown
) {
  try {
    const result = await fetchTranscript(videoId, {
      lang: preferredLanguage
    });
    const normalized = normalizeSegments(
      result.map((segment) => ({
        startSec: segment.offset / 1000,
        endSec: (segment.offset + Math.max(segment.duration, 100)) / 1000,
        text: segment.text
      })),
      "CAPTION"
    );

    if (normalized.length === 0) {
      throw new VideoProcessingError({
        type: "TRANSCRIPT_UNAVAILABLE",
        technicalMessage: "youtube-transcript returned no usable rows."
      });
    }

    return normalized.map((segment) => ({
      ...segment,
      language: preferredLanguage
    }));
  } catch (error) {
    if (
      originalError instanceof VideoProcessingError &&
      originalError.type === "AGE_RESTRICTED"
    ) {
      throw originalError;
    }

    if (error instanceof YoutubeTranscriptTooManyRequestError) {
      throw new VideoProcessingError({
        type: "RATE_LIMITED",
        technicalMessage: error.message
      });
    }

    if (error instanceof YoutubeTranscriptDisabledError) {
      throw new VideoProcessingError({
        type: "NO_CAPTIONS",
        technicalMessage: error.message
      });
    }

    if (error instanceof YoutubeTranscriptNotAvailableError) {
      throw new VideoProcessingError({
        type: "TRANSCRIPT_UNAVAILABLE",
        technicalMessage: error.message
      });
    }

    if (error instanceof YoutubeTranscriptVideoUnavailableError) {
      throw new VideoProcessingError({
        type: "TRANSCRIPT_UNAVAILABLE",
        technicalMessage: error.message
      });
    }

    throw new VideoProcessingError({
      type: "TRANSCRIPT_UNAVAILABLE",
      technicalMessage: `Direct transcript failed with ${
        originalError instanceof Error ? originalError.message : String(originalError)
      }; youtube-transcript failed with ${
        error instanceof Error ? error.message : String(error)
      }`
    });
  }
}

function canTryTranscriptFallback(error: VideoProcessingError) {
  return (
    error.type === "NO_CAPTIONS" ||
    error.type === "TRANSCRIPT_UNAVAILABLE" ||
    error.type === "NETWORK_ERROR" ||
    error.type === "RATE_LIMITED" ||
    error.type === "AGE_RESTRICTED"
  );
}

function getCaptionTracks(playerResponse: YouTubePlayerResponse) {
  const captions = playerResponse.captions as
    | {
        playerCaptionsTracklistRenderer?: {
          captionTracks?: CaptionTrack[];
        };
      }
    | undefined;

  return (
    captions?.playerCaptionsTracklistRenderer?.captionTracks?.filter(
      (track) => track.baseUrl
    ) ?? []
  );
}

function chooseCaptionTrack(
  tracks: CaptionTrack[],
  preferredLanguage: string
) {
  const normalizedLanguage = preferredLanguage.toLowerCase();
  const preferredManual = tracks.find(
    (track) =>
      track.kind !== "asr" &&
      track.languageCode?.toLowerCase().startsWith(normalizedLanguage)
  );

  if (preferredManual) {
    return preferredManual;
  }

  const manual = tracks.find((track) => track.kind !== "asr");

  if (manual) {
    return manual;
  }

  const preferredAuto = tracks.find((track) =>
    track.languageCode?.toLowerCase().startsWith(normalizedLanguage)
  );

  return preferredAuto ?? tracks[0];
}

async function fetchCaptionTrack(baseUrl: string) {
  const jsonUrl = new URL(baseUrl);
  jsonUrl.searchParams.set("fmt", "json3");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(jsonUrl, { signal: controller.signal });

    if (response.status === 429) {
      throw new VideoProcessingError({
        type: "RATE_LIMITED",
        technicalMessage: "Caption track returned HTTP 429."
      });
    }

    if (!response.ok) {
      throw new VideoProcessingError({
        type: "TRANSCRIPT_UNAVAILABLE",
        technicalMessage: `Caption track returned HTTP ${response.status}.`
      });
    }

    const body = await response.text();

    if (body.trim().startsWith("{")) {
      return parseJson3Captions(JSON.parse(body) as Json3Caption);
    }

    return parseXmlCaptions(body);
  } catch (error) {
    if (error instanceof VideoProcessingError) {
      throw error;
    }

    throw new VideoProcessingError({
      type: "TRANSCRIPT_UNAVAILABLE",
      technicalMessage: error instanceof Error ? error.message : String(error)
    });
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson3Captions(data: Json3Caption) {
  return (
    data.events
      ?.map((event) => {
        const text =
          event.segs
            ?.map((segment) => segment.utf8 ?? "")
            .join("")
            .trim() ?? "";
        const startSec = (event.tStartMs ?? 0) / 1000;
        const durationSec = Math.max((event.dDurationMs ?? 0) / 1000, 0.1);

        return {
          startSec,
          endSec: startSec + durationSec,
          text
        };
      })
      .filter((segment) => segment.text) ?? []
  );
}

function parseXmlCaptions(xml: string) {
  const parser = new XMLParser({
    attributeNamePrefix: "",
    ignoreAttributes: false,
    textNodeName: "#text"
  });
  const parsed = parser.parse(xml) as {
    transcript?: {
      text?: XmlCaptionText | XmlCaptionText[];
    };
  };
  const items = parsed.transcript?.text;
  const rows = Array.isArray(items) ? items : items ? [items] : [];

  return rows.map((row) => {
    const startSec = parseNumberish(row.start);
    const durationSec = Math.max(parseNumberish(row.dur), 0.1);

    return {
      startSec,
      endSec: startSec + durationSec,
      text: row["#text"] ?? ""
    };
  });
}

function normalizeSegments(
  segments: Array<{ startSec: number; endSec: number; text: string }>,
  sourceType: "CAPTION" | "AUTO_CAPTION"
): TranscriptSegment[] {
  const cleaned = segments
    .map((segment, index, allSegments) => {
      const startSec = sanitizeTimestamp(segment.startSec);
      const nextStartSec = sanitizeTimestamp(allSegments[index + 1]?.startSec);
      const providedEndSec = sanitizeTimestamp(segment.endSec);
      const endSec =
        providedEndSec > startSec
          ? providedEndSec
          : nextStartSec > startSec
            ? nextStartSec
            : startSec + 2.5;
      const text = cleanTranscriptText(segment.text);

      return {
        startSec,
        endSec,
        text,
        sourceType,
        confidence: sourceType === "CAPTION" ? 1 : 0.82
      };
    })
    .filter((segment) => segment.text);

  return mergeTinySegments(cleaned);
}

function mergeTinySegments(segments: TranscriptSegment[]) {
  const merged: TranscriptSegment[] = [];

  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    const gap = previous ? segment.startSec - previous.endSec : Infinity;
    const shouldMerge =
      previous &&
      previous.sourceType === segment.sourceType &&
      previous.text.length < 48 &&
      segment.text.length < 72 &&
      gap >= 0 &&
      gap <= 1.25;

    if (shouldMerge) {
      previous.endSec = Math.max(previous.endSec, segment.endSec);
      previous.text = cleanTranscriptText(`${previous.text} ${segment.text}`);
      previous.confidence = Math.min(previous.confidence, segment.confidence);
    } else {
      merged.push({ ...segment });
    }
  }

  return merged;
}

function cleanTranscriptText(text: string) {
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeTimestamp(value?: number) {
  return Number.isFinite(value) && value !== undefined && value >= 0 ? value : 0;
}

function parseNumberish(value?: string) {
  if (!value) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
