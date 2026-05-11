import type { ArtifactType, PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";

import {
  DEMO_NOTEBOOK_ID,
  DEMO_NOTEBOOK_TITLE,
  DEMO_SOURCE_URL,
  DEMO_USER_EMAIL,
  DEMO_VIDEO_ID,
  demoArtifactJsonByType,
  demoTranscriptSegments
} from "@/lib/demo-notebook-content";
import { prisma as defaultPrisma } from "@/lib/prisma";
import { getSearchIndexName } from "@/lib/search/search-client";

type DemoNotebookPrisma = PrismaClient | typeof defaultPrisma;

export type EnsureDemoNotebookResult = {
  notebookId: string;
  userId: string;
  created: boolean;
  segmentCount: number;
  artifactCount: number;
};

export async function ensureDemoNotebook({
  userId,
  prisma = defaultPrisma
}: {
  userId: string;
  prisma?: DemoNotebookPrisma;
}): Promise<EnsureDemoNotebookResult> {
  const existing = await prisma.notebook.findUnique({
    where: { id: DEMO_NOTEBOOK_ID },
    select: {
      id: true,
      userId: true
    }
  });
  const created = !existing;

  if (existing && existing.userId !== userId) {
    console.warn(
      "[demo:seed]",
      JSON.stringify({
        event: "demo_notebook_reassigned",
        notebookId: DEMO_NOTEBOOK_ID,
        previousUserId: existing.userId,
        nextUserId: userId
      })
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.notebook.upsert({
      where: { id: DEMO_NOTEBOOK_ID },
      update: {
        userId,
        title: DEMO_NOTEBOOK_TITLE,
        sourceUrl: DEMO_SOURCE_URL,
        videoId: null,
        videoTitle: DEMO_NOTEBOOK_TITLE,
        thumbnailUrl: null,
        durationSec: 310,
        language: "en",
        status: "READY",
        errorType: null,
        errorMessage: null
      },
      create: {
        id: DEMO_NOTEBOOK_ID,
        userId,
        title: DEMO_NOTEBOOK_TITLE,
        sourceUrl: DEMO_SOURCE_URL,
        videoId: null,
        videoTitle: DEMO_NOTEBOOK_TITLE,
        thumbnailUrl: null,
        durationSec: 310,
        language: "en",
        status: "READY",
        errorType: null,
        errorMessage: null
      }
    });

    await tx.evidenceSegment.deleteMany({
      where: { notebookId: DEMO_NOTEBOOK_ID }
    });
    await tx.evidenceSegment.createMany({
      data: demoTranscriptSegments.map((segment) => ({
        id: segment.id,
        notebookId: DEMO_NOTEBOOK_ID,
        videoId: DEMO_VIDEO_ID,
        startSec: segment.startSec,
        endSec: segment.endSec,
        text: segment.text,
        sourceType: "CAPTION",
        confidence: 1,
        language: "en",
        extractionEngine: "static-demo-seed",
        rawSource: "repo-static-transcript",
        embeddingStatus: "SUCCEEDED",
        embeddingModel: "static-demo",
        indexedAt: new Date(0),
        searchDocumentId: `demo-${segment.id}`
      }))
    });

    await Promise.all(
      Object.entries(demoArtifactJsonByType).map(([type, json]) =>
        tx.artifact.upsert({
          where: {
            notebookId_type_language: {
              notebookId: DEMO_NOTEBOOK_ID,
              type: type as ArtifactType,
              language: "en"
            }
          },
          update: {
            json,
            status: "READY",
            errorType: null,
            errorMessage: null,
            generatedBy: "static-demo-seed",
            verifiedAt: new Date(0),
            sourceSegmentCount: demoTranscriptSegments.length,
            metadata: buildDemoArtifactMetadata()
          },
          create: {
            notebookId: DEMO_NOTEBOOK_ID,
            type: type as ArtifactType,
            language: "en",
            json,
            status: "READY",
            errorType: null,
            errorMessage: null,
            generatedBy: "static-demo-seed",
            verifiedAt: new Date(0),
            sourceSegmentCount: demoTranscriptSegments.length,
            metadata: buildDemoArtifactMetadata()
          }
        })
      )
    );

    await tx.job.deleteMany({
      where: {
        notebookId: DEMO_NOTEBOOK_ID,
        type: {
          in: ["YOUTUBE_INGESTION", "INDEX_EVIDENCE", "GENERATE_ARTIFACTS"]
        }
      }
    });
    await tx.job.create({
      data: {
        notebookId: DEMO_NOTEBOOK_ID,
        userId,
        type: "YOUTUBE_INGESTION",
        status: "SUCCEEDED",
        progress: 100,
        progressPercent: 100,
        currentStep: "Ready from static demo transcript",
        attempts: 1,
        attemptCount: 1,
        maxAttempts: 1,
        startedAt: new Date(0),
        finishedAt: new Date(0),
        metadata: {
          source: "static-demo-seed",
          segmentCount: demoTranscriptSegments.length,
          youtubeNetworkRequired: false
        } satisfies Prisma.InputJsonValue
      }
    });
    await tx.job.create({
      data: {
        notebookId: DEMO_NOTEBOOK_ID,
        userId,
        type: "INDEX_EVIDENCE",
        status: "SUCCEEDED",
        progress: 100,
        progressPercent: 100,
        currentStep: "Ready for local retrieval fallback",
        attempts: 1,
        attemptCount: 1,
        maxAttempts: 1,
        startedAt: new Date(0),
        finishedAt: new Date(0),
        metadata: {
          source: "static-demo-seed",
          result: {
            indexName: getSearchIndexName(),
            indexedCount: demoTranscriptSegments.length,
            skipped: true,
            metadata: {
              embeddingDimensionsExpected: null
            }
          }
        } satisfies Prisma.InputJsonValue
      }
    });

    await tx.chatMessage.deleteMany({
      where: {
        notebookId: DEMO_NOTEBOOK_ID,
        OR: [{ userId }, { userId: null }]
      }
    });
    await tx.chatMessage.create({
      data: {
        notebookId: DEMO_NOTEBOOK_ID,
        userId: null,
        role: "ASSISTANT",
        content:
          "Demo workspace is ready. Ask about evidence grounding, retrieval before generation, study artifacts, or why this reviewer path does not depend on live YouTube extraction.",
        citationsJson: {
          citations: [
            {
              evidenceSegmentId: "demo-seg-012",
              startSec: 240,
              endSec: 263,
              label: "4:00"
            },
            {
              evidenceSegmentId: "demo-seg-013",
              startSec: 263,
              endSec: 286,
              label: "4:23"
            }
          ],
          source: "static-demo-seed"
        } satisfies Prisma.InputJsonValue
      }
    });
  });

  console.info(
    "[demo:seed]",
    JSON.stringify({
      event: created ? "demo_notebook_created" : "demo_notebook_reused",
      notebookId: DEMO_NOTEBOOK_ID,
      demoUserEmail: DEMO_USER_EMAIL,
      userId,
      segmentCount: demoTranscriptSegments.length,
      artifactCount: Object.keys(demoArtifactJsonByType).length
    })
  );

  return {
    notebookId: DEMO_NOTEBOOK_ID,
    userId,
    created,
    segmentCount: demoTranscriptSegments.length,
    artifactCount: Object.keys(demoArtifactJsonByType).length
  };
}

export async function isDemoNotebookForUser({
  notebookId,
  userId,
  prisma = defaultPrisma
}: {
  notebookId: string;
  userId: string;
  prisma?: DemoNotebookPrisma;
}) {
  if (notebookId !== DEMO_NOTEBOOK_ID) {
    return false;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true }
  });

  return user?.email === DEMO_USER_EMAIL;
}

function buildDemoArtifactMetadata(): Prisma.InputJsonValue {
  return {
    source: "static-demo-seed",
    outputLanguageCode: "en",
    outputLanguageLabel: "English",
    transcriptStats: {
      segmentCount: demoTranscriptSegments.length,
      totalCharacters: demoTranscriptSegments.reduce(
        (total, segment) => total + segment.text.length,
        0
      )
    },
    retrievalSource: "local_lexical_fallback",
    retrievalMode: "local_lexical_fallback",
    retrievalFallbackReason: "static_demo_seed",
    indexedSegmentCount: demoTranscriptSegments.length
  };
}
