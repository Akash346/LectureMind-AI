# LectureMind AI

LectureMind AI is a grounded lecture study and faculty review workspace. Phase 6 keeps the working Phase 2/3 YouTube ingestion, Phase 4 artifact generation, and Phase 5 retrieval backbone, then rewires the active student workspace so ingestion, Azure AI Search indexing, chat, artifacts, citations, and the refreshed study UI work together end to end. Phase 7 adds a separate Faculty workspace for lecture review, improvement and bias reports, accessibility remediation, Mistral OCR, and service health checks.

Audio/video overviews, slide decks, Canvas LMS integration, advanced analytics, and provost workflows are still later phases.

## Stack

- Next.js App Router, TypeScript, Tailwind CSS
- shadcn/ui-style components with Radix primitives
- Framer Motion for pane transitions and artifact loading states
- Prisma ORM with PostgreSQL
- Auth.js / NextAuth Google provider
- Zod validation
- Server-side YouTube metadata and caption ingestion
- Optional FastAPI worker with yt-dlp, ffmpeg audio prep, and Azure Speech fallback
- Azure OpenAI artifact generation with Zod validation and verifier checks
- Azure OpenAI embeddings and Azure AI Search hybrid retrieval
- Source-grounded chat and artifacts with deterministic citation verification
- Faculty-only review sessions with isolated Azure Search namespaces
- Azure OpenAI JSON schema structured outputs for Faculty reports
- Mistral Document AI OCR for Faculty accessibility remediation
- Azure Blob Storage for uploaded Faculty documents and generated DOCX files
- Zustand for workspace pane state

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Copy environment variables:

```bash
cp .env.example .env
```

3. Fill in the required values:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/lecturemind_ai?schema=public"
NEXTAUTH_SECRET="generate-a-local-secret"
NEXTAUTH_URL="http://localhost:3000"
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

LECTUREMIND_WORKER_URL="http://localhost:8000"
PYTHON_WORKER_URL="http://localhost:8000"
INGESTION_ENGINE="hybrid"
AZURE_SPEECH_KEY=""
AZURE_SPEECH_REGION=""
AZURE_SPEECH_LANGUAGE="en-US"
MAX_VIDEO_DURATION_SECONDS="10800"
ENABLE_AZURE_SPEECH_FALLBACK="true"
ENABLE_YTDLP_WORKER="true"
INGESTION_RETRY_LIMIT="2"
WORKER_SHARED_SECRET=""

AZURE_OPENAI_ENDPOINT=""
AZURE_OPENAI_API_KEY=""
AZURE_OPENAI_DEPLOYMENT_FAST=""
AZURE_OPENAI_DEPLOYMENT_STRONG=""
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=""
AZURE_OPENAI_EMBEDDING_DIMENSIONS="1536"
AZURE_OPENAI_API_VERSION="2024-10-21"
DEBUG_AI="false"

AZURE_SEARCH_ENDPOINT=""
AZURE_SEARCH_API_KEY=""
AZURE_SEARCH_INDEX_NAME="lecturemind-evidence-dev"

AZURE_STORAGE_CONNECTION_STRING=""
AZURE_STORAGE_CONTAINER=""
AZURE_STORAGE_FACULTY_CONTAINER="faculty-sessions"

FACULTY_SESSION_TTL_MINUTES="120"
FACULTY_HEARTBEAT_INTERVAL_SECONDS="30"
FACULTY_SWEEP_SECRET=""
FACULTY_PRIMARY_MODEL_DEPLOYMENT=""
FACULTY_AZURE_SEARCH_INDEX_NAME="lecturemind-faculty-evidence-dev"
MISTRAL_OCR_ENDPOINT=""
MISTRAL_OCR_API_KEY=""
MISTRAL_OCR_MODEL="mistral-document-ai-2512"
```

`AZURE_SEARCH_INDEX_NAME` is preferred and defaults to `lecturemind-evidence-dev` only when neither index variable exists. The legacy `AZURE_AI_SEARCH_ENDPOINT`, `AZURE_AI_SEARCH_API_KEY`, and `AZURE_AI_SEARCH_INDEX` names are also accepted. If `.env` contains only `AZURE_AI_SEARCH_INDEX=lecturemind-index`, runtime uses `lecturemind-index` and reports `indexEnvSource: "AZURE_AI_SEARCH_INDEX"`.

`.env.example` is documentation only. Next.js and the verification scripts read `.env`; `.env.example` cannot override local secrets or runtime config.

`INGESTION_ENGINE=node` uses only the Phase 2 Node caption path. `worker` uses only the Python worker. `hybrid` tries Node captions first, then calls the worker when captions are missing or temporarily unavailable. `LECTUREMIND_WORKER_URL` is the preferred server-side worker URL for Azure Container Apps and production deployments; `PYTHON_WORKER_URL` remains accepted as a local legacy alias.

For Phase 4 artifact generation and Phase 5 chat, set `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, and at least one of `AZURE_OPENAI_DEPLOYMENT_FAST` or `AZURE_OPENAI_DEPLOYMENT_STRONG`. If these are missing, transcript processing and local retrieval still work, but AI outputs fail safely.

