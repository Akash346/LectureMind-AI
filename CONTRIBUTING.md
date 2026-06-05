# Contributing to LectureMind-AI

Thank you for your interest in contributing! LectureMind-AI is an early-stage, open-source AI study assistant, and it is built in the open precisely so that students, educators, and developers can shape it. Every kind of contribution — from a typo fix to a new retrieval strategy — is welcome and appreciated.

Please read this guide and our [Code of Conduct](CODE_OF_CONDUCT.md) before contributing.

## Types of contributions we welcome

- **Bug reports** — clear, reproducible reports via the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md).
- **Documentation** — setup steps, architecture notes, examples, and fixing anything unclear.
- **UI improvements** — accessibility, responsiveness, dark mode, and workspace polish.
- **Backend improvements** — ingestion, retrieval, job processing, and API routes.
- **Model / evaluation improvements** — prompt quality, schema design, citation verification, and evaluation harnesses.
- **Security improvements** — input validation, file-upload handling, dependency hygiene, and prompt-injection defenses.
- **Tests** — unit tests, contract tests, and regression tests for prompts and outputs.
- **Examples and templates** — sample lectures, sample notebooks, and reusable workflows.

## Getting set up

Local setup is documented in the [README](README.md#installation). In short:

```bash
npm install
cp .env.example .env          # fill in values; never commit real secrets
npm run check-env
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

You can explore much of the app without AI keys — AI features fail safely when unconfigured.

## Branch naming convention

Use a short, descriptive, prefixed branch name:

- `feat/flashcard-csv-export`
- `fix/youtube-shorts-url-parsing`
- `docs/architecture-diagram`
- `test/citation-verifier`
- `chore/dependency-bump`
- `security/upload-validation`

## Commit message convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(optional scope): <short summary>
```

Common types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `security`, `perf`.

Examples:
- `feat(artifacts): add quiz difficulty levels`
- `fix(chat): reject citations with unknown evidence IDs`
- `docs(readme): clarify worker setup`

Keep commits focused and write the body to explain *why*, not just *what*.

## Pull request checklist

Before opening a PR, please confirm:

- [ ] The branch is based on the latest `main`.
- [ ] The code builds locally (`npm run build`).
- [ ] Lint passes (`npm run lint`).
- [ ] Types pass (`npm run typecheck`).
- [ ] Tests pass (`npm run test`), and new behavior has tests where practical.
- [ ] Documentation is updated for any user-facing or config change.
- [ ] **No secrets, `.env` files, API keys, tokens, or transcripts are committed.**
- [ ] The PR description follows the [pull request template](.github/pull_request_template.md) and links any related issue.

## Code quality expectations

- TypeScript throughout; prefer explicit types at module boundaries.
- Validate all external input with Zod; validate all AI output against a schema before use.
- Keep model calls server-side only — never expose model credentials to the browser.
- Follow the existing module boundaries (`lib/ai`, `lib/retrieval`, `lib/search`, `lib/faculty`, …).
- Match the surrounding code's style; Prettier and ESLint config are in the repo.

## Documentation expectations

If your change affects setup, environment variables, behavior, or architecture, update the relevant doc (`README.md`, `docs/`, or `.env.example`). Examples and screenshots are very welcome.

## Testing expectations

- Add or update Vitest tests for new logic where practical (`tests/`).
- For prompt or schema changes, prefer adding a regression test that asserts on shape, not on exact wording.
- Run the local contract checks where relevant: `npm run test:retrieval`, `npm run test:chat`.

## Opening issues

Use the templates:

- [Bug report](.github/ISSUE_TEMPLATE/bug_report.md)
- [Feature request](.github/ISSUE_TEMPLATE/feature_request.md)
- [Documentation issue](.github/ISSUE_TEMPLATE/documentation.md)

A good issue is specific, reproducible, and scoped. For security issues, **do not** open a public issue — follow [SECURITY.md](SECURITY.md).

## Good first issues

If you are new, these are friendly starting points (see [ROADMAP.md](ROADMAP.md) for more):

- Improve or clarify a section of the setup docs.
- Add a test for an existing utility (e.g., YouTube URL parsing).
- Add screenshots to `docs/screenshots/` and wire them into the README.
- Add a sample lecture transcript dataset for local testing.
- Improve an empty/loading/error state in the UI.

## Maintainer review process

1. Open a PR against `main` with a clear description and linked issue.
2. CI runs lint, typecheck, and tests.
3. The maintainer (**Akash Nallagonda**) reviews for correctness, security, scope, and clarity.
4. You may be asked for changes — this is normal and collaborative.
5. Once approved and green, the PR is merged.

Reviews aim to be prompt and respectful. Small, focused PRs are reviewed fastest.

## Community behavior

Be kind, be constructive, assume good faith, and help newcomers. All participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md). Contact the maintainer at **akashnallagonda9@gmail.com** with any concerns.
