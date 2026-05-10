import type { ArtifactType, LanguageCode } from "@/lib/ai/schemas";
import { prisma } from "@/lib/prisma";

const SHORT_EVIDENCE_TOKEN_LIMIT = 18000;
const MAX_MODEL_EVIDENCE_TOKENS = 56000;
const WINDOW_SECONDS = 180;

export type CompiledEvidenceSegment = {
  id: string;
  citationId: string;
  startSec: number;
  endSec: number;
  label: string;
  text: string;
};

export type EvidenceWindow = {
  windowId: string;
  startSec: number;
  endSec: number;
  segmentIds: string[];
  text: string;
};

export type EvidencePacket = {
  notebook: {
    id: string;
    title: string;
    videoId: string | null;
    videoTitle: string | null;
    durationSec: number | null;
    sourceUrl: string;
    evidenceSourceType: string | null;
  };
  evidenceSegments: CompiledEvidenceSegment[];
  evidenceWindows: EvidenceWindow[];
  transcriptStats: {
    segmentCount: number;
    totalCharacters: number;
    estimatedTokens: number;
    durationSec: number | null;
    mode: "segments" | "windows";
  };
  preferredLanguage: LanguageCode;
  artifactType: ArtifactType;
  maxEvidenceTokensEstimate: number;
};

export async function compileEvidenceForArtifact(
  notebookId: string,
  artifactType: ArtifactType,
  preferredLanguage: LanguageCode
): Promise<EvidencePacket> {
  const notebook = await prisma.notebook.findUnique({
    where: { id: notebookId },
    select: {
      id: true,
      title: true,
      videoId: true,
      videoTitle: true,
      durationSec: true,
      sourceUrl: true,
      evidenceSegments: {
        orderBy: { startSec: "asc" },
        select: {
          id: true,
          startSec: true,
          endSec: true,
          text: true,
          sourceType: true
        }
      }
    }
  });

  const evidenceSegments =
    notebook?.evidenceSegments.map((segment, index) => ({
      id: segment.id,
      citationId: `C${index + 1}`,
      startSec: segment.startSec,
      endSec: segment.endSec,
      label: formatTimestamp(segment.startSec),
      text: segment.text
    })) ?? [];

  const totalCharacters = evidenceSegments.reduce(
    (total, segment) => total + segment.text.length,
    0
  );
  const estimatedTokens = estimateTokens(
    evidenceSegments.map((segment) => segment.text).join(" ")
  );
  const mode = estimatedTokens <= SHORT_EVIDENCE_TOKEN_LIMIT
    ? "segments"
    : "windows";

  return {
    notebook: {
      id: notebook?.id ?? notebookId,
      title: notebook?.title ?? "Untitled lecture",
      videoId: notebook?.videoId ?? null,
      videoTitle: notebook?.videoTitle ?? null,
      durationSec: notebook?.durationSec ?? null,
      sourceUrl: notebook?.sourceUrl ?? "",
      evidenceSourceType: notebook?.evidenceSegments[0]?.sourceType ?? null
    },
    evidenceSegments,
    evidenceWindows:
      mode === "segments" ? [] : createEvidenceWindows(evidenceSegments),
    transcriptStats: {
      segmentCount: evidenceSegments.length,
      totalCharacters,
      estimatedTokens,
      durationSec: notebook?.durationSec ?? null,
      mode
    },
    preferredLanguage,
    artifactType,
    maxEvidenceTokensEstimate: MAX_MODEL_EVIDENCE_TOKENS
  };
}

export function formatEvidencePacketForPrompt(packet: EvidencePacket) {
  const evidence = packet.evidenceSegments
    .map(formatSegmentForPrompt)
    .join("\n");

  return [
    `Notebook: ${packet.notebook.title}`,
    `Video title: ${packet.notebook.videoTitle ?? packet.notebook.title}`,
    `Video duration seconds: ${packet.notebook.durationSec ?? "unknown"}`,
    `Evidence mode: ${packet.transcriptStats.mode}`,
    "Evidence format: JSON Lines. Each line is one allowed citation handle.",
    `Evidence segment count: ${packet.transcriptStats.segmentCount}`,
    `Estimated evidence tokens: ${packet.transcriptStats.estimatedTokens}`,
    "",
    "Citation handles:",
    "- Cite only citationId values from the evidence lines below.",
    "- Do not output evidenceSegmentId, startSec, endSec, or invented timestamps.",
    "",
    "Evidence:",
    evidence
  ].join("\n");
}

export function formatEvidenceIndexForPrompt(packet: EvidencePacket) {
  return packet.evidenceSegments
    .map(
      (segment) =>
        `${segment.citationId} | ${segment.id} | ${formatTimestamp(segment.startSec)}-${formatTimestamp(
          segment.endSec
        )} | ${truncate(segment.text, 240)}`
    )
    .join("\n");
}

export function getEvidenceByCitationId(packet: EvidencePacket) {
  return new Map(
    packet.evidenceSegments.map((segment) => [segment.citationId, segment])
  );
}

export function getCitationIdByEvidenceSegmentId(packet: EvidencePacket) {
  return new Map(
    packet.evidenceSegments.map((segment) => [segment.id, segment.citationId])
  );
}

export function formatTimestamp(seconds: number) {
  const rounded = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const remainingSeconds = rounded % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function createEvidenceWindows(segments: CompiledEvidenceSegment[]) {
  const windows: EvidenceWindow[] = [];

  for (const segment of segments) {
    const current = windows[windows.length - 1];
    const shouldStartWindow =
      !current ||
      segment.startSec - current.startSec >= WINDOW_SECONDS ||
      current.text.length + segment.text.length > 5000;

    if (shouldStartWindow) {
      windows.push({
        windowId: `window-${windows.length + 1}`,
        startSec: segment.startSec,
        endSec: segment.endSec,
        segmentIds: [segment.id],
        text: `[${segment.citationId} ${formatTimestamp(segment.startSec)}] ${
          segment.text
        }`
      });
      continue;
    }

    current.endSec = Math.max(current.endSec, segment.endSec);
    current.segmentIds.push(segment.id);
    current.text = `${current.text}\n[${segment.citationId} ${formatTimestamp(
      segment.startSec
    )}] ${segment.text}`;
  }

  return windows;
}

function formatSegmentForPrompt(segment: CompiledEvidenceSegment) {
  return JSON.stringify({
    citationId: segment.citationId,
    evidenceSegmentId: segment.id,
    startSec: segment.startSec,
    endSec: segment.endSec,
    label: segment.label,
    text: segment.text
  });
}

function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

function truncate(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}...`;
}
