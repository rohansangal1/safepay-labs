# Contributing

Thanks for helping. This is a research project, so changes to the metric, checks or data need a little more care than usual.

## Setup
Node.js 22.13 or newer (24 recommended; see `.nvmrc`). [uv](https://docs.astral.sh/uv/) runs the local site server, the portal tools and the analysis.

```sh
npm ci
npm run typecheck
npm test
npm run check:generated   # re-runs the lab assessment and site build; fails if outputs are stale
```

Node runs the TypeScript directly (type stripping, enabled through `.npmrc`). Keep code erasable: no `enum`, `namespace` or constructor parameter properties. `npm run typecheck` enforces this.

Python analysis lives in `analysis/`, managed by [uv](https://docs.astral.sh/uv/) (Python 3.12):

```sh
cd analysis
uv sync --locked
uv run ruff check
uv run pytest
```

Python only reads `data/runs/`; it never writes there. Commit `analysis/uv.lock` with any dependency change. Notebooks are exploration only — never commit them with output cells.

## Researcher portal access
The research views are private and live at `/portal/` on the project site. There is no sign-up page: accounts are created from the terminal, and your browser asks for the email and password itself. [docs/PORTAL_ACCESS.md](docs/PORTAL_ACCESS.md) has every step: getting an account, signing in, creating accounts for others, and what to do with the password when it is printed.

To look at the portal on your own machine without an account, run `npm run site` and use the throwaway login it prints.

The portal's access code is Python in `portal/` and `api/`, with its own checks:

```sh
uv sync --locked
npm run test:portal       # ruff + pytest
```

## Ground rules
- **`packages/` has zero runtime dependencies.** The engine, checks and CLI must stay easy to audit and install. `lab/` may add pinned dependencies when a harness needs them.
- **Generated files are committed and must be current:** `data/runs/*.json`, `site/score.js`, `site/data/controls.json`, `site/data/assessments.json`, `public/data/roadmap.json`. Change the source, then run `npm run assess && npm run build:site`.
- **Metric changes are versioned.** Changing a control, weight, gate or threshold needs an ADR in `docs/decisions/` and a metric version bump. Don't compare scores across versions.
- **New checks need a failing case.** Each check must be shown to fail on a subject that lacks the control (a seeded or mutated defect), and to pass on the reference.
- **Scope and safety.** Nothing in this repo may target systems you don't own or aren't authorized to test. Read [docs/SAFETY.md](docs/SAFETY.md). Never commit real card data, live keys, raw HAR files or unredacted traces.

## Pull requests
Use the PR template. Describe which hypothesis, control or fixture changed, what evidence supports it, and confirm scope. Keep security findings about third-party software out of public issues; see [SECURITY.md](SECURITY.md).
