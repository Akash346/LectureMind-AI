# API Credit Use

LectureMind-AI uses language-model APIs for its core features (currently Azure OpenAI for artifact generation, chat, and embeddings; Mistral OCR for faculty document remediation). This document explains how model/API credits are — and will be — used **responsibly**, so that the cost of building and maintaining an open educational tool does not fall on students.

## What credits are used for

### Core feature testing
Validating that ingestion → retrieval → generation works end to end after changes: summaries, study guides, flashcards, quizzes, mind maps, and grounded chat.

### Summarization
Generating and regression-testing the 90-second and 5-minute summaries against sample lectures to catch quality and grounding drift.

### Quiz and flashcard generation
Exercising structured-output generation and schema validation, and (per the roadmap) testing quiz difficulty levels and flashcard export.

### Q&A evaluation
Measuring whether chat answers are correctly grounded — i.e., that citations point to real evidence and that unsupported answers are rejected.

### Prompt regression tests
Running prompt/schema changes against fixed inputs to ensure output shape and citation behavior stay stable across model and prompt updates.

### Maintainer automation
Lightweight automation that helps a single maintainer keep the project healthy: triage assistance, reproducing reported issues, and validating fixes.

### Documentation and release notes
Drafting and checking docs and release summaries so documentation keeps pace with the code.

### Demo workflows
Producing the demo content and screenshots referenced in the README and roadmap.

### Avoiding cost burden on students
The overarching goal: credits let maintainers test and improve AI workflows **without shifting per-use costs onto students**, and keep the self-hosting story affordable for clubs and institutions.

## Responsible-use principles

- **Cache where possible** — artifacts are stored by notebook, type, and language so identical work is not regenerated; retrieval reuses indexed evidence.
- **Rate limiting** — sensitive and expensive routes are guarded; the faculty workspace uses a rate-limit helper and short-lived sessions.
- **Test datasets** — evaluation runs against small, fixed sample lectures rather than large, open-ended calls.
- **Evaluate before release** — prompt/schema changes are checked against regression fixtures before merging.
- **No unnecessary API calls** — generation is gated on `READY` evidence; missing AI config fails safely instead of making blind calls; deterministic checks run before invoking the model verifier.
- **No storing sensitive data by default** — logs exclude secrets, transcripts, tokens, and email; faculty uploads are transient and isolated.

## Why this matters for an open project

A grounded, citation-verified pipeline only stays trustworthy if it is continuously evaluated as models and prompts change. API credits make that ongoing evaluation and maintenance sustainable for an open-source, student-facing tool — directly improving quality and safety for everyone who uses or self-hosts it.
