import { indexFacultyTranscript } from "@/lib/faculty/indexing";
import { logFacultyError, logFacultyEvent } from "@/lib/faculty/logger";
import { assertFacultySession, touchFacultySession } from "@/lib/faculty/session";
import { prisma } from "@/lib/prisma";
import { isVideoProcessingError } from "@/lib/video-errors";
import { parseUploadedTranscriptFile } from "@/lib/transcript/upload-parser";
import { fetchYouTubeMetadata } from "@/lib/youtube/metadata";
import { fetchTranscriptSegments } from "@/lib/youtube/transcript";
import { parseYouTubeUrl } from "@/lib/youtube/url";

const DEFAULT_TRANSCRIPT_LANGUAGE = "en";
const FACULTY_INGEST_ARTIFACT_TYPE = "lecture_ingest";

export async function ingestFacultyLecture(input: {
  sessionId: string;
  lectureUrl: string;
}) {
  await assertFacultySession(input.sessionId);
  await touchFacultySession(input.sessionId);
  logFacultyEvent("faculty_lecture_ingest_started", {
    sessionId: input.sessionId
  });
  await setFacultyIngestStatus({
    sessionId: input.sessionId,
    status: "running"
  });

  try {
    const parsedUrl = parseYouTubeUrl(input.lectureUrl);
    await prisma.facultyWorkspace.update({
      where: { sessionId: input.sessionId },
      data: {
        lectureUrl: parsedUrl.normalizedUrl,
        status: "ingesting"
      }
    });
    await prisma.facultySession.update({
      where: { id: input.sessionId },
      data: {
        lectureUrl: parsedUrl.normalizedUrl,
        status: "ingesting"
      }
    });

    const [metadata, transcriptSegments] = await Promise.all([
      fetchYouTubeMetadata({
        videoId: parsedUrl.videoId,
        normalizedUrl: parsedUrl.normalizedUrl
      }),
      fetchTranscriptSegments({
        videoId: parsedUrl.videoId,
        preferredLanguage: DEFAULT_TRANSCRIPT_LANGUAGE
      })
    ]);
    const segments = transcriptSegments.map((segment, index) => ({
      id: `seg_${index + 1}`,
      text: segment.text,
      startSeconds: segment.startSec,
      endSeconds: segment.endSec
    }));
    const transcript = segments.map((segment) => segment.text).join("\n\n");

    await prisma.facultyWorkspace.update({
      where: { sessionId: input.sessionId },
      data: {
        title: metadata.title,
        transcriptText: transcript,
        segmentCount: segments.length,
        status: "indexing"
      }
    });
    await prisma.facultySession.update({
      where: { id: input.sessionId },
      data: {
        status: "indexing"
      }
    });

    const indexed = await indexFacultyTranscript({
      sessionId: input.sessionId,
      transcript,
      segments
    });

    await prisma.facultyWorkspace.update({
      where: { sessionId: input.sessionId },
      data: {
        indexedCount: indexed.indexedCount,
        status: "ready"
      }
    });
    await prisma.facultySession.update({
      where: { id: input.sessionId },
      data: {
        status: "ready"
      }
    });
    await setFacultyIngestStatus({
      sessionId: input.sessionId,
      status: "complete"
    });

    logFacultyEvent("faculty_lecture_ingest_complete", {
      sessionId: input.sessionId,
      segmentCount: segments.length,
      indexedCount: indexed.indexedCount,
      source: "youtube"
    });

    return {
      ok: true as const,
      segmentCount: segments.length,
      indexedCount: indexed.indexedCount
    };
  } catch (error) {
    const message = isVideoProcessingError(error)
      ? error.userMessage
      : error instanceof Error
        ? error.message
        : "Faculty lecture ingestion failed.";
    const code = isVideoProcessingError(error) ? error.type : "FACULTY_INGEST_FAILED";

    logFacultyError("faculty_error", error, {
      sessionId: input.sessionId,
      operation: "faculty_lecture_ingest"
    });
    await prisma.facultyWorkspace.updateMany({
      where: { sessionId: input.sessionId },
      data: { status: "failed" }
    });
    await prisma.facultySession.updateMany({
      where: { id: input.sessionId },
      data: { status: "failed" }
    });
    await setFacultyIngestStatus({
      sessionId: input.sessionId,
      status: "failed",
      errorCode: code,
      errorMessage: message
    });

    return {
      ok: false as const,
      error: message
    };
  }
}

