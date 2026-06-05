# Roadmap

This roadmap describes where LectureMind-AI is today and where it is headed. Items are labeled:

- ✅ **Completed** — implemented and in the codebase.
- 🚧 **In progress** — partially implemented or actively being worked on.
- 🗓️ **Planned** — intended, not yet started.

This is a living document. Priorities may shift based on contributor interest and community feedback. Nothing here implies adoption metrics or production guarantees — it reflects project intent.

## Current status

LectureMind-AI is an **early-stage, actively developed** open-source project. The core student study pipeline (YouTube ingestion → grounded artifacts → cited chat) and a separate isolated faculty review workspace are implemented. The model layer targets Azure OpenAI today, with safe fallbacks when AI services are unconfigured.

### Already shipped (✅)

- ✅ YouTube lecture ingestion with typed, safe failure handling
- ✅ Hybrid transcript pipeline (Node captions + optional Python worker / Azure Speech ASR)
- ✅ Timestamped `EvidenceSegment` storage for grounding
- ✅ AI study artifacts: outline, 90s & 5min summaries, study guide, flashcards, quiz, mind map
- ✅ Source-grounded chat with deterministic citation verification
- ✅ Citation chips that seek the embedded video
- ✅ Bilingual artifact storage by language
- ✅ Azure AI Search hybrid retrieval with local lexical fallback
- ✅ PostgreSQL-backed jobs for async artifact generation and indexing
- ✅ Faculty review workspace: improvement & bias reports, accessibility remediation (Mistral OCR + DOCX)
- ✅ Faculty dependency health endpoint
- ✅ Vitest unit tests for faculty logic, schemas, isolation, and YouTube handling

## Near-term roadmap

- 🚧 **README and docs polish** — public-facing docs, architecture, and security write-ups.
- 🗓️ **Easier local setup** — reduce required services to get a first run; document a minimal "no-AI" path clearly.
- 🗓️ **More tests** — broaden coverage of retrieval, chat contracts, and artifact schemas.
- 🗓️ **Basic evaluation workflow** — a small harness to score summary/quiz quality and citation accuracy against sample lectures.
- 🗓️ **Demo video** — short walkthrough linked from the README.
- 🗓️ **Sample lecture datasets** — public-domain transcripts/notebooks for local testing and evaluation.

## Mid-term roadmap

- 🗓️ **Improved RAG pipeline** — better chunking, reranking, and retrieval evaluation.
- 🗓️ **PDF / transcript / pasted-notes as study inputs** — extend student input beyond YouTube (currently document parsing exists only in the faculty accessibility flow).
- 🗓️ **Flashcard generation improvements & export** — export to CSV / Anki-compatible formats.
- 🗓️ **Quiz generation improvements** — difficulty levels and question-type variety.
- 🗓️ **Classroom use cases** — shared notebooks and teacher/TA workflows.
- 🗓️ **UI improvements** — accessibility, mobile, and empty/loading/error states.
- 🗓️ **Public API support** — documented endpoints for programmatic use.

## Long-term roadmap

- 🗓️ **Plugin architecture** — pluggable ingestion sources, model providers, and exporters.
- 🗓️ **LMS integrations** — e.g., Canvas and other learning management systems.
- 🗓️ **Privacy-preserving workflows** — support for local / self-hosted models and OpenAI-compatible providers.
- 🗓️ **Multi-modal lecture support** — slides, audio overviews, and richer media.
- 🗓️ **Contributor ecosystem** — good-first-issues, documentation, and templates that make it easy to extend.

## Security roadmap

- 🗓️ **Secret scanning** in CI to catch accidentally committed credentials.
- 🗓️ **Dependency scanning** (e.g., `npm audit` / Dependabot) gated in CI.
- 🗓️ **File upload validation** — strict type/size checks and content sanitization for faculty uploads.
- 🗓️ **Prompt-injection tests** — regression tests for adversarial transcript/document content.
- 🗓️ **Model-output safety tests** — checks for unsafe links/markup and ungrounded claims.

See [docs/security-considerations.md](docs/security-considerations.md) for the threat model behind these items.

## Suggested issues for contributors

These map to roadmap items and make good standalone contributions:

- Add a sample lecture transcript dataset
- Add a demo video to the README
- Add prompt-injection test cases
- Add PDF upload validation (faculty)
- Add flashcard export to CSV
- Add quiz difficulty levels
- Add deployment documentation
- Add an evaluation suite for generated summaries
- Add a Docker setup for local development
- Curate beginner-friendly "good first issues"
