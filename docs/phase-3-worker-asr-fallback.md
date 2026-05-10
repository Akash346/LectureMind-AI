# Phase 3 Worker ASR Fallback

Phase 3 makes ingestion more resilient without replacing the working Phase 2 path. The Node caption pipeline remains the fastest path for captioned YouTube videos. The Python worker is an advanced fallback layer for yt-dlp captions/subtitles and Azure Speech transcription.

## Architecture

```text
Next.js frontend/workspace
  -> Next.js API routes
  -> local queue abstraction
  -> processNotebookVideo
     -> Node caption ingestion first in hybrid mode
     -> Python FastAPI worker when fallback is useful
        -> yt-dlp metadata/caption/subtitle extraction
        -> ffmpeg audio preparation
        -> Azure Speech fallback if no captions are usable
     -> normalized transcript segments
     -> PostgreSQL EvidenceSegment rows
  -> workspace status polling
```

Local services:

- Next.js: `http://localhost:3000`
- Worker: `http://localhost:8000`

The worker is designed so it can later move to Azure Container Apps behind private networking and `WORKER_SHARED_SECRET`.

## Local Setup

Next.js:

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

Python worker:

```bash
cd worker
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Health check:

```bash
curl http://localhost:8000/health
```

Expected:

```json
{
  "ok": true,
  "service": "lecturemind-worker",
  "version": "phase-3"
}
```

Install `ffmpeg` and keep it on `PATH` before testing Azure Speech fallback. If ffmpeg is missing, the worker returns `AUDIO_EXTRACTION_FAILED` with safe user copy.

## Environment

```bash
PYTHON_WORKER_URL=http://localhost:8000
INGESTION_ENGINE=hybrid
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=
AZURE_SPEECH_LANGUAGE=en-US
MAX_VIDEO_DURATION_SECONDS=10800
ENABLE_AZURE_SPEECH_FALLBACK=true
ENABLE_YTDLP_WORKER=true
INGESTION_RETRY_LIMIT=2
WORKER_SHARED_SECRET=
```

Engines:

- `node`: Phase 2 Node captions only.
- `worker`: Python worker only.
- `hybrid`: Node captions first, Python worker fallback.

## Worker API Contract

### `GET /health`

```json
{
  "ok": true,
  "service": "lecturemind-worker",
  "version": "phase-3"
}
```

### `POST /process-youtube`

Request:

```json
{
  "notebookId": "string",
  "videoUrl": "https://www.youtube.com/watch?v=...",
  "videoId": "string",
  "preferredLanguage": "en",
  "allowAsrFallback": true,
  "maxDurationSeconds": 10800
}
```

Success:

```json
{
  "status": "READY",
  "metadata": {
    "videoId": "...",
    "title": "...",
    "author": "...",
    "thumbnailUrl": "...",
    "durationSec": 1234,
    "isLive": false,
    "normalizedUrl": "https://www.youtube.com/watch?v=..."
  },
  "segments": [
    {
      "startSec": 0,
      "endSec": 5.2,
      "text": "Grounded transcript text.",
      "sourceType": "CAPTION",
      "confidence": 1,
      "language": "en",
      "extractionEngine": "yt-dlp-caption",
      "rawSource": "manual-caption"
    }
  ],
  "diagnostics": {
    "engine": "yt-dlp",
    "captionTrackFound": true,
    "asrUsed": false,
    "segmentCount": 1
  }
}
```

Failure:

```json
{
  "status": "FAILED",
  "error": {
    "type": "TRANSCRIPTION_FAILED",
    "userTitle": "Speech transcription failed.",
    "userMessage": "The video did not provide captions, and audio transcription could not complete.",
    "retryable": true
  },
  "diagnostics": {
    "engine": "yt-dlp",
    "asrUsed": true
  }
}
```

## Failure Taxonomy

| Type | Meaning |
| --- | --- |
| `PRIVATE_VIDEO` | Video is private. |
| `LIVE_STREAM_ACTIVE` | Live or upcoming stream is not ready for transcript ingestion. |
| `AGE_RESTRICTED` | YouTube requires sign-in or age verification. |
| `REGION_BLOCKED` | Video is blocked in this region. |
| `NO_CAPTIONS` | No usable manual or automatic caption track was found. |
| `TRANSCRIPT_UNAVAILABLE` | Captions were detected but could not be fetched or normalized. |
| `AUDIO_EXTRACTION_FAILED` | yt-dlp or ffmpeg could not prepare audio. |
| `TRANSCRIPTION_FAILED` | Azure Speech was unavailable, unconfigured, timed out, or returned no text. |
| `UNSUPPORTED_URL` | The URL is not a supported YouTube video URL. |
| `VIDEO_TOO_LONG` | Duration exceeded `MAX_VIDEO_DURATION_SECONDS`. |
| `RATE_LIMITED` | YouTube asked the app or worker to slow down. |
| `NETWORK_ERROR` | YouTube could not be reached. |
| `WORKER_UNAVAILABLE` | Worker was unreachable or returned an invalid payload. |
| `UNKNOWN` | A safe catch-all for unexpected failures. |

## Testing Checklist

- Worker health: `GET http://localhost:8000/health` returns ok.
- Caption success: a public captioned YouTube URL reaches `READY`.
- Caption success: evidence segments are created with `extractionEngine=node-transcript` in the Node path.
- Timestamp seek: transcript timestamp chips seek the embedded player.
- Worker fallback: set `INGESTION_ENGINE=worker` and process a captioned public video.
- No-caption fallback: process a no-caption video with Azure Speech unset; it fails safely.
- ASR fallback: configure Azure Speech and process a no-caption video; segments use `sourceType=ASR`.
- Invalid URL: notebook creation or processing fails safely.
- Private or unavailable URL: failure card is user-safe when detected.
- Active livestream: failure card is user-safe when detected.
- Long video: videos over the configured max duration fail safely.
- Worker stopped: hybrid still succeeds for Node-caption videos; no-caption fallback returns `WORKER_UNAVAILABLE`.
- Reload: reloading a `READY` notebook does not duplicate evidence rows.
- Retry: retry after `FAILED` does not duplicate evidence rows.
- Security: notebook APIs require an authenticated session and verify ownership.

## Deployment Path

Phase 3 runs the worker locally for development. A production deployment should:

- Build the worker into a container.
- Deploy it to Azure Container Apps or a private app service.
- Restrict network access to the Next.js backend.
- Set `WORKER_SHARED_SECRET`.
- Keep Azure Speech keys in managed app secrets.
- Add a durable queue before long-running transcription workloads.

## What Remains For Phase 4

- AI summaries.
- Study guides.
- Flashcards.
- Quizzes.
- Mind maps.
- Embeddings.
- Azure AI Search indexing.
- Source-grounded chat with citations.
