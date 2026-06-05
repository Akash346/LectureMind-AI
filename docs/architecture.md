# Architecture

## System overview

LectureMind-AI is a Next.js (App Router) application backed by PostgreSQL (via Prisma), with model and retrieval services provided by Azure OpenAI and Azure AI Search. The defining design choice is **grounding**: a lecture is decomposed into timestamped evidence, and every generated artifact and chat answer must cite that evidence. A deterministic verifier rejects anything it cannot ground.

> The current implementation is **early-stage**. It runs a complete, working pipeline, but several boundaries (e.g., the job worker) are intentionally simple for now, with a clear path to a production topology described below.

## Main components

| Component | Location | Responsibility |
| --- | --- | --- |
| Web app & API | `app/` | UI (App Router pages) and server API routes; auth, validation, safe JSON |
| Data model | `prisma/` | Notebooks, evidence, artifacts, chat, jobs, faculty entities |
| Model layer | `lib/ai/` | Azure OpenAI calls, artifact schemas, prompts, citation & model verifiers |
| Retrieval | `lib/retrieval/`, `lib/search/` | Ownership-safe retrieval; embeddings + Azure AI Search hybrid queries |
| Chat | `lib/chat/` | Source-grounded answer generation and citation verification |
| Ingestion | `lib/ingestion/`, `lib/youtube/`, `worker/` | Caption ingestion + optional Python worker (yt-dlp, ffmpeg, Azure Speech) |
| Faculty | `lib/faculty/` | Isolated faculty sessions, reports, Mistral OCR, accessibility DOCX, storage |
| Config | `lib/config/` | Server-side environment resolution (canonical + legacy aliases) |

## Data flow

1. **User input** — the student submits a public YouTube URL (faculty submits a lecture URL or uploads a PDF/DOCX for accessibility).
2. **Preprocessing** — the URL is validated and normalized; metadata, duration, and live-state are checked.
3. **Parsing / chunking** — captions (or worker ASR) are normalized and stored as timestamped `EvidenceSegment` rows.
4. **Indexing** — when Azure Search + embeddings are configured, evidence is embedded and indexed; otherwise local lexical retrieval is used.
5. **Model / API call** — artifacts and chat answers are generated from retrieved evidence via Azure OpenAI, constrained by strict Zod schemas.
6. **Verification** — a deterministic citation verifier (plus optional model verifier) accepts, repairs once, or safely rejects the output.
7. **Output & display** — the UI renders artifacts and answers with timestamp citation chips that seek the embedded video; faculty accessibility produces a downloadable remediated DOCX.

## Security boundaries

- Model credentials and service keys are **server-side only**; the browser calls only the app's own routes.
- Retrieval is **ownership-scoped** (`notebook.userId`), and Azure Search queries filter by `notebookId` + `userId`.
- The **faculty workspace is isolated** from student data at the workspace, search-namespace, and storage-container levels.
- AI output is schema-validated and citation-verified before it is shown.
- See [security-considerations.md](security-considerations.md) for the full threat model.

## Future architecture improvements

The intended production topology moves job processing to a dedicated worker (see *Job Processing* below), adds a provider abstraction so non-Azure / local models can be used, and introduces the security automation on the [roadmap](../ROADMAP.md#security-roadmap). The processor boundary is already separated so this move does not change the UI contract.

---

## Pipeline summary

```text
YouTube URL
  -> Notebook row
  -> ingestion job
  -> EvidenceSegment rows
  -> automatic Azure AI Search indexing when configured
  -> artifacts and chat use the same grounded retrieval layer
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

## Phase 6 Active Workspace

The active `/chats/[chatId]` workspace now owns the same pipeline described in the older source/studio shell:

```text
WorkspaceShell
  -> POST /api/notebooks/[id]/process while PENDING
  -> poll /api/notebooks/[id]/status
  -> poll /api/notebooks/[id]/index/status when READY
  -> POST /api/notebooks/[id]/index when indexing is needed
  -> ArtifactDock creates GENERATE_ARTIFACTS jobs
  -> ArtifactPanel renders cached or generated results
```

YouTube ingestion also enqueues `INDEX_EVIDENCE` after transcript rows are saved, so indexing does not depend only on the browser staying open. The route-triggered workspace check remains useful for older ready notebooks that have evidence but no indexed rows.

Chat and artifacts now share `lib/retrieval/lecture-retriever.ts`. Azure hybrid retrieval is selected only when Search is configured, embeddings are configured, and indexed evidence rows exist. Otherwise both chat and artifacts use the same local lexical fallback over the notebook's own `EvidenceSegment` rows.

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
