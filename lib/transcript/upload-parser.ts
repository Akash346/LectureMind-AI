const MAX_SEGMENT_TEXT_LENGTH = 2_000;
const MIN_SEGMENT_SECONDS = 1;

export type ParsedTranscriptSegment = {
  startSec: number;
  endSec: number;
  text: string;
};

export type ParsedTranscriptFile = {
  segments: ParsedTranscriptSegment[];
  format: "vtt" | "srt" | "json" | "text";
};

export function parseUploadedTranscriptFile(input: {
  fileName?: string;
  mimeType?: string;
  content: string;
}) {
  const format = detectTranscriptFormat(input.fileName, input.mimeType, input.content);
  const normalizedContent = input.content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  let segments: ParsedTranscriptSegment[];
  switch (format) {
    case "vtt":
      segments = parseVtt(normalizedContent);
      break;
    case "srt":
      segments = parseSrt(normalizedContent);
      break;
    case "json":
      segments = parseJsonTranscript(normalizedContent);
      break;
    default:
      segments = parsePlainText(normalizedContent);
      break;
  }

  const cleaned = normalizeTranscriptSegments(segments);

  if (cleaned.length === 0) {
    throw new Error("The uploaded transcript file did not contain usable text.");
  }

  return {
    segments: cleaned,
    format
  } satisfies ParsedTranscriptFile;
}

function detectTranscriptFormat(
  fileName?: string,
  mimeType?: string,
  content?: string
): ParsedTranscriptFile["format"] {
  const lowerName = fileName?.toLowerCase() ?? "";
  const lowerMime = mimeType?.toLowerCase() ?? "";
  const preview = (content ?? "").slice(0, 300).trim().toLowerCase();

  if (lowerName.endsWith(".vtt") || lowerMime.includes("vtt") || preview.startsWith("webvtt")) {
    return "vtt";
  }

  if (lowerName.endsWith(".srt")) {
    return "srt";
  }

  if (lowerName.endsWith(".json") || lowerMime.includes("json")) {
    return "json";
  }

  return "text";
}

function parseVtt(content: string) {
  const rows = content.split("\n");
  const segments: ParsedTranscriptSegment[] = [];
  let index = 0;

  while (index < rows.length) {
    const line = rows[index].trim();
    const next = rows[index + 1]?.trim() ?? "";
    const timestampLine = line.includes("-->") ? line : next.includes("-->") ? next : "";

    if (!timestampLine) {
      index += 1;
      continue;
    }

    const timing = parseTimingLine(timestampLine);
    index += line.includes("-->") ? 1 : 2;

    const cueLines: string[] = [];
    while (index < rows.length && rows[index].trim() !== "") {
      cueLines.push(rows[index]);
      index += 1;
    }

    if (timing) {
      segments.push({
        startSec: timing.startSec,
        endSec: timing.endSec,
        text: cueLines.join(" ")
      });
    }

    index += 1;
  }

  return segments;
}

function parseSrt(content: string) {
  const blocks = content.split(/\n{2,}/g);
  const segments: ParsedTranscriptSegment[] = [];

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length < 2) {
      continue;
    }

    const timingLine = lines.find((line) => line.includes("-->"));
    if (!timingLine) {
      continue;
    }

    const timing = parseTimingLine(timingLine);
    if (!timing) {
      continue;
    }

    const firstTextLine = lines.indexOf(timingLine) + 1;
    const text = lines.slice(firstTextLine).join(" ");
    segments.push({
      startSec: timing.startSec,
      endSec: timing.endSec,
      text
    });
  }

  return segments;
}

function parseJsonTranscript(content: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Could not parse JSON transcript. Upload valid JSON or a text subtitle file.");
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === "object" && Array.isArray((parsed as { segments?: unknown }).segments)
      ? (parsed as { segments: unknown[] }).segments
      : null;

  if (!rows) {
    throw new Error("JSON transcript must be an array of segments or an object with a segments array.");
  }

  return rows
    .map((row, index) => normalizeJsonSegment(row, index))
    .filter((row): row is ParsedTranscriptSegment => Boolean(row));
}

