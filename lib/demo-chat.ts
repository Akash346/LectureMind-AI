import { Prisma } from "@prisma/client";

import { chatRequestSchema, type ChatServiceResult } from "@/lib/chat/chat-schemas";
import {
  DEMO_NOTEBOOK_ID,
  demoTranscriptSegments
} from "@/lib/demo-notebook-content";
import { prisma } from "@/lib/prisma";

const citationsById = new Map(
  demoTranscriptSegments.map((segment) => [
    segment.id,
    {
      evidenceSegmentId: segment.id,
      startSec: segment.startSec,
      endSec: segment.endSec,
      label: formatLabel(segment.startSec)
    }
  ])
);

export async function answerDemoNotebookChat({
  userId,
  body
}: {
  userId: string;
  body: unknown;
}): Promise<ChatServiceResult> {
  const parsed = chatRequestSchema.safeParse(body);

  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      response: {
        error: {
          code: "EMPTY_QUERY",
          message: "Enter a question about the lecture."
        }
      }
    };
  }

  const answer = buildDemoAnswer(parsed.data.message);
  await prisma.$transaction([
    prisma.chatMessage.create({
      data: {
        notebookId: DEMO_NOTEBOOK_ID,
        userId,
        role: "USER",
        content: parsed.data.message
      }
    }),
    prisma.chatMessage.create({
      data: {
        notebookId: DEMO_NOTEBOOK_ID,
        userId,
        role: "ASSISTANT",
        content: answer.answer,
        citationsJson: {
          citations: answer.citations,
          model: "static-demo-chat",
          retrievalMode: "local_lexical_fallback",
          contextSegmentCount: demoTranscriptSegments.length
        } satisfies Prisma.InputJsonValue
      }
    })
  ]);

  console.info(
    "[demo:chat]",
    JSON.stringify({
      event: "demo_chat_answered",
      notebookId: DEMO_NOTEBOOK_ID,
      userId,
      citedSegmentCount: answer.citations.length
    })
  );

  return {
    ok: true,
    response: {
      ...answer,
      followUps: [
        "How does retrieval reduce unsupported answers?",
        "Turn this into a quiz question.",
        "Why is the demo path stable?"
      ],
      retrievalMode: "local_lexical_fallback",
      metadata: {
        model: "static-demo-chat",
        contextSegmentCount: demoTranscriptSegments.length,
        retrievalMode: "local_lexical_fallback",
        retrievedSegmentCount: answer.citations.length,
        topEvidenceIds: answer.citations.map(
          (citation) => citation.evidenceSegmentId
        ),
        fallbackReason: "static_demo_seed",
        indexedSegmentCount: demoTranscriptSegments.length
      }
    }
  };
}

function buildDemoAnswer(message: string) {
  const normalized = message.toLowerCase();

  if (normalized.includes("youtube") || normalized.includes("demo")) {
    return citedAnswer(
      "The stable reviewer path avoids live YouTube extraction by opening a preloaded transcript in the normal notebook workspace. The lecture says a preloaded transcript can exercise the same notebook, artifact, and chat interfaces, and that the demo should use real evidence rows and ready artifact records.",
      ["demo-seg-012", "demo-seg-013"]
    );
  }

  if (normalized.includes("retrieval") || normalized.includes("generation")) {
    return citedAnswer(
      "Retrieval comes before generation: the system first selects relevant transcript segments, then asks the model to work from that bounded context. When no segment supports a question, the assistant should say it lacks enough evidence instead of inventing an answer.",
      ["demo-seg-004", "demo-seg-005"]
    );
  }

  if (
    normalized.includes("artifact") ||
    normalized.includes("summary") ||
    normalized.includes("study") ||
    normalized.includes("quiz") ||
    normalized.includes("flashcard")
  ) {
    return citedAnswer(
      "The transcript supports multiple study artifacts: summaries preserve the reasoning chain, study guides name concepts and mistakes, flashcards test one concept at a time, and quiz explanations teach the distinction behind the correct answer.",
      ["demo-seg-006", "demo-seg-007", "demo-seg-008", "demo-seg-009", "demo-seg-010"]
    );
  }

  if (normalized.includes("trust") || normalized.includes("ground")) {
    return citedAnswer(
      "The main trust mechanism is evidence grounding. Every generated answer or artifact should trace to a specific transcript moment so students can compare the output against the original explanation.",
      ["demo-seg-002", "demo-seg-003"]
    );
  }

  return citedAnswer(
    "The lecture's main argument is that trustworthy AI study tools combine evidence grounding, retrieval before generation, diverse study artifacts, and a stable preloaded demo path that opens with chat and artifacts ready.",
    ["demo-seg-001", "demo-seg-004", "demo-seg-006", "demo-seg-014"]
  );
}

function citedAnswer(answer: string, segmentIds: string[]) {
  const citations = segmentIds
    .map((id) => citationsById.get(id))
    .filter((citation) => Boolean(citation));

  return {
    answer,
    citations: citations as Array<{
      evidenceSegmentId: string;
      startSec: number;
      endSec: number;
      label: string;
    }>
  };
}

function formatLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${remainingSeconds}`;
}
