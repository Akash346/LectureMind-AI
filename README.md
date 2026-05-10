# LectureMind AI

LectureMind AI is a NotebookLM-inspired lecture study workspace. Phase 3 keeps the working Phase 2 YouTube caption ingestion path and adds an advanced Python worker fallback for production-grade metadata, caption, subtitle, audio, and Azure Speech processing.

No Azure OpenAI, summaries, flashcards, quizzes, mind maps, embeddings, Azure AI Search, or generated answers run yet.

## Stack

- Next.js App Router, TypeScript, Tailwind CSS
- shadcn/ui-style components with Radix primitives
- Framer Motion for pane transitions
- Prisma ORM with PostgreSQL
- Auth.js / NextAuth Google provider
- Zod validation
- Server-side YouTube metadata and caption ingestion
- Optional FastAPI worker with yt-dlp, ffmpeg audio prep, and Azure Speech fallback
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
```

`INGESTION_ENGINE=node` uses only the Phase 2 Node caption path. `worker` uses only the Python worker. `hybrid` tries Node captions first, then calls the worker when captions are missing or temporarily unavailable.

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

More implementation details live in [docs/phase-2-youtube-ingestion.md](docs/phase-2-youtube-ingestion.md) and [docs/phase-3-worker-asr-fallback.md](docs/phase-3-worker-asr-fallback.md).

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
npm run lint
npm run typecheck
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
- Placeholder Studio cards for outline, study guide, flashcards, quiz, and mind map
- Chat placeholder that does not generate fake answers
- Configure Chat modal that saves user preferences

## Later Phases

- Azure AI Search indexing
- Embeddings and retrieval
- Source-grounded chat with citations
- Summary, study guide, flashcard, quiz, and mind map generation
- Verifier agent for grounded outputs
