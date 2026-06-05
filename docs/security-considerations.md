# Security Considerations

This document describes the security model of LectureMind-AI, the risks that come from processing user-provided lecture content and uploaded academic documents, and the mitigations that are in place or planned. It is honest about the project's early-stage status: some mitigations are implemented today, others are on the [security roadmap](../ROADMAP.md#security-roadmap).

To report a vulnerability, see [SECURITY.md](../SECURITY.md). Do not open public issues for security problems.

## Threat surface at a glance

| Area | Status | Notes |
| --- | --- | --- |
| Secrets / API keys | Implemented | Server-side only; `.env` gitignored; `DEBUG_AI` gates verbose logs |
| Ownership-scoped retrieval | Implemented | Notebook queries filter by `userId`; faculty sessions isolated |
| AI output validation | Implemented | Zod schemas + deterministic citation verifier |
| File upload (faculty) | Partial | Isolated per-session storage; stricter validation planned |
| Prompt injection | Partial | Grounding + verification reduce blast radius; tests planned |
| Dependency scanning | Planned | `npm audit` / Dependabot in CI |
| Secret scanning in CI | Planned | Guard against accidental credential commits |

## File upload security

The faculty accessibility flow accepts PDF/DOCX uploads, runs OCR (Mistral), and generates a remediated DOCX.

- **Today:** uploads are scoped to a short-lived faculty session and stored in a dedicated blob container separate from student data. Sessions are heartbeat-managed and swept after expiry.
- **Planned:** strict file-type and size validation, content-type verification (not trusting the filename), and treating extracted document text as untrusted input to the model. See the roadmap item *File upload validation*.

## Prompt injection risks

Transcripts and uploaded documents are untrusted text that is fed to a language model. Malicious content could attempt to make the model ignore instructions, leak system prompts, or emit unsafe output.

- **Mitigation in place:** outputs are constrained by strict schemas and a deterministic citation verifier. Chat answers must cite real evidence IDs; unsupported citations are rejected and never shown as source truth. This limits the usefulness of an injection that tries to fabricate facts.
- **Planned:** dedicated prompt-injection regression tests with adversarial transcript/document fixtures, and model-output safety checks for injected links/markup.

## API key handling

- All model and service credentials are read server-side via the config layer (`lib/config`). The browser never receives model credentials and never calls the model directly.
- The frontend talks only to the app's own API routes; those routes own validation and the model calls.

## Secrets management

- `.env` is gitignored; `.env.example` contains placeholders only and is never read at runtime.
- Contributors must never commit secrets. In deployment, use the platform's secret manager.
- Sensitive endpoints (e.g., the faculty cleanup sweep) are gated by a shared secret in production.

## Dependency scanning

- **Today:** dependencies are managed via npm with a committed lockfile.
- **Planned:** `npm audit` and/or Dependabot wired into CI to flag known-vulnerable packages, plus a policy for prompt review of dependency bumps.

## Data retention

- Faculty sessions are short-lived and cleaned up by a sweep; associated workspace, uploads, and artifacts are designed to be transient.
- Student notebooks and evidence persist in PostgreSQL for the owning user. A documented data-retention/deletion policy and user-facing deletion controls are areas for hardening.

## Logging risks

- Logs are designed to exclude secrets, raw transcripts, tokens, and user email by default.
- Verbose AI logging is gated behind `DEBUG_AI`, which is intended to stay **off** in shared and production environments.
- Faculty report parse errors log only bounded, truncated previews of model output for debugging — not full content in the UI.

## User content privacy

- Retrieval is ownership-scoped: transcript text is never returned for a notebook the requesting user does not own, and Azure Search queries are filtered by `notebookId` and `userId`.
- Faculty data is isolated from student data at the workspace, search-namespace, and storage-container level.

## Model output reliability

- Generated artifacts and chat answers are validated against strict schemas, then passed through a deterministic citation verifier and an optional model verifier.
- Unverifiable output gets one repair attempt and is then safely rejected rather than shown. This reduces (but does not eliminate) the risk of hallucinated or ungrounded claims reaching the user.

## Planned mitigations (summary)

- Secret scanning and dependency scanning in CI.
- Strict file-upload validation and content sanitization.
- Prompt-injection and model-output safety test suites.
- Documented data-retention and deletion controls.

These are tracked in the [security roadmap](../ROADMAP.md#security-roadmap). Contributions in any of these areas are especially welcome.
