# Working plan

The living build/research plan. [CLAUDE.md](../CLAUDE.md) has the fast orientation and working
rules; this file has the direction, workstreams and timeline. Keep the "Status" markers current as
work lands. Milestone board: [site/data/milestones.json](../site/data/milestones.json).

## Direction (proposed — pending ADR 007)
From "do AI coding agents build safe integrations" → **which architectures and security layers
prevent money-level payment harm, and how to optimize a coding agent's design/scaffolding to
reliably produce safe systems.** Primary subject = owned **architecture variants**; coding agents
are an optimization target. Vulnerability work is confined to **owned + open-source software** run
locally, with coordinated disclosure (see [SAFETY.md](SAFETY.md)). Write **ADR 007** to accept this
before rewriting the research docs; it supersedes part of [ADR 001](decisions/001-research-headline.md).

## Prerequisites — status
- [x] Phase 0 merged to `main` (restructure, CI/CodeQL, reference checkout, site, library job).
- [x] Python analysis env on `main`; library exploratory analysis on `main`.
- [ ] arXiv abstract backfill (`feat/library-abstracts`) — commit/merge.
- [ ] GitHub settings: Actions may open PRs; branch protection on `main`; private vuln reporting;
      secret scanning + push protection; Dependabot; decide CodeQL while private.
- [ ] Vercel: connect the GitHub repo for per-PR previews (project already created, SSO-protected).
- [ ] Widen `pytest` pin in `analysis/pyproject.toml` to accept the Dependabot bump.

## Workstreams
**A — Python analysis env.** DONE (`analysis/`: loaders + schema guard, cluster bootstrap, library
analysis, uv.lock, CI). Extend loaders when evidence/harm schemas land.

**B — Measurement core (reframed subjects).** SubjectAdapter so checks run against any subject;
extract the inline checks into a versioned **check registry** (id, control, layer, oracle,
version); **architecture-variant** subjects (`lab/subjects/variants/`); evidence records (schema
v1); **harm oracle** (separate module, never scores); mutation-based defects; Stripe/Square
emulators + **scope gate**; open-source shops in Docker (external validity, coordinated disclosure).
(`phase-1-subject-adapter` has started this.)

**C — Experiments.**
- *Track 1 — architecture sweep (primary):* run the registry + harm oracle across the variant
  matrix; which layers move harm; feeds site insights.
- *Track 2 — agent design optimization:* on the fixed starter shop, measure how scaffolding (naive
  prompt → + security → + design skill → + self-review/guardrail loop) changes harm/PIAS. Goal is
  optimization, not vendor ranking. Generated code is untrusted → sandboxed per SAFETY.md. Model
  list → an ADR.

**D — Research site.** Reframe headline/overview; add an **Insights** view (architecture-sweep
charts from `data/runs`); **About** (independent researcher; personal project); **security &
privacy disclosure** (owned/authorized-only scope, synthetic data, no live testing, retention
ceilings, PCI/GDPR disclaimers, responsible disclosure); state no analytics/cookies. Reuse existing
render helpers in `site/app.js`.

**E — Autonomous build loop.** A scheduled Claude Code cloud routine (via the `schedule` skill) that
picks the next milestone, works on a branch, runs typecheck + tests + `check:generated`, and opens a
PR — never pushes to `main`. Guardrails: obey SAFETY.md; no runtime deps in `packages/`; new checks
need a failing case; metric changes need an ADR + version bump; never touch secrets or external
targets.

## Timeline (half-time, ~20 h/week)
P0 wrap + Python env (done) → P1 measurement core (wk 1–5) → P2 realism + architecture sweep
(wk 5–9) → P3 agents & pilot + OSF preregistration + freeze ADR 007 (wk 9–14) → P4 main study
(wk 14–18) → P5 release: preprint, CLI v0.1 + scope gate, dataset, public site (wk 18–22).
~4–5 months to preprint; a planning estimate, not a promise.

## Open decisions (need input or an ADR)
1. Which coding-agent models for Track 2 (must be scriptable/sandboxable).
2. Which 2–4 open-source platforms (Saleor/Medusa/Solidus/Sylius/WooCommerce).
3. Whether the cloud loop may touch docs/site or code only.
4. About-section specifics (name/contact/ORCID); custom domain at release.
