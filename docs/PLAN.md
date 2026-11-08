# Working plan

The living build/research plan. [CLAUDE.md](../CLAUDE.md) has the fast orientation and working
rules; this file has the direction, workstreams and timeline. Keep the "Status" markers current as
work lands. Milestone board: [site/data/milestones.json](../site/data/milestones.json).

## Direction ([ADR 007](decisions/007-rescope-architectures-and-testing-tool.md), amended by [ADR 011](decisions/011-agent-operators-django-sandbox-synthetic-data.md), proposed 2026-11-08)
**Which payment-system designs prevent money-level harm when the party on the other side
misbehaves?** Two tracks share one harm-oracle approach, one evidence format, one portal and one
safety boundary:

- **Track B (first): LLM agents operating payment tools.** Agents pay invoices, issue refunds and
  run payouts through MCP tools on a Django payments sandbox with a double-entry ledger.
  - **B1:** what happens under tool faults (timeouts after commit, partial success, delayed
    visibility, stale conflicts), with the payment API's design as the treatment.
  - **B2:** extends Faghih et al. (EMNLP 2025, UMD) to money-moving tools: do manipulated tool
    descriptions route money to the wrong tool, and which defenses stop it?
- **Track A (after B1): integrations under forged provider events.** Owned checkout variants
  attacked with forged, replayed, reordered and mismatched events, scored with PIAS and judged by
  the harm oracle. The scope is reduced (see the timeline).

Everything runs in Docker on synthetic data: generated worlds, tasks and fault schedules with
known correct outcomes. Coding agents (agents that *write* integrations) stay a literature review.
Vulnerability work stays confined to owned and locally run open-source software
([SAFETY.md](SAFETY.md)).

## Stack
| Part | Tech | Where | Status |
|---|---|---|---|
| PIAS engine, checks, harm oracle | TypeScript, Node type stripping, zero deps | `packages/` | Built |
| Reference checkout, fake provider | TypeScript, `node:sqlite` | `lab/emulator`, `lab/subjects/reference` | Built |
| Payments sandbox (ledger, intents, refunds, payouts, idempotency, fault layer, admin) | Django, Postgres | `lab/sandbox/` | New |
| Agent tool server | MCP server (Python) over the sandbox API | `lab/agents/` | New |
| Agent runner and agent harm oracle | Python, LangChain/LangGraph, several model providers | `lab/agents/` | New |
| Synthetic worlds, tasks, fault schedules, tool manifests | Python, seeded generator | `lab/synth/` | New |
| Isolation | Docker + compose, one fresh stack per run, egress allowlist | `lab/docker/` | New |
| Analysis | Python (uv), pandas, seeded bootstrap | `analysis/` | Built, to extend |
| Researcher portal | FastAPI gate + static portal, Neon Postgres | `portal/`, `api/`, `site/` | Built, ingest to do |

The Python projects under `lab/` form one uv workspace with a committed `uv.lock`
([ADR 003](decisions/003-dependencies-and-layout.md) as amended).

## Prerequisites — status
- [x] Phase 0 merged to `main` (restructure, CI, reference checkout, site, library job).
- [x] Python analysis env on `main`; library exploratory analysis on `main`.
- [ ] Merge `feat/harm-oracle`, then this rescope branch.
- [ ] Accept ADR 011 (change its status to Accepted when merging).
- [ ] arXiv abstract backfill (`feat/library-abstracts`) — commit/merge.
- [ ] GitHub settings: Actions may open PRs; branch protection on `main`; private vuln reporting;
      secret scanning + push protection; Dependabot.
- [ ] Vercel: connect the GitHub repo for per-PR previews (project already created, SSO-protected).
- [ ] Widen `pytest` pin in `analysis/pyproject.toml` to accept the Dependabot bump.
- [ ] Docker Desktop (or another container runtime) installed locally; model API keys in a
      git-ignored `.env` with a spend cap set on each provider account.

## Workstreams
**A — Python analysis env.** DONE (`analysis/`: loaders + schema guard, cluster bootstrap, library
analysis, uv.lock, CI). Next: loaders for agent-run evidence (schema 1.2), pass^k and harm-rate
tables with cluster bootstrap by task.

**B — Payments sandbox and synthetic data (shared foundation).**
- *Django sandbox* (`lab/sandbox/`), the system-design core:
  - double-entry ledger: immutable journal entries, every transaction sums to zero, integer minor
    units, never floats;
  - cached balances updated in the same transaction under `select_for_update()`, plus a drift
    check against the entries;
  - payment intents with an explicit state machine; refunds, payouts, holds;
  - idempotency keys stored with the original response;
  - a fault layer configured per run;
  - a test-control API (reset, seed, read ledger) and the Django admin as the inspection console.
- *Its tests:* property-based tests (Hypothesis) for "the ledger always sums to zero" and "one
  intended payment, one economic effect"; concurrency tests for double submits and hot accounts.
- *Synthetic generator* (`lab/synth/`), seeded and versioned. Worlds: merchants, customers,
  accounts, balances, payees, invoices and history, drawn from stated distributions. Tasks, each
  with its expected ledger end state. B1 fault schedules and B2 tool manifests. Its tests:
  determinism by seed, and every expected end state reachable by a scripted (non-LLM) solver.
- *Docker:* a compose file per run (sandbox + Postgres, tool server, agent runner). The sandbox has
  no egress; the runner reaches only the model API hosts.

