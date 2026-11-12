# CLAUDE.md — agent knowledge base

Read this first. It orients any Claude Code session (new chat, another machine, or the cloud loop)
so work can continue without re-deriving context. It is committed, so it travels with the repo.
The working plan lives in [docs/PLAN.md](docs/PLAN.md); the roadmap is [site/data/milestones.json](site/data/milestones.json).

## What this project is
The project's name is **SafePay Labs**, in the UI and in the docs. Only machine identifiers keep the old
name: the GitHub repo and Vercel project (`payment-integration-lab`), the npm and Python package names,
and the `pil_session` cookie.

Research on **which payment-system designs prevent money-level harm**, in two tracks:

- **Track B (first): LLM agents operating payment tools.** They use MCP tools on a Django payments
  sandbox with a double-entry ledger. B1 covers tool faults, with the API design as the treatment.
  B2 covers manipulated tool descriptions and defenses, extending Faghih et al., EMNLP 2025.
- **Track A: payment integrations under forged, replayed, reordered and mismatched provider
  events.**

Track A uses (and Track B reuses the harm-oracle approach, evidence format and portal):
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

### Amended by [ADR 011](docs/decisions/011-agent-operators-django-sandbox-synthetic-data.md) (accepted 2026-11-12): Track B first
- **Agents as operators.** Agents call payment tools at run time. Coding agents stay a literature
  review.
- **Stack for Track B:**
  - `lab/sandbox/`: Django + Postgres sandbox (ledger, intents, refunds, payouts, idempotency, fault
    layer, test-control API, admin);
  - `lab/agents/`: MCP tool server, LangChain/LangGraph runner, agent harm oracle;
  - `lab/synth/`: seeded generator of worlds, tasks with expected ledger end states, fault schedules
    and tool manifests;
  - `lab/docker/`: a fresh compose stack per run.

  These form one uv workspace, with dependencies pinned in `uv.lock`.
- **Ledger rules:** integer minor units, never floats; immutable journal entries that sum to zero;
  cached balances updated in the same transaction under `select_for_update()`; a drift check.
- **Agent harms** (from the ledger vs the expected end state): duplicate payment, wrong amount,
  wrong payee, unauthorized action, lost payment, false report. Never an LLM judge.
- **Order of work:** Track B (B1 pilot by about week 7), then Track A at reduced scope: browser
  harness parked, 1–2 open-source shops.
- **Synthetic data only;** model API keys are the only secrets, with spend caps.

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
- **Generated files are committed and must be current:** `data/runs/*.json`, `data/harm/*.json`,
  `site/score.js`, `site/data/*`. Regenerate with `npm run assess && npm run harm && npm run build:site`; `npm run check:generated`
  enforces it.
- **Metric changes are versioned** and need an ADR + a metric-version bump ([CONTRIBUTING.md](CONTRIBUTING.md)).
- **Every new check needs a failing case** on a subject lacking the control, and must pass on the reference.
- **Never commit** real card data, live keys, model API keys, raw HAR files, unredacted traces or
  raw agent transcripts.
- **Agent runs cost money.** Only a human starts paid model runs. The cloud loop and interactive
  agents build and test with a scripted or mock model, never a paid API.
- **Nothing from the portal goes in `public/`.** Research data and results stay under `site/`; the
  landing page shows no roadmap or results at all. Researcher passwords and `DATABASE_URL` never
  enter the repo.

## Layout
- `packages/core` — PIAS engine (TypeScript, zero deps), control catalog, tests.
- `packages/oracle` — harm oracle (zero deps): end-to-end scenarios judged from the provider ledger
  and fulfillment records. Shares only `SubjectAdapter` with the checks; never feeds the score.
- `lab/` — reference checkout, fake provider/signature emulator, assessment harness, seeded defects.
  Planned for Track B (ADR 011): `lab/sandbox` (Django), `lab/agents` (MCP tools, runner, agent harm
  oracle), `lab/synth` (generator) and `lab/docker` (compose). These form one uv workspace.
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
- `data/` — `runs/` (assessment outputs), `harm/` (harm-oracle outputs), `library.json` (knowledge base), `library-queries.json`.
- `docs/` — research plan, metric, safety, literature, dataset/tools, and `decisions/` (ADRs).

## Commands
```sh
# Node (TypeScript, run directly via type stripping; Node 24, see .nvmrc)
npm ci
npm test                 # engine, lab and script tests
npm run typecheck
npm run assess           # reference checkout → data/runs/lab-reference.json
npm run evidence         # same run with commit and timestamps → data/evidence/*.jsonl (git-ignored)
npm run harm             # harm oracle on the reference checkout → data/harm/lab-reference.json
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
- **On `main` (Phases 0–1):** TS restructure, CI, reference checkout (sqlite + outbox), daily
  library job with arXiv abstracts, Python analysis env (loaders, cluster bootstrap, library
  analysis), `SubjectAdapter`, evidence schema v1 ([ADR 009](docs/decisions/009-evidence-schema-v1.md)).
- **On `main` (checks):** 30 checks across 11 controls, 17 seeded defects, coverage 95 (PRs #17,
  #18). The reference checkout handles full refunds, reconciles dropped events, writes a log and an
  `audit` table. `SubjectAdapter` has optional `faults`, `artifacts` and `ledger`; evidence schema
  1.1 adds two oracles ([ADR 010](docs/decisions/010-evidence-schema-1-1-artifact-oracles.md)).
  Milestone 7 is done apart from browser integrity (parked with the browser harness).
- **On `main` (PR #19):** harm oracle (`packages/oracle`, 12 scenarios, `npm run harm`). Harm
  results are not in the portal or the Python loaders yet.
- **On `main` (PR #24):** ADR 011 (accepted 2026-11-12) adds Track B and runs it first; PLAN,
  RESEARCH_PLAN (draft 0.4), roadmap (milestones 27–38), SAFETY, LITERATURE and DATA_AND_TOOLS
  follow it.
- **On `main` (PR #25 and earlier):** public landing page (SafePay Labs, mission refresh) and the
  researcher-only portal ([ADR 008](docs/decisions/008-public-landing-and-researcher-portal.md)).
  Before the portal works in production: provision Neon, run `npm run researcher -- init`, and open
  production in Deployment Protection.
- **In flight:** reading notes and reproduction of Faghih et al. (milestone 31, `docs/reading/`);
  Google sign-in for the portal (`feat/portal-google-signin`).
- **Next (Phase 2, Track B):**
  - the Docker stack and Django ledger service (milestones 27–28);
  - then the fault layer and control API (29) and the synthetic generator (30);
  - then the tool server, the runner and the agent harm oracle (32–34), and the B1 pilot (35).

  The deferred Phase 1 items (mutation-based defects, metric v1, harm results in the portal and
  loaders) come back with Track A after the B1 results.

## Deployment
On **Vercel** (project `payment-integration-lab`, Node 24): `public/` is the static output, and
`/devs/*` is rewritten to the Python function `api/portal.py`, which reads researcher accounts
from Neon Postgres (`DATABASE_URL`). Production must be reachable without Vercel login so the
landing page is public; previews stay SSO-protected. Results stay private until public release per
[ADR 006](docs/decisions/006-public-site-and-publishing.md).
Connect the GitHub repo in the Vercel dashboard to get per-PR previews.