For Azure AI Search indexing, also set `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`, `AZURE_SEARCH_ENDPOINT`, and `AZURE_SEARCH_API_KEY`. If these are missing, chat uses local lexical retrieval fallback over `EvidenceSegment` rows.

For the Faculty workspace, set `FACULTY_PRIMARY_MODEL_DEPLOYMENT` to the Azure OpenAI deployment used for improvement, bias, chat, and accessibility remediation. If it is omitted, the app falls back to `AZURE_OPENAI_DEPLOYMENT_STRONG` and then `AZURE_OPENAI_DEPLOYMENT_FAST`.

`MISTRAL_OCR_ENDPOINT` is posted to directly by the OCR client. Use the full Azure Foundry Mistral OCR endpoint, for example `https://<resource>.services.ai.azure.com/providers/mistral/azure/ocr`. The client does not append `/providers/mistral/azure/ocr` itself.

4. Create the database and run migrations:

```bash
npm run check-env
npm run prisma:generate
npm run prisma:migrate
```

5. Start the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Phase 3 Worker Setup

The worker is optional for local caption-only testing, but required for yt-dlp and Azure Speech fallback.

```bash
cd worker
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

In another terminal:

```bash
npm run dev
```

Health check:

```bash
curl http://localhost:8000/health
```

Expected:

```json
{"ok":true,"service":"lecturemind-worker","version":"phase-3"}
```

Install `ffmpeg` and make sure it is on `PATH` before testing audio transcription. If ffmpeg is missing, the worker returns a safe `AUDIO_EXTRACTION_FAILED` card instead of crashing.

## Phase 2 YouTube Ingestion

The Phase 2 flow is intentionally server-side:

1. Create a notebook with a public YouTube watch, short, live, or `youtu.be` URL.
2. The workspace triggers `POST /api/notebooks/[notebookId]/process` once while the notebook is `PENDING`.
3. The server validates and normalizes the URL, fetches video metadata, checks duration/live state, fetches available captions, normalizes transcript text, and writes every segment as `EvidenceSegment`.
4. The notebook moves to `READY`, and the workspace renders the embedded YouTube player, source metadata, progress state, and transcript timeline.
5. Clicking a timestamp chip seeks the YouTube player to that moment.

If captions are unavailable, private, region-blocked, age-restricted, too long, rate-limited, or otherwise inaccessible, the app stores a typed safe error and renders a polished failure card. Raw stack traces are not shown to users.

## Phase 3 Hybrid Ingestion

The default `hybrid` flow preserves Phase 2 and adds a fallback layer:

```text
Next.js workspace
  -> POST /api/notebooks/[id]/process
  -> local queue abstraction
  -> Node caption ingestion
  -> Python worker fallback when useful
  -> yt-dlp captions/subtitles/audio
  -> Azure Speech if no captions and configured
  -> EvidenceSegment rows
  -> workspace status polling
```

New evidence rows may include `language`, `extractionEngine`, and `rawSource`, so the workspace can distinguish YouTube captions, auto-captions, and Azure Speech transcription. Retryable failures show a retry button that calls the same process route with `force=true`.

## Phase 4 AI Study Artifacts

When a notebook is `READY`, the Studio panel can generate:

- Structured Outline
- 90-second Summary
- 5-minute Summary
- Study Guide
- Flashcards
- Quiz
- Mind Map

Artifact generation is server-side only. The browser never receives Azure OpenAI credentials and never calls the model directly. Each artifact is stored by `notebookId`, `type`, and `language`, so bilingual outputs do not overwrite each other.

Generation flow:

```text
EvidenceSegment rows
  -> evidence compiler
  -> dedicated artifact agent
  -> strict Zod schema
  -> deterministic citation verifier
  -> model verifier
  -> optional one-pass repair
  -> Artifact READY or FAILED
