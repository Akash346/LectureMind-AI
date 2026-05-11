import { indexFacultyTranscript } from "@/lib/faculty/indexing";
import { logFacultyError, logFacultyEvent } from "@/lib/faculty/logger";
import { assertFacultySession, touchFacultySession } from "@/lib/faculty/session";
import { prisma } from "@/lib/prisma";
import { isVideoProcessingError } from "@/lib/video-errors";
import { fetchYouTubeMetadata } from "@/lib/youtube/metadata";
import { fetchTranscriptSegments } from "@/lib/youtube/transcript";
import { parseYouTubeUrl } from "@/lib/youtube/url";

const DEFAULT_TRANSCRIPT_LANGUAGE = "en";

export async function ingestFacultyLecture(input: {
  sessionId: string;
  lectureUrl: string;
}) {
  await assertFacultySession(input.sessionId);
  await touchFacultySession(input.sessionId);
  logFacultyEvent("faculty_lecture_ingest_started", {
    sessionId: input.sessionId
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

    logFacultyEvent("faculty_lecture_ingest_complete", {
      sessionId: input.sessionId,
      segmentCount: segments.length,
      indexedCount: indexed.indexedCount
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

    return {
      ok: false as const,
      error: message
    };
  }
}
