# Phase 6 Workspace Rewiring

Phase 6 connects the polished workspace UI back to the Azure backed evidence pipeline. The goal is not a redesign. It is a recovery and wiring pass that makes the active chat workspace, artifact panel, video player, citations, ingestion jobs, indexing jobs, chat retrieval, and artifact retrieval behave as one system.

## Scope

- Keep the current dashboard, New Chat modal, workspace shell, video player, chat surface, artifact dock, and artifact panel design.
- Restore automatic evidence indexing after YouTube ingestion.
- Restore Azure backed retrieval for chat and artifacts when indexed evidence exists.
- Preserve local lexical fallback while indexing is pending or Azure Search is unavailable.
- Keep summary generation aligned with the current schema.
- Fix workspace interaction bugs around citations, flashcards, loading states, New Chat, and profile actions.

## Backend Rewiring

The intended workspace pipeline is:

```text
User submits YouTube URL
  -> create Notebook row with status PENDING
  -> workspace calls process route
  -> ingestion stores EvidenceSegment rows
  -> ingestion enqueues INDEX_EVIDENCE when Search and embeddings are configured
  -> index processor creates or validates Azure AI Search index
  -> index processor embeds evidence in batches
  -> index processor uploads Azure Search documents in batches
  -> EvidenceSegment rows receive indexing metadata
  -> chat and artifacts select Azure retrieval when indexed rows exist
```

The active workspace also calls `/api/notebooks/[notebookId]/index/status` after a notebook reaches `READY`. If the API reports that indexing is needed, the workspace calls `/api/notebooks/[notebookId]/index`. This covers older notebooks that already have transcript evidence but were created before automatic indexing was restored.

## Retrieval Rules

Chat and artifacts use the same retrieval order:

1. Azure hybrid search when Search is configured, embeddings are configured, and indexed evidence exists.
2. Local lexical fallback when indexing is pending, Search is not configured, embeddings are not configured, or Azure query fails safely.
3. `INSUFFICIENT_EVIDENCE` only when both Azure and local notebook evidence cannot provide usable chunks.

Artifacts no longer compile directly from raw Prisma transcript rows as the primary path. They ask `retrieveLectureContext` for grounded chunks, then compile those retrieved chunks into the evidence packet used by artifact agents and verifier checks.

## Summary Variants

The current Prisma enum has two persisted summary types:

- `SUMMARY_SHORT` for the `90 seconds` tab.
- `SUMMARY_MEDIUM` for the `5 minutes` tab.

There is no `SUMMARY_FULL` or `SUMMARY_LONG` enum in the current schema or visible history, so Phase 6 removes the empty `Full` tab instead of showing duplicate or fake content.

## Workspace UI Changes

- The active workspace shell starts ingestion, polls notebook status, polls index status, and triggers indexing when needed.
- The artifact panel renders staged loading text without the horizontal progress bar.
- The artifact dock opens the side panel and generates async artifact jobs.
- Flashcards contain long multilingual text inside the card with safe wrapping and internal scrolling.
- Timestamp citation chips seek the YouTube player and resume playback.
- The YouTube player uses a stable iframe container and keeps a safe fallback when a video cannot load.
- The left rail `+` opens the dashboard New Chat modal.
- The profile avatar opens a menu with Dashboard and Sign out.

## Observability

Phase 6 adds safe structured logs for:

- `notebook_created`
- `transcript_segments_ready`
- `index_evidence_enqueued`
- `index_evidence_started`
- `azure_search_index_ready`
- `azure_search_upload_batch`
- `azure_search_upload_complete`
- `notebook_index_status_updated`
- `retrieval_source_selected`
- `chat_retrieval`
- `artifact_retrieval`
- `artifact_generation_started`
- `artifact_generation_complete`
- `summary_variant_selected`
- `summary_variant_fetch`
- `summary_variant_generate`

These logs include IDs, counts, retrieval source, and fallback reasons. They do not include API keys, tokens, connection strings, raw transcript text, prompts, or user email.

## Verification

Run:

```bash
npm run check-env
node scripts/check-search-env.mjs
npm run lint
npm run typecheck
npm run build
```

Manual smoke checks:

- Create a chat from a YouTube URL and confirm transcript segments are stored.
- Confirm `INDEX_EVIDENCE` is enqueued after ingestion.
- Confirm Azure Search upload logs show batches and uploaded counts.
- Confirm indexed notebooks use `hybrid_search` for chat and artifacts.
- Confirm nonindexed notebooks use local fallback with `not_indexed_yet`.
- Generate `90 seconds` and `5 minutes` summaries and confirm they render separately.
- Generate outline, flashcards, quiz, study guide, and mind map.
- Click citation timestamps in chat and artifacts and confirm the player seeks.
- Confirm flashcard text stays inside the card.
- Confirm the left rail `+` opens New Chat.
- Confirm the profile menu opens Dashboard and Sign out.
