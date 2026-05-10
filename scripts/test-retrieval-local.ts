import assert from "node:assert/strict";

import {
  localLexicalSearchEvidence,
  validateRetrievalQuery,
  type LocalEvidenceSegment
} from "../lib/search/retriever";

const segments: LocalEvidenceSegment[] = [
  {
    id: "seg-1",
    notebookId: "notebook-a",
    startSec: 58,
    endSec: 65,
    text: "LangGraph uses a state graph to coordinate nodes and transitions.",
    sourceType: "CAPTION"
  },
  {
    id: "seg-2",
    notebookId: "notebook-a",
    startSec: 320,
    endSec: 336,
    text: "Before an exam, review the graph state, edges, and checkpoints.",
    sourceType: "CAPTION"
  },
  {
    id: "seg-3",
    notebookId: "notebook-b",
    startSec: 12,
    endSec: 18,
    text: "This belongs to a different notebook and should not be passed in.",
    sourceType: "CAPTION"
  }
];

assert.equal(validateRetrievalQuery(""), false, "empty query is rejected");
assert.equal(
  validateRetrievalQuery("explain state graph"),
  true,
  "non-empty query is accepted"
);

const allowedSegments = segments.filter(
  (segment) => segment.notebookId === "notebook-a"
);
const hits = localLexicalSearchEvidence({
  query: "Explain the LangGraph state graph",
  segments: allowedSegments,
  topK: 3
});

assert.equal(hits[0]?.evidenceSegmentId, "seg-1");
assert.ok(
  hits.every((hit) => hit.notebookId === "notebook-a"),
  "local retrieval only returns the ownership-filtered notebook segments"
);

const timestampHits = localLexicalSearchEvidence({
  query: "Summarize around 5:20",
  segments: allowedSegments,
  topK: 1
});

assert.equal(timestampHits[0]?.evidenceSegmentId, "seg-2");

const broadHits = localLexicalSearchEvidence({
  query: "What is this lecture about?",
  segments: allowedSegments,
  topK: 8
});

assert.ok(
  broadHits.length >= 2,
  "broad lecture questions return representative local chunks"
);
assert.ok(
  broadHits.every((hit) => hit.notebookId === "notebook-a"),
  "broad local retrieval does not leak cross-notebook chunks"
);

console.log("Local retrieval contract checks passed.");