export async function ingestFacultyTranscriptUpload(input: {
  sessionId: string;
  fileName?: string;
  mimeType?: string;
  content: string;
}) {
  await assertFacultySession(input.sessionId);
  await touchFacultySession(input.sessionId);

  logFacultyEvent("faculty_lecture_ingest_started", {
    sessionId: input.sessionId,
    source: "transcript_upload"
  });
  await setFacultyIngestStatus({
    sessionId: input.sessionId,
    status: "running"
  });

  try {
    const parsed = parseUploadedTranscriptFile({
      fileName: input.fileName,
      mimeType: input.mimeType,
      content: input.content
    });
    const segments = parsed.segments.map((segment, index) => ({
      id: `uploaded_seg_${index + 1}`,
      text: segment.text,
      startSeconds: segment.startSec,
      endSeconds: segment.endSec
    }));
    const transcript = segments.map((segment) => segment.text).join("\n\n");

    const workspace = await prisma.facultyWorkspace.findUnique({
      where: { sessionId: input.sessionId },
      select: { title: true }
    });
    const fallbackTitle = deriveTranscriptTitle(input.fileName);

    await prisma.facultyWorkspace.update({
      where: { sessionId: input.sessionId },
      data: {
        title: workspace?.title || fallbackTitle,
        transcriptText: transcript,
        segmentCount: segments.length,
        status: "indexing"
      }
    });
    await prisma.facultySession.update({
      where: { id: input.sessionId },
      data: { status: "indexing" }
    });

    const indexed = await indexFacultyTranscript({
      sessionId: input.sessionId,
      transcript,
      segments
    });

    await prisma.facultyWorkspace.update({
      where: { sessionId: input.sessionId },
      data: {
        indexedCount: indexed.indexedCount,
        status: "ready"
      }
    });
    await prisma.facultySession.update({
      where: { id: input.sessionId },
      data: { status: "ready" }
    });
    await setFacultyIngestStatus({
      sessionId: input.sessionId,
      status: "complete"
    });

    logFacultyEvent("faculty_lecture_ingest_complete", {
      sessionId: input.sessionId,
      source: "transcript_upload",
      segmentCount: segments.length,
      indexedCount: indexed.indexedCount
    });

    return {
      ok: true as const,
      segmentCount: segments.length,
      indexedCount: indexed.indexedCount,
      format: parsed.format
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Transcript upload failed.";

    logFacultyError("faculty_error", error, {
      sessionId: input.sessionId,
      operation: "faculty_transcript_upload_ingest"
    });
    await prisma.facultyWorkspace.updateMany({
      where: { sessionId: input.sessionId },
      data: { status: "failed" }
    });
    await prisma.facultySession.updateMany({
      where: { id: input.sessionId },
      data: { status: "failed" }
    });
    await setFacultyIngestStatus({
      sessionId: input.sessionId,
      status: "failed",
      errorCode: "TRANSCRIPT_UPLOAD_FAILED",
      errorMessage: message
    });

    return {
      ok: false as const,
      error: message
    };
  }
}

async function setFacultyIngestStatus(input: {
  sessionId: string;
  status: "running" | "complete" | "failed";
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  await prisma.facultyArtifact.upsert({
    where: {
      sessionId_type: {
        sessionId: input.sessionId,
        type: FACULTY_INGEST_ARTIFACT_TYPE
      }
    },
    create: {
      sessionId: input.sessionId,
      type: FACULTY_INGEST_ARTIFACT_TYPE,
      title: "Lecture ingest status",
      status: input.status,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null
    },
    update: {
      status: input.status,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null
    }
  });
}

function deriveTranscriptTitle(fileName?: string) {
  const base = (fileName ?? "Uploaded transcript").trim();
  const normalized = base.replace(/\.[^/.]+$/, "").replace(/[_-]+/g, " ").trim();
  return normalized || "Uploaded transcript review";
}
