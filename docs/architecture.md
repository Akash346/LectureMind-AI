# Architecture

```text
YouTube URL
  -> Notebook row
  -> ingestion job
  -> EvidenceSegment rows
  -> optional Azure AI Search indexing
  -> artifacts and chat use the same grounded evidence
```

## Core Boundaries

- Next.js routes own auth, input validation, and safe JSON responses.
- Prisma/PostgreSQL owns notebook, evidence, artifact, chat, and durable job state.
- `lib/ai/*` owns model calls and artifact verification.
- `lib/search/*` owns embeddings and Azure AI Search indexing/querying.
- `lib/retrieval/*` owns ownership-safe evidence retrieval.
- `lib/chat/*` owns source-grounded answer generation and citation verification.

## Job Processing

Jobs are stored in PostgreSQL and processed by route-triggered processors in this build. This keeps the hackathon deployment simple while preserving a clean worker boundary.

Future production move:

```text
API route creates QUEUED job
Azure Container Apps worker polls jobs
worker marks RUNNING
processor writes progress/results
UI polls job status
```

The same processors can be reused by the worker without changing the UI contract.

The intended production path for indexing is:

```text
Next.js route validates ownership and creates Job(QUEUED)
Azure Container Apps worker polls QUEUED INDEX_EVIDENCE jobs
worker marks RUNNING and calls the existing processor
processor embeds EvidenceSegment rows and writes Azure Search documents
processor updates EvidenceSegment indexing metadata and Job status
workspace polls /api/notebooks/[id]/index/status
```

No full Azure Queue is required for this phase. A managed queue can be inserted later between the route and worker if job volume requires it.

## Retrieval Safety

Retrieval always starts with a notebook ownership query:

```text
notebook.id = notebookId AND notebook.userId = currentUser.id
```

If the notebook is not owned by the user, transcript text is never returned. Azure Search queries also filter by `notebookId` and `userId`, and results are canonicalized against database rows before chat sees them.

## Environment Boundary

Server code reads Azure configuration through `lib/config/server-env.ts`. Canonical names are:

- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_API_VERSION`
- `AZURE_OPENAI_DEPLOYMENT_FAST`
- `AZURE_OPENAI_DEPLOYMENT_STRONG`
- `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`
- `AZURE_OPENAI_EMBEDDING_DIMENSIONS`
- `AZURE_SEARCH_ENDPOINT`
- `AZURE_SEARCH_API_KEY`
- `AZURE_SEARCH_INDEX_NAME`
- `AZURE_STORAGE_CONNECTION_STRING`
- `AZURE_STORAGE_CONTAINER`
- `AZURE_SPEECH_KEY`
- `AZURE_SPEECH_REGION`
- `AZURE_SPEECH_LANGUAGE`

Deprecated `AZURE_AI_SEARCH_*` names are mapped as server-side aliases. Resolution is canonical first, then alias, then `lecturemind-evidence-dev` as the final index default only when both index variables are missing. A local file with `AZURE_AI_SEARCH_INDEX=lecturemind-index` resolves to `lecturemind-index`. `.env.example` is never loaded by runtime code; it is documentation only.

## Observability

Safe logs include stage names, retrieval mode, model latency, index status, and error codes. Secrets, full transcripts, and full prompts are never logged unless `DEBUG_AI=true`, and that flag should stay off in shared or production logs.