```

Citation chips are rendered in every artifact view and reuse the existing YouTube timestamp seek behavior. The verifier rejects missing evidence IDs, mismatched timestamps, invalid quiz choices, invalid mind map edges, duplicate cards/nodes, and unsupported model-verifier findings.

Known limitations:

- Generation is synchronous in Phase 4; long lectures may need later background jobs.
- Very large transcripts are rejected safely rather than sent blindly to the model.
- Model-verifier API failures do not block artifacts when deterministic checks pass; metadata marks `verifierModelUnavailable`.
- UI labels remain English for now, while generated artifact content follows the selected language.

## Phase 5 Retrieval and Chat

When a notebook reaches `READY`, the workspace calls `POST /api/notebooks/[notebookId]/index`. If Azure Search and embeddings are configured, the app embeds `EvidenceSegment` rows, creates/updates the resolved Azure Search index, and stores only indexing metadata in PostgreSQL. Vectors live in Azure AI Search documents. In the legacy env example above, that resolved index is `lecturemind-index`.

Use `GET /api/notebooks/[notebookId]/index/status` or the workspace source card to verify indexing. A ready indexed notebook reports `chatReady: true`, `retrievalMode: "azure_hybrid"`, and a positive `indexedSegmentCount`.

If Search or embeddings are missing or fail, chat falls back to local lexical retrieval over the notebook's own `EvidenceSegment` rows. Missing Azure OpenAI chat config returns a structured `AI_NOT_CONFIGURED` response instead of a placeholder answer.

Chat flow:

```text
User question
  -> ownership-checked retrieval
  -> Azure hybrid search or local lexical fallback
  -> grounded chat prompt
  -> JSON schema parse for {"answer","citations","followUps"}
  -> deterministic citation verification
  -> one repair attempt if citation IDs are missing or unsupported
  -> safe cited fallback if repair still cannot be verified
  -> ChatMessage persistence
  -> UI answer with timestamp citation chips
```

The model may only return citation objects containing `evidenceSegmentId`. The backend attaches canonical timestamps and labels from the database. Unsupported citation IDs are rejected and never shown as source truth.

Artifact generation now supports `mode: "async"` through PostgreSQL-backed jobs and `/api/jobs/[jobId]` polling. `mode: "sync"` remains available for debugging and backward compatibility.

Production scaling path: Next.js routes should validate ownership and create `QUEUED` `Job` rows, an Azure Container Apps worker should poll those jobs, run the existing processors for ingestion/artifacts/indexing, and the UI should keep polling job/status endpoints. The current local path processes jobs inline or route-triggered for fast development feedback, but the processor boundary is already separated.

## Phase 6 Workspace Rewiring

Phase 6 restores the active workspace around the intended Azure backed pipeline:

```text
YouTube link
  -> Notebook PENDING
  -> workspace starts ingestion
  -> transcript evidence stored
  -> INDEX_EVIDENCE enqueued automatically
  -> Azure Search batches uploaded when configured
  -> chat and artifacts use shared retrieval
  -> local lexical fallback only when indexing is pending or unavailable
```

Workspace changes:

- The active chat workspace now checks indexing status and starts indexing when a ready notebook still needs it.
- YouTube ingestion now enqueues `INDEX_EVIDENCE` after transcript segments are stored.
- Chat retrieval logs the selected retrieval source and uses Azure hybrid retrieval when indexed evidence exists.
- Artifact generation now uses the same retrieval service as chat instead of bypassing Azure with raw transcript compilation.
- Summary shows the two persisted variants that exist in the schema: `90 seconds` maps to `SUMMARY_SHORT`, and `5 minutes` maps to `SUMMARY_MEDIUM`.
- The unsupported `Full` tab was removed because there is no `SUMMARY_FULL` or `SUMMARY_LONG` artifact type in the current schema.
- Citation chips in chat and artifacts seek the embedded YouTube player and resume playback.
- Flashcards keep long multilingual content inside the card.
- Artifact loading keeps staged status text without the horizontal progress bar.
- The left rail `+` opens the New Chat modal on the dashboard.
- The workspace profile menu links to Dashboard and Sign out.

Safe logs added in this phase include notebook creation, transcript readiness, indexing enqueue/start, Azure Search index readiness, upload batches, upload completion, retrieval source selection, chat retrieval, artifact retrieval, and summary variant generation/fetch events. Logs do not include secrets, raw transcripts, tokens, or user email.

## Phase 7 Faculty Review Workspace

Phase 7 adds a Faculty-only path that is isolated from Student notebooks and data. Faculty sessions are short-lived, heartbeat-managed, and backed by a separate Faculty workspace record, Faculty upload records, Faculty artifacts, Azure Search namespace, and Blob Storage container.

Faculty flow:

```text
Faculty dashboard
  -> create Faculty session with YouTube lecture URL
  -> ingest transcript evidence into FacultyWorkspace
  -> index Faculty segments in the Faculty Azure Search index
  -> open workspace with embedded lecture video, transcript, chat, and report cards
  -> generate Improvement or Bias report from retrieved lecture evidence
  -> upload PDF/DOCX for Accessibility remediation
  -> Mistral OCR extracts document structure
  -> Azure OpenAI remediation produces accessible structure
  -> generated DOCX is stored and downloaded from Faculty artifact storage
