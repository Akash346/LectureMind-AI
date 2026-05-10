# Phase 5 Retrieval and Grounded Chat

Phase 5 adds the backend backbone for reliable study chat without changing the visual direction of the workspace.

## What Changed

- Durable PostgreSQL-backed jobs for artifact generation, embedding generation, and evidence indexing.
- Azure OpenAI embedding wrapper in `lib/ai/embeddings.ts`.
- Azure AI Search evidence index helpers in `lib/search/*`.
- Shared retrieval service in `lib/retrieval/lecture-retriever.ts`.
- Source-grounded chat service and API in `lib/chat/*` and `POST /api/notebooks/[notebookId]/chat`.
- Working chat UI with citation chips that seek the YouTube player.
- Local lexical fallback when Azure AI Search or embeddings are not configured.

## Environment

Required for chat generation:

```bash
AZURE_OPENAI_ENDPOINT="https://YOUR-RESOURCE.openai.azure.com"
AZURE_OPENAI_API_KEY="..."
AZURE_OPENAI_DEPLOYMENT_FAST="..."
AZURE_OPENAI_DEPLOYMENT_STRONG="..."
AZURE_OPENAI_API_VERSION="2024-10-21"
```

Required for semantic indexing:

```bash
AZURE_OPENAI_EMBEDDING_DEPLOYMENT="..."
AZURE_OPENAI_EMBEDDING_DIMENSIONS="1536"
AZURE_SEARCH_ENDPOINT="https://YOUR-SEARCH.search.windows.net"
AZURE_SEARCH_API_KEY="..."
AZURE_SEARCH_INDEX_NAME="lecturemind-evidence-dev"
```

`AZURE_SEARCH_INDEX_NAME` is the preferred name. The server also accepts legacy `AZURE_AI_SEARCH_ENDPOINT`, `AZURE_AI_SEARCH_API_KEY`, and `AZURE_AI_SEARCH_INDEX` aliases. Resolution order is canonical first, then legacy alias, then the `lecturemind-evidence-dev` default only if no index variable exists. If `.env` contains `AZURE_AI_SEARCH_INDEX=lecturemind-index` and no canonical index name, runtime uses `lecturemind-index`.

`.env.example` is never loaded by runtime code or verification scripts. It is only a template for humans; local development and Next.js use `.env`.

If Search or embeddings are missing, chat still works through `local_lexical_fallback`. If chat model credentials are missing, the chat API returns a structured `AI_NOT_CONFIGURED` failure.

## Jobs

The `Job` table remains compatible with earlier ingestion jobs and now also records:

- `userId`
- `progressPercent`
- `errorCode`
- `safeErrorMessage`
- `attemptCount`
- `maxAttempts`
- `metadata`

New job types:

- `GENERATE_ARTIFACTS`
- `GENERATE_EMBEDDINGS`
- `INDEX_EVIDENCE`

Routes create PostgreSQL `Job` rows and the local API path can process them immediately for development feedback. For production, the same processors can be moved into Azure Container Apps:

```text
Next.js route -> create Job row
Azure Container Apps worker -> poll QUEUED jobs
processor -> update Job and notebook/evidence rows
UI -> poll /api/jobs/[jobId]
```

No Redis or BullMQ is required for this milestone.

The chat route includes a small in-memory per-user/notebook limiter for local protection against double-clicks and accidental loops. Replace it with a shared store such as Redis, Azure Cache for Redis, or an API gateway policy before running multiple production instances.

## Indexing

`POST /api/notebooks/[notebookId]/index` creates or reuses an `INDEX_EVIDENCE` job when the notebook is `READY`. It prevents duplicate queued/running index jobs for the same notebook.

`GET /api/notebooks/[notebookId]/index/status` reports:

- `searchConfigured`
- `embeddingsConfigured`
- `indexName`
- total evidence segments
- indexed segment count
- failed segment count
- latest indexing job
- chat readiness
- `retrievalMode`

Vectors are not stored in PostgreSQL. Evidence rows only store metadata such as `embeddingStatus`, `indexedAt`, `searchDocumentId`, and `embeddingModel`.

The index bootstrap creates the resolved index when missing and validates required fields plus vector dimensions when it already exists. For `AZURE_AI_SEARCH_INDEX=lecturemind-index`, this means `lecturemind-index`.

## Retrieval

`retrieveLectureContext` always validates notebook ownership before returning transcript text. It tries Azure hybrid search only when:

- Azure Search is configured
- embeddings are configured
- at least one evidence segment has been indexed

Otherwise it falls back to a deterministic lexical scorer over the current notebook's `EvidenceSegment` rows. Broad prompts such as "What is this lecture about?", "Quiz me", and "What should I review before an exam?" receive representative early/high-density chunks instead of zero results.

## Chat Grounding

The chat prompt tells the model to:

- use only provided evidence by default
- cite only allowed `evidenceSegmentId` values
- never invent timestamps or source IDs
- never cite timestamps directly
- return insufficient evidence when the retrieved chunks do not support an answer
- return JSON shaped as:

```json
{
  "answer": "string",
  "citations": [{ "evidenceSegmentId": "string" }],
  "followUps": ["string"]
}
```

The service then verifies:

- citation IDs exist in the retrieved chunks
- canonical timestamps come from `EvidenceSegment` rows
- answered responses include at least one citation
- unsupported citation IDs are rejected

If verification fails, the service attempts one repair. If retrieval found useful evidence but the model and repair response still cannot be verified, chat returns a safe cited fallback with the top retrieved moments. This avoids the old "model completed, then opaque 422" failure mode.

## Demo Readiness

Run:

```bash
npm run check-env
node scripts/check-search-env.mjs
npm run test:retrieval
npm run test:chat
npm run lint
npm run build
```

Expected fallback behavior:

- Missing Azure Search: chat uses local lexical fallback.
- Missing embedding deployment: chat uses local lexical fallback.
- Missing Azure OpenAI chat deployment: chat returns `AI_NOT_CONFIGURED`.
- Insufficient matching evidence: chat returns `INSUFFICIENT_EVIDENCE`.
