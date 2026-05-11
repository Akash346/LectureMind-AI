import { Prisma } from "@prisma/client";
import { z } from "zod";

import { generateFacultyJson } from "@/lib/faculty/models";
import { FACULTY_CHAT_SYSTEM_PROMPT } from "@/lib/faculty/prompts";
import { retrieveFacultyEvidence, type FacultyEvidence } from "@/lib/faculty/retrieval";
import { assertFacultySession, touchFacultySession } from "@/lib/faculty/session";
import { prisma } from "@/lib/prisma";

const FacultyChatModelSchema = z.object({
  answer: z.string().min(1),
  citations: z.array(z.string()).default([])
});

export async function answerFacultyChat(input: {
  sessionId: string;
  message: string;
}) {
  await assertFacultySession(input.sessionId);
  await touchFacultySession(input.sessionId);

  const evidence = await retrieveFacultyEvidence({
    sessionId: input.sessionId,
    query: input.message,
    topK: 8
  });

  if (evidence.length === 0) {
    return persistFacultyChat({
      sessionId: input.sessionId,
      userMessage: input.message,
      answer:
        "The session evidence does not contain enough information to answer that.",
      citations: []
    });
  }

  const generated = await generateFacultyJson({
    sessionId: input.sessionId,
    operation: "faculty_chat",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: FACULTY_CHAT_SYSTEM_PROMPT
      },
      {
        role: "user",
        content: [
          "Question:",
          input.message,
          "",
          "Evidence:",
          ...evidence.map((item) => formatEvidence(item)),
          "",
          "Return JSON shaped as {\"answer\":\"...\",\"citations\":[\"C1\"]}. Use only listed citation references."
        ].join("\n")
      }
    ]
  });
  const parsed = FacultyChatModelSchema.parse(generated.json);
  const citations = canonicalizeFacultyCitations(parsed.citations, evidence);

  if (!isInsufficientEvidenceAnswer(parsed.answer) && citations.length === 0) {
    throw new Error("Faculty chat answer did not include verifiable citations.");
  }

  return persistFacultyChat({
    sessionId: input.sessionId,
    userMessage: input.message,
    answer: parsed.answer,
    citations
  });
}

function canonicalizeFacultyCitations(
  references: string[],
  evidence: FacultyEvidence[]
) {
  const byReference = new Map(evidence.map((item) => [item.reference, item]));
  const seen = new Set<string>();

  return references
    .map((reference) => byReference.get(reference))
    .filter((item): item is FacultyEvidence => Boolean(item))
    .filter((item) => {
      if (seen.has(item.reference)) {
        return false;
      }
      seen.add(item.reference);
      return true;
    })
    .map((item) => ({
      reference: item.reference,
      timestamp: item.timestamp,
      quote: item.text.slice(0, 240),
      segmentId: item.id
    }));
}

async function persistFacultyChat(input: {
  sessionId: string;
  userMessage: string;
  answer: string;
  citations: Array<{
    reference: string;
    timestamp?: string;
    quote?: string;
    segmentId?: string;
  }>;
}) {
  const [, assistant] = await prisma.$transaction([
    prisma.facultyChatMessage.create({
      data: {
        sessionId: input.sessionId,
        role: "user",
        content: input.userMessage
      }
    }),
    prisma.facultyChatMessage.create({
      data: {
        sessionId: input.sessionId,
        role: "assistant",
        content: input.answer,
        citations: input.citations as Prisma.InputJsonValue
      }
    })
  ]);

  return {
    messageId: assistant.id,
    answer: input.answer,
    citations: input.citations
  };
}

function formatEvidence(item: FacultyEvidence) {
  const locator =
    item.sourceType === "lecture"
      ? item.timestamp
        ? `timestamp ${item.timestamp}`
        : "lecture"
      : item.pageNumber
        ? `page ${item.pageNumber}`
        : "document";

  return `[${item.reference}] ${locator}\n${item.text}`;
}

function isInsufficientEvidenceAnswer(answer: string) {
  return answer.toLowerCase().includes("does not contain enough information");
}