```

Report generation uses Azure OpenAI JSON schema structured outputs when the deployment supports `response_format: { type: "json_schema" }`. If an Azure deployment rejects JSON schema mode, Faculty reports fall back to `json_object` with strict JSON-only prompt instructions. Before validation, model output is sanitized by removing markdown fences, trimming whitespace, and slicing to the first JSON object envelope. A one-pass retry repairs malformed report output before returning a safe failure.

Faculty report errors log `parseStage`, `rawModelOutputFirst500Chars`, and `rawModelOutputLast200Chars` so schema drift can be diagnosed without exposing raw model text in the UI. Successful report calls also log a short raw-output preview for observability.

The Faculty workspace status poller is activity-aware:

- Ingestion, indexing, report generation, and accessibility upload/remediation poll every 1 second.
- Idle ready or failed workspaces poll every 30 seconds.
- Faculty heartbeat remains a separate 30-second interval.

`GET /api/faculty/health` checks real reachability for Mistral OCR, the primary Faculty model, embeddings, Faculty Azure Search index, and the Faculty Blob Storage container.

## Transcript Limitations

- Node ingestion still only uses available YouTube captions or auto-captions.
- Azure Speech fallback only runs through the Python worker when captions are unavailable.
- It does not require or request YouTube OAuth.
- Videos over 3 hours are rejected for this build.
- Some public videos may still fail if captions are disabled, delayed, blocked, or temporarily rate-limited.
- Azure Speech requires `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, and ffmpeg.

## Manual Test Checklist

- Valid `youtube.com/watch?v=...` URL creates a notebook and reaches `READY`.
- Valid `youtu.be/...` URL creates a notebook and reaches `READY`.
- URL with `t=` or `&list=` is accepted and normalized.
- Invalid non-YouTube URL is rejected.
- Private or unavailable video renders a safe failure card.
- Public video with no captions renders the no-transcript card.
- Public no-caption video tries the worker in `hybrid` mode.
- With Azure Speech unset, no-caption fallback fails safely with a transcription setup message.
- With Azure Speech configured, ASR segments are stored with `sourceType=ASR`.
- Stopping the worker returns `WORKER_UNAVAILABLE` safely when the Node caption path cannot finish.
- Reloading a ready workspace does not duplicate `EvidenceSegment` rows.
- Retry after `FAILED` does not duplicate `EvidenceSegment` rows.
- Clicking transcript timestamps seeks the embedded player.
- Generate Structured Outline and confirm citation chips seek the video.
- Generate both Summary tabs and confirm no raw JSON is shown.
- Generate Study Guide, Flashcards, Quiz, and Mind Map.
- Switch default language to Spanish or Telugu and generate one artifact.
- Temporarily remove Azure OpenAI env vars and confirm the safe not-configured Studio card.
- Refresh a generated notebook and confirm artifacts persist.
- Ask a chat question and confirm the answer has citation chips.
- Click a chat citation and confirm the video seeks.
- Temporarily remove Azure AI Search env vars and confirm chat shows local retrieval fallback.
- Temporarily remove Azure OpenAI chat env vars and confirm chat returns a safe not-configured error.
- Create a Faculty session from a YouTube lecture and confirm the Faculty workspace reaches `ready`.
- Confirm the Faculty lecture video embed renders above the transcript.
- Generate Improvement and Bias reports and confirm structured sections/dimensions render without raw JSON text.
- Upload a small PDF or DOCX to the Faculty Accessibility card and confirm the accessible DOCX downloads.
- Confirm the Accessibility card shows the static "Powered by Mistral OCR" chip only on that card.
- Confirm `/api/faculty/health` returns booleans for every Faculty dependency.

