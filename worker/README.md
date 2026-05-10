# LectureMind Phase 3 Worker

This FastAPI service adds the advanced ingestion layer for Phase 3. The Next.js app can keep using its existing caption path, then call this worker when captions are missing or when `INGESTION_ENGINE=worker`.

## Local Setup

```bash
cd worker
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

Install `ffmpeg` and make sure it is available on `PATH` before testing Azure Speech fallback. Caption extraction with `yt-dlp` can work without ffmpeg, but audio fallback cannot.

## Environment

Create `worker/.env` if you want local worker-specific values:

```bash
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=
AZURE_SPEECH_LANGUAGE=en-US
MAX_VIDEO_DURATION_SECONDS=10800
ENABLE_AZURE_SPEECH_FALLBACK=true
WORKER_SHARED_SECRET=
```

If `WORKER_SHARED_SECRET` is set here, set the same value in the Next.js `.env`. The app sends it as `x-lecturemind-worker-secret`.

## Run

```bash
cd worker
.venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

Health check:

```bash
curl http://localhost:8000/health
```

Expected response:

```json
{
  "ok": true,
  "service": "lecturemind-worker",
  "version": "phase-3"
}
```

## API

`POST /process-youtube`

```json
{
  "notebookId": "notebook-id",
  "videoUrl": "https://www.youtube.com/watch?v=...",
  "videoId": "...",
  "preferredLanguage": "en",
  "allowAsrFallback": true,
  "maxDurationSeconds": 10800
}
```

The worker returns either `status: "READY"` with normalized segments or `status: "FAILED"` with a typed, user-safe error. It never returns placeholder transcript text.

## Notes

- Caption preference is English manual, selected manual, English auto, selected auto, any manual, any auto, then Azure Speech.
- Azure Speech is only used when no usable captions are found and fallback is enabled.
- If ffmpeg is missing, the worker returns `AUDIO_EXTRACTION_FAILED` with safe copy.
- If Azure Speech environment variables are missing, the worker returns `TRANSCRIPTION_FAILED` with safe copy.
- The worker is local-only in Phase 3. Do not expose it publicly without network controls and `WORKER_SHARED_SECRET`.
