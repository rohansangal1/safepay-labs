# CLAUDE.md — agent knowledge base

Read this first. It orients any Claude Code session (new chat, another machine, or the cloud loop)
so work can continue without re-deriving context. It is committed, so it travels with the repo.
The working plan lives in [docs/PLAN.md](docs/PLAN.md); the roadmap is [site/data/milestones.json](site/data/milestones.json).

## What this project is
The project's name is **SafePay Labs**, in the UI and in the docs. Only machine identifiers keep the old
name: the GitHub repo and Vercel project (`payment-integration-lab`), the npm and Python package names,
and the `pil_session` cookie.

Research on **payment-integration security**. It measures whether payment integrations resist
forged, replayed, reordered and mismatched provider events, using:
- **PIAS** — an evidence-aware assurance score (`packages/core`), with a `[lower, upper]` range,
  coverage, and a critical-control gate. Spec: [docs/METRIC.md](docs/METRIC.md).
- a **harm oracle** that measures money/state outcomes (underpayment, double fulfillment,
  cross-account, lost order, inconsistent refund), kept separate from the score ([ADR 002](docs/decisions/002-harm-oracle.md)).
- an owned **reference checkout** (`lab/`) on `node:sqlite` with a transactional fulfillment outbox,
  plus seeded defects that calibrate the checks.

### Research direction ([ADR 007](docs/decisions/007-rescope-architectures-and-testing-tool.md), accepted 2026-10-03)
The headline question: **which architectures and security layers prevent money-level payment
harm.** Primary subject = owned **architecture variants**, plus open-source shops run locally.
- **Coding agents:** evidence comes mostly from a literature review (`data/library.json`), not from
  running a large agent benchmark; the output is integration guidance for developers and their agents.
- **Isolation:** one sealed, disposable container per subject, driven from outside by the TypeScript
  checks through `SubjectAdapter`. Python is for orchestration, analysis and later ML; the harness is
  not rewritten in Python.
- **Portal:** stores and shows runs. Runs start locally or in CI and send evidence records to it; the
  hosted portal never launches attacks.
- **After the research:** an open-source tool for end-to-end payment testing without real card data.
- **ML:** wanted, undefined; build nothing for it until a concrete use is written down.

## Safety boundary (hard rule)
Everything runs against **software we own or open-source software we run locally** with our own
sandbox keys. **Never** scan, probe, or test live systems we don't own or hold written
authorization for. Findings in open-source software go through coordinated disclosure. The CLI/
harness will enforce a scope gate (loopback or signed scope file only; refuses live-mode keys).
Full rules: [docs/SAFETY.md](docs/SAFETY.md), [SECURITY.md](SECURITY.md).

## Working agreements (how agents should work here)
- **Branch per change.** Before creating a branch, `git fetch origin` and base it on the
  up-to-date remote (usually `origin/main`) — PRs are merged constantly, so local refs go stale.
- **The human runs all commits, pushes and merges.** An interactive agent proposes the exact
  `git add`/`commit`/`push` steps and a commit message; it does not commit. The cloud loop works on
  its own branch and opens a PR — never pushes to `main`.
- **Commit messages:** Conventional Commits with a scope tag — `feat(analysis): …`,
  `fix(lab): …`, `feat(ui): …`, `docs(research): …`. Scopes: `ui` (site), `analysis` (Python),
  `lab` (measurement core/harness), `research` (protocol/metric/data), `ci`, `infra`.
- **`packages/` has zero runtime dependencies** (auditable engine/checks/CLI). `lab/` may add
  pinned deps. See [ADR 003](docs/decisions/003-dependencies-and-layout.md).
- **Generated files are committed and must be current:** `data/runs/*.json`, `site/score.js`,
  `site/data/*`. Regenerate with `npm run assess && npm run build:site`; `npm run check:generated`
  enforces it.
- **Metric changes are versioned** and need an ADR + a metric-version bump ([CONTRIBUTING.md](CONTRIBUTING.md)).
- **Every new check needs a failing case** on a subject lacking the control, and must pass on the reference.
- **Never commit** real card data, live keys, raw HAR files or unredacted traces.
- **Nothing from the portal goes in `public/`.** Research data and results stay under `site/`; the
  landing page shows no roadmap or results at all. Researcher passwords and `DATABASE_URL` never
  enter the repo.