More implementation details live in [docs/phase-2-youtube-ingestion.md](docs/phase-2-youtube-ingestion.md), [docs/phase-3-worker-asr-fallback.md](docs/phase-3-worker-asr-fallback.md), [docs/phase-4-ai-artifact-generation.md](docs/phase-4-ai-artifact-generation.md), [docs/phase-5-retrieval-chat.md](docs/phase-5-retrieval-chat.md), [docs/phase-6-workspace-rewiring.md](docs/phase-6-workspace-rewiring.md), and [docs/phase-7-faculty-workspace.md](docs/phase-7-faculty-workspace.md).

## Auth Troubleshooting

If Google sign-in redirects back with `error=Callback` and the terminal shows `DATABASE_URL resolved to an empty string`, OAuth is not the failing part. NextAuth received the Google callback and then failed while Prisma tried to read or create the user.

Fix it by setting a real PostgreSQL URL in `.env`, restarting `npm run dev`, and running:

```bash
npm run check-env
npm run prisma:migrate
```

For local PostgreSQL, the URL usually looks like:

```bash
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/lecturemind_ai?schema=public"
```

In Google Cloud Console, make sure the OAuth client has this authorized redirect URI:

```bash
http://localhost:3000/api/auth/callback/google
```

If your OAuth consent screen is in Testing mode, your Google account must be listed under test users.

## Verification

```bash
npm run check-env
node scripts/check-search-env.mjs
npm run lint
npm run typecheck
npm run test:retrieval
npm run test:chat
npm run build
```

## What Is Ready

- Landing page with Google sign-in CTA and light/dark support
- Auth.js Google sign-in persisted through Prisma
- Protected dashboard and notebook routes
- Notebook creation with Zod YouTube URL validation
- Server-side YouTube URL parser for watch, short, live, and `youtu.be` links
- Server-side metadata and caption ingestion with typed errors
- Hybrid ingestion engine with Python worker fallback
- yt-dlp caption/subtitle extraction in the worker
- ffmpeg-based audio preparation for ASR fallback
- Azure Speech abstraction for no-caption videos
- `EvidenceSegment` storage for timestamped transcript grounding
- Evidence source labels for captions, auto-captions, and Azure Speech
- Idempotent processing/status/evidence API routes
- Retry button for retryable ingestion failures
- Embedded YouTube player with timestamp seeking
- Source pane with video metadata, status, and segment count
- Transcript timeline with timestamp chips
- Polished failure cards for expected ingestion errors
- Responsive workspace with collapsible source and Studio panes
- Mobile workspace tabs
- Real Studio artifact generation for outline, summaries, study guide, flashcards, quiz, and mind map
- Citation-backed artifact renderers with timestamp seeking
- Bilingual artifact storage by selected language
- Verifier-backed schema and citation checks
- Source-grounded chat API and UI with verified citations
- Citation chips in chat seek the YouTube player
- Azure AI Search indexing path for evidence segments
- Automatic evidence indexing after YouTube ingestion when Azure Search is configured
- Shared retrieval path for chat and study artifacts
- Local lexical retrieval fallback when Search or embeddings are missing
- PostgreSQL-backed jobs for async artifact generation and indexing
- Rewired workspace shell with artifact dock, side panel, video seek citations, New Chat shortcut, and profile menu
- Configure Chat modal that saves user preferences
- Faculty dashboard and short-lived Faculty session lifecycle
- Faculty lecture ingestion, transcript display, embedded YouTube preview, and isolated Faculty indexing
- Faculty chat grounded only in the active Faculty session evidence
- Faculty Improvement and Bias reports with structured-output schema validation, sanitization, retry, and safe UI errors
- Faculty Accessibility remediation with Mistral OCR and generated accessible DOCX downloads
- Faculty dependency health endpoint with reachability checks
- Activity-aware Faculty workspace polling with reduced idle status noise

## Later Phases

- Advanced dynamic mind map interactions
- Audio overview
- Video overview
- Slide deck generation
- Canvas LMS integration
- Advanced faculty analytics
- Provost workflows
