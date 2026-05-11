export type ExtractedCitation = {
  raw: string;
  seconds: number;
  startIndex: number;
  endIndex: number;
};

export const TIMESTAMP_REGEX = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;

export function parseTimestamp(input: string): number {
  const clean = input.replace("[", "").replace("]", "").trim();
  const parts = clean.split(":").map((part) => Number.parseInt(part, 10));

  if (parts.some((part) => Number.isNaN(part))) {
    return 0;
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return 0;
}

export function formatTimestamp(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function extractCitations(text: string): ExtractedCitation[] {
  const matches: ExtractedCitation[] = [];
  const regex = new RegExp(TIMESTAMP_REGEX);

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      raw: match[0],
      seconds: parseTimestamp(match[0]),
      startIndex: match.index,
      endIndex: match.index + match[0].length
    });
  }

  return matches;
}
