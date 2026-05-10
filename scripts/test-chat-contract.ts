import assert from "node:assert/strict";

import {
  isAzureOpenAIConfigured,
  resetServerEnvForTests
} from "../lib/ai/azure-openai";
import {
  canonicalizeChatCitations,
  createSafeCitedFallback,
  parseAndVerifyChatResponse
} from "../lib/chat/chat-service";
import {
  chatRequestSchema,
  modelChatResponseSchema
} from "../lib/chat/chat-schemas";
import { getAzureSearchConfig } from "../lib/config/server-env";
import type { LectureEvidenceChunk } from "../lib/retrieval/lecture-retriever";

const chunks: LectureEvidenceChunk[] = [
  {
    evidenceSegmentId: "seg-1",
    startSec: 58,
    endSec: 65,
    label: "0:58",
    text: "State graphs coordinate nodes and transitions.",
    score: 3,
    source: "caption",
    retrievalMode: "local_lexical_fallback"
  },
  {
    evidenceSegmentId: "seg-2",
    startSec: 92,
    endSec: 105,
    label: "1:32",
    text: "Checkpoints save graph state before the next transition.",
    score: 2,
    source: "caption",
    retrievalMode: "local_lexical_fallback"
  }
];

const canonical = canonicalizeChatCitations({
  citationIds: ["seg-1", "seg-1"],
  chunks
});

assert.equal(canonical.ok, true, "supported citations canonicalize");

if (canonical.ok) {
  assert.deepEqual(canonical.citations, [
    {
      evidenceSegmentId: "seg-1",
      startSec: 58,
      endSec: 65,
      label: "0:58"
    }
  ]);
}

const unsupported = canonicalizeChatCitations({
  citationIds: ["seg-missing"],
  chunks
});

assert.equal(unsupported.ok, false, "unsupported citations are rejected");

assert.equal(
  chatRequestSchema.safeParse({ message: "" }).success,
  false,
  "empty chat messages are rejected"
);

const validModelResponse = {
  answer: "A state graph coordinates nodes and transitions.",
  citations: [{ evidenceSegmentId: "seg-1" }],
  followUps: ["What are graph edges?"]
};

assert.equal(
  modelChatResponseSchema.safeParse(validModelResponse).success,
  true,
  "model response contract accepts cited answers"
);

const verified = parseAndVerifyChatResponse({
  candidate: validModelResponse,
  chunks
});

assert.equal(verified.ok, true, "valid cited answer verifies");

const placeholderVerification = parseAndVerifyChatResponse({
  candidate: {
    answer: "A state graph coordinates nodes and transitions. [citation]",
    citations: [{ evidenceSegmentId: "seg-1" }],
    followUps: []
  },
  chunks
});

assert.equal(
  placeholderVerification.ok,
  true,
  "literal citation placeholders are accepted only after stripping"
);

if (placeholderVerification.ok) {
  assert.equal(
    placeholderVerification.response.answer.includes("[citation]"),
    false,
    "literal citation placeholders are removed from answer text"
  );
}

const unsupportedVerification = parseAndVerifyChatResponse({
  candidate: {
    answer: "A graph coordinates the lecture.",
    citations: [{ evidenceSegmentId: "made-up" }],
    followUps: []
  },
  chunks
});

assert.equal(
  unsupportedVerification.ok,
  false,
  "unsupported model citation fails verification"
);

const missingCitationVerification = parseAndVerifyChatResponse({
  candidate: {
    answer: "A graph coordinates the lecture.",
    citations: [],
    followUps: []
  },
  chunks
});

assert.equal(
  missingCitationVerification.ok,
  false,
  "answered model response without citations fails verification"
);

const safeInsufficient = parseAndVerifyChatResponse({
  candidate: {
    answer: "I could not find enough lecture evidence to answer this safely.",
    citations: [],
    followUps: []
  },
  chunks
});

assert.equal(
  safeInsufficient.ok,
  true,
  "safe insufficient-evidence response is allowed"
);

const safeFallback = createSafeCitedFallback({
  chunks,
  retrievalMode: "local_lexical_fallback",
  model: "test-model"
});

assert.equal(
  safeFallback.citations.length,
  2,
  "safe cited fallback includes top canonical citations"
);

const oldEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
const oldApiKey = process.env.AZURE_OPENAI_API_KEY;
const oldFast = process.env.AZURE_OPENAI_DEPLOYMENT_FAST;
const oldStrong = process.env.AZURE_OPENAI_DEPLOYMENT_STRONG;
const oldSearchIndex = process.env.AZURE_SEARCH_INDEX_NAME;
const oldLegacySearchIndex = process.env.AZURE_AI_SEARCH_INDEX;

delete process.env.AZURE_OPENAI_ENDPOINT;
delete process.env.AZURE_OPENAI_API_KEY;
delete process.env.AZURE_OPENAI_DEPLOYMENT_FAST;
delete process.env.AZURE_OPENAI_DEPLOYMENT_STRONG;
resetServerEnvForTests();

assert.equal(
  isAzureOpenAIConfigured(),
  false,
  "missing Azure OpenAI config is detected before chat generation"
);

restoreEnv("AZURE_OPENAI_ENDPOINT", oldEndpoint);
restoreEnv("AZURE_OPENAI_API_KEY", oldApiKey);
restoreEnv("AZURE_OPENAI_DEPLOYMENT_FAST", oldFast);
restoreEnv("AZURE_OPENAI_DEPLOYMENT_STRONG", oldStrong);
resetServerEnvForTests();

delete process.env.AZURE_SEARCH_INDEX_NAME;
process.env.AZURE_AI_SEARCH_INDEX = "lecturemind-index";
resetServerEnvForTests();

const searchConfig = getAzureSearchConfig();

assert.equal(
  searchConfig.indexName,
  "lecturemind-index",
  "legacy Azure Search index alias is honored"
);
assert.equal(
  searchConfig.source.indexName,
  "AZURE_AI_SEARCH_INDEX",
  "legacy Azure Search index source is reported"
);

restoreEnv("AZURE_SEARCH_INDEX_NAME", oldSearchIndex);
restoreEnv("AZURE_AI_SEARCH_INDEX", oldLegacySearchIndex);
resetServerEnvForTests();

console.log("Chat contract checks passed.");

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
