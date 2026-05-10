# Failure Modes

LectureMind should fail closed: no fake answers, no raw stack traces, and no leaked credentials.

## Ingestion

- Private, unavailable, live, region-blocked, age-restricted, too-long, or no-caption videos produce typed notebook failures.
- Worker and Azure Speech failures are stored on the latest ingestion job and rendered as safe UI copy.

## Artifacts

- Missing Azure OpenAI config: `AI_NOT_CONFIGURED`
- Too little transcript evidence: `INSUFFICIENT_EVIDENCE`
- Bad JSON or schema mismatch: `MODEL_BAD_JSON` or `MODEL_SCHEMA_INVALID`
- Citation mismatch: `VERIFICATION_FAILED`

Artifacts are written as `GENERATING` first and always end as `READY` or `FAILED`.

## Embeddings and Search

- Missing embedding deployment: `EMBEDDING_NOT_CONFIGURED`
- Embedding rate limit: `EMBEDDING_RATE_LIMITED`
- Embedding timeout: `EMBEDDING_TIMEOUT`
- Azure Search missing: `SEARCH_NOT_CONFIGURED`
- Index upload failure: `SEARCH_INDEX_FAILED`
- Existing index schema or vector dimension mismatch: `SEARCH_INDEX_FAILED`

Failed indexing does not block transcript viewing, artifact viewing, or chat. Chat falls back to local lexical retrieval when possible and the UI shows "Using local retrieval fallback."

Fallback reasons are specific:

- `search_not_configured`: neither canonical nor legacy Search endpoint/key resolved.
- `not_indexed_yet`: Search and embeddings are configured, but this notebook has not been indexed into the currently resolved index.
- `azure_search_query_failed`: Azure hybrid search was attempted and failed.
- `azure_search_query_returned_zero_results`: Azure hybrid search was attempted but returned no canonical hits.

The resolved index name is logged and returned in status. If `.env` contains `AZURE_AI_SEARCH_INDEX=lecturemind-index`, status should show `indexName: "lecturemind-index"` and `indexEnvSource: "AZURE_AI_SEARCH_INDEX"`.

## Chat

Chat returns structured failures:

```json
{
  "error": {
    "code": "INSUFFICIENT_EVIDENCE",
    "message": "I could not find enough lecture evidence to answer this safely."
  }
}
```

Common chat failure codes:

- `EMPTY_QUERY`
- `NOTEBOOK_NOT_FOUND`
- `INSUFFICIENT_EVIDENCE`
- `AI_NOT_CONFIGURED`
- `MODEL_TIMEOUT`
- `MODEL_RATE_LIMITED`
- `MODEL_BAD_JSON`
- `MODEL_SCHEMA_INVALID`
- `CITATION_VERIFICATION_FAILED`
- `UNKNOWN`

Citation IDs must come from retrieved chunks. The API canonicalizes timestamps from the database and rejects unsupported IDs.

The expected model response shape is:

```json
{
  "answer": "string",
  "citations": [{ "evidenceSegmentId": "string" }],
  "followUps": ["string"]
}
```

If the model cites an unsupported ID or omits citations for a supported answer, the server repairs once. If repair still fails while retrieved evidence exists, the API returns a safe cited fallback instead of an opaque 422:

```json
{
  "answer": "I found relevant lecture moments, but I could not verify a fully grounded answer. Use these cited moments to review the source.",
  "citations": [{ "evidenceSegmentId": "seg_1", "startSec": 58, "endSec": 65, "label": "0:58" }],
  "followUps": ["Ask me to explain one cited moment.", "Ask for a simpler summary."],
  "retrievalMode": "local_lexical_fallback"
}
```

True structured errors include a stable code and safe details:

```json
{
  "error": {
    "code": "CITATION_VERIFICATION_FAILED",
    "message": "I found lecture evidence, but could not verify the model response safely.",
    "details": {
      "retrievalMode": "azure_hybrid",
      "retrievedSegmentCount": 8,
      "verificationReason": "unsupported_citation_id",
      "indexName": "lecturemind-index",
      "indexEnvSource": "AZURE_AI_SEARCH_INDEX"
    }
  }
}
```
