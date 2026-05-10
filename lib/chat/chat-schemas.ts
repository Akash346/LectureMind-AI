import { z } from "zod";

import { languageSchema } from "@/lib/ai/schemas";

export const chatModeSchema = z.enum(["study", "exam", "simple", "deep"]);
export const responseLengthSchema = z.enum(["short", "medium", "long"]);

export const chatRequestSchema = z
  .object({
    message: z.string().trim().min(1).max(2000),
    language: languageSchema.optional().default("en"),
    mode: chatModeSchema.optional().default("study"),
    responseLength: responseLengthSchema.optional().default("medium")
  })
  .strict();

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatMode = z.infer<typeof chatModeSchema>;
export type ChatResponseLength = z.infer<typeof responseLengthSchema>;

export const modelChatResponseSchema = z
  .object({
    answer: z.string().trim().min(1),
    citations: z
      .array(
        z
          .object({
            evidenceSegmentId: z.string().trim().min(1)
          })
          .strict()
      )
      .default([]),
    followUps: z.array(z.string().trim().min(1)).max(4).default([])
  })
  .strict();

export type ModelChatResponse = z.infer<typeof modelChatResponseSchema>;

export type ChatCitation = {
  evidenceSegmentId: string;
  startSec: number;
  endSec: number;
  label: string;
};

export type ChatSuccessResponse = {
  answer: string;
  citations: ChatCitation[];
  followUps: string[];
  retrievalMode: "azure_hybrid" | "local_lexical_fallback";
  metadata: {
    model: string;
    contextSegmentCount: number;
    retrievalMode?: "azure_hybrid" | "local_lexical_fallback";
    retrievedSegmentCount?: number;
    topEvidenceIds?: string[];
    fallbackReason?: string | null;
    searchIndexName?: string;
    indexEnvSource?: string;
    searchConfigured?: boolean;
    embeddingsConfigured?: boolean;
    indexedSegmentCount?: number;
    repaired?: boolean;
    safeFallback?: boolean;
  };
};

export type ChatFailureCode =
  | "NOTEBOOK_NOT_FOUND"
  | "EMPTY_QUERY"
  | "INSUFFICIENT_EVIDENCE"
  | "AI_NOT_CONFIGURED"
  | "MODEL_TIMEOUT"
  | "MODEL_RATE_LIMITED"
  | "MODEL_BAD_JSON"
  | "MODEL_SCHEMA_INVALID"
  | "CITATION_VERIFICATION_FAILED"
  | "RATE_LIMITED"
  | "UNKNOWN";

export type ChatFailureResponse = {
  error: {
    code: ChatFailureCode;
    message: string;
    details?: {
      retrievalMode?: "azure_hybrid" | "local_lexical_fallback";
      retrievedSegmentCount?: number;
      verificationReason?: string;
      indexName?: string;
      indexEnvSource?: string;
      fallbackReason?: string | null;
    };
  };
};

export type ChatServiceResult =
  | { ok: true; response: ChatSuccessResponse }
  | { ok: false; response: ChatFailureResponse; status: number };