**C — Agent study (Track B).**
- *MCP tool server* (`lab/agents/`) exposing payment tools at four design levels:
  (a) no idempotency; (b) optional key; (c) required key; (d) server-side dedupe, a status-lookup
  tool and an explicit "outcome unknown" error.
- *Agent runner* on LangChain/LangGraph:
  - three or more models, two or more providers, one open-weight;
  - fixed settings, framework retries set explicitly, *k* repeats per task;
  - every run under a spend cap.
- *Agent harm oracle* (ADR 002 principle; frozen before the main run): it compares the ledger with
  the expected end state and reports duplicate payment, wrong amount, wrong payee, unauthorized
  action, lost payment and false report.
- *Evidence schema 1.2* for agent runs (own ADR): model ID and date, prompts, tool-manifest hash,
  design level, fault schedule, seed, redacted transcript.
- *B1:* design level × fault type × fault rate × model. Pilot first, then the main grid.
- *B2:* reproduce one Faghih et al. result with their public code. Then competing money-moving
  tools with edited descriptions, and three defenses: a pinned tool registry, a deterministic
  payee/amount policy, and confirm-before-send.

**D — Measurement core and Track A.** Built: SubjectAdapter, versioned check registry (30 checks,
11 controls), evidence schema 1.1, harm oracle (12 scenarios). After B1:
- mutation-based defects; metric v1 decisions;
- Stripe emulator + **scope gate**, then the Square emulator;
- architecture variants in the Docker setup from workstream B, optionally including a Django
  checkout through an HTTP SubjectAdapter;
- one or two open-source shops;
- the sweep and the PIAS validation (RQ1, RQ2, RQ4).

The browser harness (RQ3) is parked.

**E — Research site.** The public landing page and the researcher portal are built
([ADR 008](decisions/008-public-landing-and-researcher-portal.md)). Still to do:
- run ingest and a viewer for both tracks; for agent runs, show the transcript, the tool calls and
  the ledger diff against the expected end state;
- an **Insights** view;
- **About** (independent researcher; personal project);
- a **security & privacy disclosure**: owned/authorized-only scope, synthetic data, no live testing,
  retention ceilings, PCI/GDPR disclaimers, responsible disclosure; state that there are no
  analytics or cookies.

Reuse the existing render helpers in `site/app.js`.

**F — Autonomous build loop.** A scheduled Claude Code cloud routine picks the next milestone,
works on a branch, runs typecheck + tests + `check:generated` (plus `uv run pytest` for `lab/`
Python), and opens a PR. It never pushes to `main`. Guardrails:
- obey SAFETY.md;
- no runtime deps in `packages/`;
- new checks need a failing case; metric changes need an ADR + version bump;
- never touch secrets, model API keys or external targets;
- never runs paid model calls.

## Timeline (~15 h/week during the semester)
| Weeks | Work | Exit gate |
|---|---|---|
| 0 | Merge harm oracle + this rescope. Read Faghih et al. and the Mansoor et al. non-atomic-failure paper; reproduce one Faghih et al. result with their code. | One reproduced table or figure, with notes |
| 1–3 | Django sandbox v0: ledger, intents, refunds, payouts, idempotency, admin; property and concurrency tests; Docker compose | `docker compose up` gives a clean sandbox; ledger tests green |
| 3–4 | Fault layer + test-control API; synthetic generator v0 (worlds, tasks, expected end states) | A scripted solver reaches every expected end state; faults reproducible by seed |
| 4–6 | MCP tool server at four design levels; agent runner with two models; agent harm oracle; evidence schema 1.2 ADR | One agent run end to end, judged by the oracle, visible as an evidence record |
| 6–7 | **B1 pilot**: small grid, *k* = 5. Short results note, then email the Faghih et al. authors | Pilot results with intervals; spend recorded |
| 8–10 | B1 main grid (three or more models); B2 manipulation + defenses | Frozen tasks/oracle; exclusions accounted for |
| 11–12 | Analysis (pass^k, harm rates, cluster bootstrap); workshop-length write-up; agent runs in the portal | Draft paper; analysis reproducible from evidence records |
| 12–28 | Track A: mutation defects, metric v1, Stripe emulator + scope gate, variants in containers, 1–2 open-source shops, pilot + OSF preregistration, sweep, Square emulator | As in RESEARCH_PLAN phases 4–6 |
| 28+ | Release: Track A preprint, dataset, open-source sandbox; testing tool v0.1 with scope gate | — |

These are planning estimates for one person, not promises. A disclosure period for any open-source
finding extends Track A.

## Not planned
OCR and document inputs are out of the core plan. A possible later B3: synthetic rendered invoices
as task inputs, and as a channel for injected instructions. It would need its own ADR.

## Open decisions (need input or an ADR)
1. The model list and the per-run and total spend caps for Track B.
2. Evidence schema 1.2 fields for agent runs, and redaction of transcripts.
3. B1 fault rates and *k*, fixed after the pilot.
4. Where the agent harm oracle lives: Python in `lab/agents` (current plan) or TypeScript beside
   `packages/oracle`.
5. Whether a Django checkout joins Track A's variant set.
6. Venue for the Track B write-up (workshop vs. preprint only).
7. Track A: the variant matrix, which open-source platform(s), and how the portal stores runs.
8. What the ML component is for, if anything.
9. About-section specifics (name/contact/ORCID); custom domain at release.
