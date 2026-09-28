# 006. Public site and publishing rules

- **Status:** Accepted, 2026-09-27

## Decision
`site/` becomes the public face of the project: method, results and the reference-checkout lab runs. Before it goes public:
- **Open-source findings** appear only after coordinated disclosure with the maintainers (see SECURITY.md and docs/SAFETY.md).
- **AI-agent results** always show the model ID, tool version, date, prompt and sample size, and are labeled as a snapshot.
- **Synthetic fixtures** stay clearly labeled as illustrative, or are removed.
- The repository and site stay private until the first public release is reviewed.

## Consequences
Hosting is static (e.g. Vercel) with `npm run build:site` as the build step.