## Layout
- `packages/core` — PIAS engine (TypeScript, zero deps), control catalog, tests.
- `lab/` — reference checkout, fake provider/signature emulator, assessment harness, seeded defects.
- `scripts/` — `build-site.ts`, the daily library updater (`update-library.ts`, `library.ts`).
- `analysis/` — Python (uv, 3.12): reads `data/runs/` and `data/library.json`; PIAS run loaders,
  cluster bootstrap, and library exploratory analysis. Reads only; never writes into `data/`.
- `public/` — public landing page (static; idea and mission; cream and black theme, Instrument Serif headings over Inter). No results and
  no roadmap. Fonts and icons are vendored (illustrations are canvas line art in `public/scenes.js`) with sources in `public/assets/SOURCES.md`; the
  CSP in `vercel.json` blocks inline styles/scripts and every other origin.
- `site/` — researcher portal (built from `packages/core` + `data/`), in the landing page's theme
  without its motion; the sign-in page (`portal/signin.html`) and admin page (`portal/admin.py`) share
  it and load fonts from the public `/assets/`. **Not public**: served only
  through `api/portal.py` at `/devs/`, after sign-in (form + 90-day session cookie) ([ADR 008](docs/decisions/008-public-landing-and-researcher-portal.md)).
- `portal/` + `api/portal.py` — Python access layer (FastAPI, argon2-cffi, psycopg; root
  `pyproject.toml`/`uv.lock`): the gate, the admin page (`/devs/admin`), the researcher and session store (Neon Postgres) and the
  account CLI. Account changes go through `portal/accounts.py` so page and CLI stay identical.
- `data/` — `runs/` (assessment outputs), `library.json` (knowledge base), `library-queries.json`.
- `docs/` — research plan, metric, safety, literature, dataset/tools, and `decisions/` (ADRs).

## Commands
```sh
# Node (TypeScript, run directly via type stripping; Node 24, see .nvmrc)
npm ci
npm test                 # engine, lab and script tests
npm run typecheck
npm run assess           # reference checkout → data/runs/lab-reference.json
npm run evidence         # same run with commit and timestamps → data/evidence/*.jsonl (git-ignored)
npm run build:site       # regenerate site/ from source + data
npm run site             # build + serve landing (/) and portal (/devs/) at http://127.0.0.1:4173
npm run researcher -- list   # terminal fallback for portal accounts; admins normally use /devs/admin (docs/PORTAL_ACCESS.md)
npm run test:portal      # ruff + pytest for portal/ and api/
npm run library:update   # daily related-work search (also in CI)
npm run library:abstracts # backfill arXiv abstracts into data/library.json

# Python analysis (uv)
cd analysis
uv sync --locked
uv run ruff check
uv run pytest
uv run python -m piaslab.library_report   # → analysis/reports/library/ (git-ignored)
```

## Current state (update this as work lands)
- **Phase 0 done and on `main`:** TS restructure, CI, reference checkout (sqlite + outbox),
  static site, daily library job.
- **On `main`:** Python analysis env (loaders, cluster bootstrap), library exploratory analysis.
- **On branch `feat/public-landing-researcher-portal`:** public landing page + researcher-only portal
  (ADR 008). Before it works in production: accept Neon's marketplace terms and provision the
  database, run `npm run researcher -- init`, and open production in Deployment Protection.
- **In flight:** arXiv abstract backfill (`feat/library-abstracts`); Phase 1 SubjectAdapter
  (`phase-1-subject-adapter`); a Dependabot pytest bump (widen the `pytest<9` pin in
  `analysis/pyproject.toml` to accept it).
- **On branch `feat/evidence-records`:** evidence schema v1 ([ADR 009](docs/decisions/009-evidence-schema-v1.md),
  `packages/checks/src/evidence.ts`); ADR 007 accepted, with the research plan, roadmap and portal
  headline rewritten for it; CodeQL workflow removed.
- **Next (Phase 1):** checks for the remaining controls, harm oracle, mutation-based defects, metric
  v1 decisions. Then emulators (Phase 2), then containers, architecture variants and run ingest into
  the portal (Phase 3).

## Deployment
On **Vercel** (project `payment-integration-lab`, Node 24): `public/` is the static output, and
`/devs/*` is rewritten to the Python function `api/portal.py`, which reads researcher accounts
from Neon Postgres (`DATABASE_URL`). Production must be reachable without Vercel login so the
landing page is public; previews stay SSO-protected. Results stay private until public release per
[ADR 006](docs/decisions/006-public-site-and-publishing.md).
Connect the GitHub repo in the Vercel dashboard to get per-PR previews.
