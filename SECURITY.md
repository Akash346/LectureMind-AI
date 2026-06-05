# Security Policy

LectureMind-AI processes user-provided lecture URLs and, in the faculty workspace, uploaded academic documents (PDF/DOCX), and it makes server-side calls to language models. Because of this, security is treated as a first-class concern even at this early stage. We appreciate responsible disclosure and the work of the security community.

## Supported versions

This is an early-stage project. Security fixes are applied to the `main` branch, which is the only actively supported version.

| Version | Supported |
| --- | --- |
| `main` (latest) | ✅ |
| Older commits / forks | ❌ |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report privately by email to the maintainer:

- **Akash Nallagonda** — **akashnallagonda9@gmail.com**

If GitHub Private Vulnerability Reporting is enabled on the repository, you may also use **Security → Report a vulnerability**.

Please include:
- A clear description of the issue and its impact.
- Steps to reproduce or a proof of concept.
- Affected files, routes, or components if known.
- Any suggested remediation.

## Responsible disclosure process

1. Report the issue privately using the contact above.
2. Allow the maintainer reasonable time to investigate and ship a fix before any public disclosure.
3. Do not exploit the issue beyond what is necessary to demonstrate it, and do not access, modify, or exfiltrate data that is not yours.
4. Once a fix is released, we will credit you in the release notes if you wish.

## Expected response timeline

As a single-maintainer, early-stage project, these are good-faith targets rather than guarantees:

- **Acknowledgement:** within 5 business days.
- **Initial assessment:** within 10 business days.
- **Fix or mitigation plan:** depends on severity and complexity; critical issues are prioritized.

## Security scope

Reports in the following areas are in scope and especially valued:

- **File upload handling** — faculty PDF/DOCX uploads, OCR processing, and generated DOCX output.
- **API key / secret exposure** — any path that could leak credentials to the client or logs.
- **Prompt injection** — content in transcripts or uploaded documents influencing the model to ignore instructions, exfiltrate data, or produce unsafe output.
- **Dependency vulnerabilities** — known-vulnerable packages with a realistic exploitation path.
- **Unsafe generated content** — model output that could be rendered or executed unsafely (e.g., injected markup/links).
- **Authentication / session risks** — NextAuth session handling, faculty session isolation, and the cleanup sweep endpoint.
- **Data leakage** — cross-user access to notebooks, evidence, or faculty session data; ownership-check bypasses.

## Out of scope

- Spam, automated low-quality reports, or mass-generated "scanner" output without a real, demonstrated impact.
- Social engineering of maintainers, contributors, or users.
- Fabricated or theoretical vulnerabilities with no proof of concept.
- Attacks requiring physical access to a user's device.
- Denial-of-service via unrealistic traffic volumes.
- Issues in third-party services (Azure, Google, Mistral) that are not caused by this project's configuration.

## Guidance for contributors

To keep the project secure, contributors should:

- **Never commit secrets.** Use `.env` locally (it is gitignored) and a secret manager in deployment.
- **Validate all inputs** with Zod, and **validate all AI output** against a schema before using it.
- **Sanitize uploaded files** — treat uploaded documents as untrusted; do not trust filenames or content.
- **Avoid logging sensitive data** — no secrets, tokens, raw transcripts, or user email in logs. Keep verbose AI logging (`DEBUG_AI`) off outside local debugging.
- **Keep model calls server-side** — never expose model credentials to the browser.
- **Pin / review dependencies** where appropriate and keep them current.
- **Run dependency checks** (e.g., `npm audit`) before submitting dependency changes.

See [docs/security-considerations.md](docs/security-considerations.md) for the detailed threat model and planned mitigations.
