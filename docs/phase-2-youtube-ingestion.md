# Phase 2 YouTube Ingestion

Phase 2 creates the trusted evidence layer for later AI agents. It processes public YouTube videos server-side, stores every transcript segment as source evidence, and keeps user-facing failures safe and understandable.

## Flow Diagram

```text
Authenticated user
  -> create notebook with YouTube URL
  -> Notebook(status=PENDING)
  -> workspace calls POST /api/notebooks/:id/process
  -> processNotebookVideo(notebookId, userId)
     -> verify notebook ownership
     -> Job(status=RUNNING, progress=5)
     -> parse and normalize YouTube URL
     -> update Notebook(videoId, sourceUrl)
     -> fetch YouTube metadata
     -> reject active livestreams and videos over 3 hours
     -> fetch available captions/transcript
     -> normalize timestamps and text
     -> transaction:
        -> delete existing EvidenceSegment rows for notebook
        -> create EvidenceSegment rows
        -> Notebook(status=READY)
     -> Job(status=SUCCEEDED, progress=100)
  -> workspace fetches GET /api/notebooks/:id/evidence
  -> user clicks transcript timestamp
  -> iframe player seekTo(startSec)
```

Failure path:

```text
typed VideoProcessingError
  -> Notebook(status=FAILED, errorType, safe errorMessage)
  -> Job(status=FAILED, errorType, safe errorMessage)
  -> workspace renders polished failure card
```

Unknown errors are mapped to `UNKNOWN` before being stored or returned.

## Data Contracts

### Parsed YouTube URL

```ts
type ParsedYouTubeUrl = {
  videoId: string;
  normalizedUrl: string;
  startTimeSec?: number;
};
```

Supported input forms:

- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://youtube.com/shorts/VIDEO_ID`
- `https://www.youtube.com/live/VIDEO_ID`
- URLs with extra params such as `&t=` and `&list=`

### Metadata

```ts
type YouTubeMetadata = {
  videoId: string;
  title: string;
  author?: string;
  thumbnailUrl: string;
  durationSec?: number;
  isLive?: boolean;
  normalizedUrl: string;
};
```

Metadata is best-effort. If watch-page metadata cannot be read but captions can still be fetched, ingestion proceeds with fallback title and thumbnail.

### Transcript Segment

```ts
type TranscriptSegment = {
  startSec: number;
  endSec: number;
  text: string;
  sourceType: "CAPTION" | "AUTO_CAPTION";
  confidence: number;
};
```

Normalization rules:

- Collapse repeated whitespace.
- Drop empty rows.
- Compute `endSec` from caption duration, next segment start, or a short fallback.
- Merge tiny neighboring segments only when the timestamps are adjacent.
- Never create placeholder or hallucinated transcript text.

### EvidenceSegment

```prisma
model EvidenceSegment {
  id         String             @id @default(cuid())
  notebookId String
  videoId    String
  startSec   Float
  endSec     Float
  text       String             @db.Text
  sourceType EvidenceSourceType
  confidence Float              @default(1.0)
  createdAt  DateTime           @default(now())

  notebook Notebook @relation(fields: [notebookId], references: [id], onDelete: Cascade)

  @@index([notebookId, startSec])
  @@index([videoId])
}
```

Reload safety: processing deletes existing evidence rows for the notebook inside the same transaction that writes the new rows and marks the notebook `READY`, so duplicate rows are not created by reloads or retries.

## Error Taxonomy

| Type | User-facing behavior |
| --- | --- |
| `PRIVATE_VIDEO` | "This video is private." Try a public lecture URL. |
| `LIVE_STREAM_ACTIVE` | Livestreams are not supported until YouTube finishes processing captions. |
| `AGE_RESTRICTED` | The app will not ask for YouTube credentials. Choose a public lecture video. |
| `REGION_BLOCKED` | The video is unavailable in this region. |
| `NO_CAPTIONS` | No transcript is available from the Node caption path. Phase 3 hybrid mode can try the worker fallback. |
| `TRANSCRIPT_UNAVAILABLE` | Captions could not be fetched or normalized. Phase 3 hybrid mode can try the worker fallback. |
| `UNSUPPORTED_URL` | The URL is not a supported YouTube video shape. |
| `VIDEO_TOO_LONG` | Phase 2 rejects videos over 3 hours. |
| `RATE_LIMITED` | YouTube asked us to slow down. Retry later. |
| `NETWORK_ERROR` | YouTube could not be reached. Retry later. |
| `UNKNOWN` | Safe generic failure card. Technical details stay in server logs. |

## API Routes

### `POST /api/notebooks/[notebookId]/process`

- Requires Auth.js session.
- Verifies notebook ownership.
- Idempotent for `READY` and fresh `PROCESSING` notebooks.
- Runs Phase 2 processing synchronously for now.
- Returns safe status data.

### `GET /api/notebooks/[notebookId]/status`

- Requires Auth.js session.
- Verifies notebook ownership.
- Returns notebook status, latest job status/progress/currentStep, safe error fields, metadata, and segment count.

### `GET /api/notebooks/[notebookId]/evidence`

- Requires Auth.js session.
- Verifies notebook ownership.
- Returns ordered `EvidenceSegment` rows by `startSec`.

## Manual Test Checklist

- Valid YouTube watch URL reaches `READY`.
- Valid `youtu.be` URL reaches `READY`.
- URL with timestamp param parses and normalizes.
- URL with playlist param ignores playlist and processes the video ID.
- Invalid URL returns a validation error.
- Private or unavailable video writes `FAILED` and renders a safe card.
- No-caption video writes `FAILED` with no-transcript copy.
- Reloading a ready workspace does not duplicate evidence rows.
- Timestamp click seeks the embedded player.
- Dashboard and notebook deletion still work.

## Next Steps

The current implementation is intentionally swappable. It tries direct YouTube caption tracks first, then a Node transcript adapter. Phase 3 adds a local queue shim and Python worker fallback:

```text
Next.js process route
  -> local queue abstraction
  -> Python worker
     -> yt-dlp metadata/caption/audio extraction
     -> Azure Speech for missing captions
     -> normalized transcript segments
     -> EvidenceSegment rows
  -> Next.js status polling
```

Still recommended after Phase 3:

- Durable queue for long jobs.
- Language detection beyond requested caption track metadata.
- Production network protection for the worker.
- Azure AI Search indexing and retrieval in a later phase.
