# Phase 4 AI Artifact Generation

Phase 4 adds the first real AI product layer on top of the existing `EvidenceSegment` transcript timeline. It does not replace the Phase 2/3 ingestion paths. Notebook readiness, typed ingestion failures, worker fallback, transcript rendering, and timestamp seeking remain the foundation.

## Architecture

```text
READY notebook
  -> EvidenceSegment rows
  -> Evidence Compiler Agent
  -> Artifact Agent
       Outline | Summary | Study Guide | Practice | Mind Map
  -> Zod schema validation
  -> Deterministic verifier
  -> Model verifier agent
  -> optional one-pass repair
  -> Artifact row READY or FAILED
  -> Studio renderer with citation chips
  -> existing YouTube seek handler
```

## Agent Responsibilities

- Evidence Compiler Agent: loads notebook metadata and ordered evidence rows, preserves segment IDs/timestamps/text, estimates transcript size, and groups longer lectures into time windows.
- Outline Agent: creates a structured outline with cited sections and child sections.
- Summary Agent: creates the 90-second and 5-minute summaries with citations on every bullet or section.
- Study Guide Agent: creates exam-focused concepts, details, examples, common mistakes, and review plan.
- Practice Agent: creates flashcards and quiz questions without requiring outside knowledge.
- Mind Map Agent: creates concept nodes and relationship edges from lecture evidence.
- Verifier Agent: checks schema, citation IDs, timestamp matches, language, quiz choices, mind map edges, duplicate cards/nodes, and unsupported claims.

## Schemas

Schemas live in `lib/ai/schemas.ts` and are strict Zod contracts for:

- `OUTLINE`
- `SUMMARY_SHORT`
- `SUMMARY_MEDIUM`
- `STUDY_GUIDE`
- `FLASHCARDS`
- `QUIZ`
- `MIND_MAP`

All citations use:

```json
{
  "evidenceSegmentId": "string",
  "startSec": 201,
  "endSec": 207,
  "label": "3:21"
}
```

The deterministic verifier canonicalizes citation timestamps from the source `EvidenceSegment`, then rejects IDs that do not exist or timestamps outside the source video.

## Azure OpenAI

The server-only Azure wrapper is `lib/ai/azure-openai.ts`.

Required for generation:

```bash
AZURE_OPENAI_ENDPOINT="https://YOUR-RESOURCE.openai.azure.com"
AZURE_OPENAI_API_KEY="..."
AZURE_OPENAI_DEPLOYMENT_FAST="..."
AZURE_OPENAI_DEPLOYMENT_STRONG="..."
AZURE_OPENAI_API_VERSION="2024-10-21"
DEBUG_AI=false
```

`AZURE_OPENAI_DEPLOYMENT_STRONG` is preferred for Study Guide, Quiz, Repair, and Verifier. If only one deployment is configured, the wrapper safely falls back to that deployment. If credentials are missing, the Studio card fails safely with the `AI_NOT_CONFIGURED` copy.

## Bilingual Behavior

The Studio fetches and generates artifacts by normalized language code: `en`, `es`, `hi`, `te`, `fr`, `ar`.

Artifacts are stored by `notebookId + type + language`, so generating Spanish does not overwrite English. Prompts instruct the model to translate artifact content only and preserve evidence IDs, timestamps, citations, formulas, and equations.

## Failure Safety

The orchestrator writes `GENERATING` before calling models and always ends in `READY` or `FAILED`.

Safe failure types:

- `AI_NOT_CONFIGURED`
- `MODEL_TIMEOUT`
- `MODEL_RATE_LIMITED`
- `MODEL_BAD_JSON`
- `MODEL_SCHEMA_INVALID`
- `VERIFICATION_FAILED`
- `INSUFFICIENT_EVIDENCE`
- `ARTIFACT_UNKNOWN`
- `UNKNOWN`

No stack traces, API keys, or transcript text are exposed to the client. Full transcript logging is avoided unless `DEBUG_AI=true`.

## Manual Testing Checklist

1. Create a notebook from a captioned YouTube video.
2. Confirm the notebook reaches `READY`.
3. Generate Structured Outline and confirm it renders as collapsible sections.
4. Click citation chips and confirm the video seeks.
5. Generate both Summary tabs.
6. Generate Study Guide and confirm concepts/details/review plan render.
7. Generate Flashcards, flip cards, and seek citations from the back.
8. Generate Quiz, select an answer, and confirm explanation citations.
9. Generate Mind Map and confirm nodes/edges render without raw JSON.
10. Switch the workspace language to Spanish or Telugu and generate one artifact.
11. Confirm translated content keeps citation chips working.
12. Temporarily remove Azure OpenAI env vars and confirm the safe not-configured card.
13. Try Generate All and confirm cards update sequentially.
14. Refresh the page and confirm artifacts persist.
15. Retry a failed artifact.

## Phase 5 Next Steps

- Move long-running artifact generation into background jobs.
- Add semantic retrieval and Azure AI Search.
- Add source-grounded chat.
- Add embeddings.
- Add Canvas/faculty/provost experiences after the study layer is stable.
