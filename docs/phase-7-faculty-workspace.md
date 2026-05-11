# Phase 7 Faculty Workspace

Phase 7 adds a Faculty review path beside the Student notebook workspace. Faculty data is isolated by session and workspace records, indexed into a Faculty-specific Azure AI Search index, and stored in the Faculty Blob Storage container.

## Goals

- Let faculty paste a lecture URL and review the lecture in a dedicated workspace.
- Keep Faculty sessions separate from Student notebook ownership, routes, retrieval, and artifacts.
- Generate evidence-grounded Improvement and Bias reports without showing raw model output to users.
- Upload PDF or DOCX material for Accessibility remediation powered by Mistral Document AI OCR.
- Provide operational health checks that verify service reachability, not just environment variable presence.
- Reduce idle workspace polling while preserving fast updates during active ingestion and report jobs.

## Faculty Flow

```text
Faculty dashboard
  -> POST /api/faculty/session
  -> POST /api/faculty/lecture/ingest
  -> FacultyWorkspace(status=ingesting/indexing/ready)
  -> FacultyEvidenceSegment rows
  -> Faculty Azure Search index
  -> /faculty/workspace/:sessionId
     -> embedded YouTube player
     -> transcript
     -> Faculty chat
     -> Improvement, Bias, and Accessibility cards
```

The workspace status response includes the lecture title, transcript, segment counts, artifact statuses, and `videoId` extracted server-side from supported YouTube URL shapes:

- `youtube.com/watch?v=ID`
- `youtu.be/ID`
- `youtube.com/shorts/ID`
- `youtube.com/embed/ID`

If no YouTube ID is available, the video embed renders nothing instead of a broken placeholder.

## Reports

Improvement and Bias reports use the same retrieval backbone as Faculty chat, but they run through dedicated schemas:

- `FacultyImprovementReportSchema`
- `FacultyBiasReportSchema`
- `FacultyAccessibilityRemediationSchema`

The Azure OpenAI call path prefers structured outputs:

```ts
response_format: {
  type: "json_schema",
  json_schema: {
    name: "improvement_report" | "bias_report" | "accessibility_remediation",
    schema,
    strict: true
  }
}
```

If a deployment rejects JSON schema mode, the call falls back to:

```ts
response_format: { type: "json_object" }
```

and the system prompt is reinforced with strict JSON-only instructions.

Before Zod validation, raw model output is sanitized by:

1. Removing leading or trailing markdown fences.
2. Trimming whitespace.
3. Slicing from the first `{` to the last `}`.

If validation fails, the server runs one retry with a repair instruction. If the retry still fails, the route returns a safe `503` and logs:

- `parseStage`
- `responseFormat`
- `rawModelOutputFirst500Chars`
- `rawModelOutputLast200Chars`

Successful report calls also log a short raw-output preview for future debugging. The UI never renders raw model JSON.

## Accessibility Remediation

Faculty Accessibility accepts PDF or DOCX uploads. The OCR client posts directly to `MISTRAL_OCR_ENDPOINT`, so the environment variable must contain the full Azure Foundry Mistral OCR endpoint, such as:

```text
https://<resource>.services.ai.azure.com/providers/mistral/azure/ocr
```

The app does not append the provider path itself.

OCR rules:

- Mistral OCR is only used for Faculty OCR.
- Files over the configured Mistral size limit fail safely.
- Large PDFs are chunked by page count before OCR.
- Low-confidence chunks can be retried.
- Extracted pages, tables, image notes, confidence, and raw OCR metadata are preserved for remediation.

The remediation model produces structured blocks for accessible DOCX generation: headings, paragraphs, real lists, tables, image notes, applied fixes, and human-review notes.

## Polling And Status

Faculty workspace polling is activity-aware:

| State | Interval |
| --- | --- |
| Workspace `ingesting`, `indexing`, `creating`, or `pending` | 1 second |
| Any report job is running | 1 second |
| Upload or accessibility remediation is running | 1 second |
| Workspace `ready` or `failed` with no active work | 30 seconds |
| Other transitional state | 2.5 seconds |

Heartbeat is intentionally separate and remains 30 seconds.

## Health Check

`GET /api/faculty/health` returns:

```json
{
  "ok": true,
  "mistralOcr": true,
  "primaryModel": true,
  "embeddingModel": true,
  "facultySearchIndex": true,
  "facultyStorageContainer": true,
  "timestamp": "2026-05-11T09:21:02.037Z"
}
```

Each boolean reflects a live reachability check:

- Mistral OCR endpoint accepts an authenticated request shape.
- Faculty primary model responds to a minimal JSON chat completion.
- Embedding deployment can generate an embedding.
- Faculty Azure Search index can be fetched.
- Faculty Blob Storage container can be reached.

## UI Safety

- Report generation errors are caught in the panel and shown as calm retryable messages.
- Malformed saved reports from older builds show a regenerate prompt instead of crashing the app.
- The Accessibility progress timeline marks all steps complete after DOCX/report completion and does not leave "Report ready" spinning.
- Artifact cards only animate while their server status is `running`.
- The Mistral attribution chip is static, non-clickable, and appears only on the Accessibility card.

## Verification

```bash
npx prisma generate
npm run lint
npm run typecheck
npm run build
npm test
```

Live checks:

- `/api/faculty/health` returns all service booleans.
- `/faculty/workspace/:sessionId` renders the 16:9 lecture embed above the transcript.
- Improvement and Bias reports return `200` with parsed `summary` and `sections` or `dimensions`.
- Accessibility upload runs OCR, remediation, and DOCX download.
- Idle workspace status polling slows down after active work completes.
- Student `/auth/signin` remains `200`.
- Student notebook routes remain `401` when unauthenticated.