function normalizeJsonSegment(row: unknown, index: number) {
  if (!row || typeof row !== "object") {
    return null;
  }

  const item = row as Record<string, unknown>;
  const text = typeof item.text === "string" ? item.text : "";
  const start =
    toSeconds(item.startSec) ??
    toSeconds(item.start) ??
    toSeconds(item.startSeconds) ??
    index * 12;
  const end =
    toSeconds(item.endSec) ??
    toSeconds(item.end) ??
    toSeconds(item.endSeconds) ??
    start + 12;

  return {
    startSec: start,
    endSec: end > start ? end : start + 12,
    text
  };
}

function parsePlainText(content: string) {
  const paragraphs = content
    .split(/\n{2,}/g)
    .map((chunk) => sanitizeText(chunk))
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return [];
  }

  let cursor = 0;
  return paragraphs.map((paragraph) => {
    const duration = estimateDurationSeconds(paragraph);
    const segment = {
      startSec: cursor,
      endSec: cursor + duration,
      text: paragraph
    };
    cursor += duration;
    return segment;
  });
}

function parseTimingLine(line: string) {
  const [rawStart, rawEnd] = line.split("-->").map((part) => part.trim());
  if (!rawStart || !rawEnd) {
    return null;
  }

  const startSec = toSeconds(rawStart);
  const endSec = toSeconds(rawEnd.split(/\s+/g)[0]);
  if (startSec === null || endSec === null) {
    return null;
  }

  return {
    startSec,
    endSec: endSec > startSec ? endSec : startSec + MIN_SEGMENT_SECONDS
  };
}

function toSeconds(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim().replace(",", ".");
  if (!cleaned) {
    return null;
  }

  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    return Number(cleaned);
  }

  const parts = cleaned.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) {
    return null;
  }

  if (parts.length === 3) {
    return Math.max(0, parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }

  if (parts.length === 2) {
    return Math.max(0, parts[0] * 60 + parts[1]);
  }

  return null;
}

function normalizeTranscriptSegments(segments: ParsedTranscriptSegment[]) {
  const cleaned = segments
    .map((segment, index, list) => {
      const startSec = clampSeconds(segment.startSec);
      const endSec = clampSeconds(segment.endSec);
      const normalizedText = sanitizeText(segment.text).slice(0, MAX_SEGMENT_TEXT_LENGTH);
      const fallbackEnd =
        index < list.length - 1
          ? clampSeconds(list[index + 1]?.startSec ?? startSec + 12)
          : startSec + 12;
      const safeEnd =
        endSec > startSec
          ? endSec
          : fallbackEnd > startSec
            ? fallbackEnd
            : startSec + MIN_SEGMENT_SECONDS;

      return {
        startSec,
        endSec: safeEnd,
        text: normalizedText
      };
    })
    .filter((segment) => segment.text.length > 0);

  const merged: ParsedTranscriptSegment[] = [];

  for (const segment of cleaned) {
    const previous = merged[merged.length - 1];
    const canMerge =
      previous &&
      previous.text.length < 70 &&
      segment.text.length < 140 &&
      segment.startSec - previous.endSec <= 1;

    if (canMerge) {
      previous.endSec = Math.max(previous.endSec, segment.endSec);
      previous.text = sanitizeText(`${previous.text} ${segment.text}`);
      continue;
    }

    merged.push({ ...segment });
  }

  return merged;
}

function clampSeconds(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return value;
}

function sanitizeText(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function estimateDurationSeconds(text: string) {
  const words = text.split(/\s+/g).filter(Boolean).length;
  const estimated = Math.ceil((words / 140) * 60);
  return Math.max(8, Math.min(40, estimated));
}
