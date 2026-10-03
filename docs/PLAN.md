# Working plan

The living build/research plan. [CLAUDE.md](../CLAUDE.md) has the fast orientation and working
rules; this file has the direction, workstreams and timeline. Keep the "Status" markers current as
work lands. Milestone board: [site/data/milestones.json](../site/data/milestones.json).

## Direction ([ADR 007](decisions/007-rescope-architectures-and-testing-tool.md), accepted 2026-10-03)
**Which architectures and security layers prevent money-level payment harm.** Primary subject =
owned **architecture variants**, each in its own container; open-source shops run locally for
external validity. Coding agents are covered mostly by a **literature review**, and the output is
integration guidance for developers and their agents. The researcher portal stores and shows runs.
After the research comes an **open-source tool** for end-to-end payment testing without real card
data. ML is wanted but undefined. Vulnerability work is confined to **owned + open-source software**
run locally, with coordinated disclosure (see [SAFETY.md](SAFETY.md)).

## Prerequisites — status
- [x] Phase 0 merged to `main` (restructure, CI, reference checkout, site, library job).
- [x] Python analysis env on `main`; library exploratory analysis on `main`.
- [ ] arXiv abstract backfill (`feat/library-abstracts`) — commit/merge.
- [ ] GitHub settings: Actions may open PRs; branch protection on `main`; private vuln reporting;
      secret scanning + push protection; Dependabot.
- [ ] Vercel: connect the GitHub repo for per-PR previews (project already created, SSO-protected).
- [ ] Widen `pytest` pin in `analysis/pyproject.toml` to accept the Dependabot bump.

## Workstreams
**A — Python analysis env.** DONE (`analysis/`: loaders + schema guard, cluster bootstrap, library
analysis, uv.lock, CI). Extend loaders when evidence/harm schemas land.

**B — Measurement core.** DONE: SubjectAdapter, versioned check registry, evidence schema v1
([ADR 009](decisions/009-evidence-schema-v1.md)). To do: checks for the remaining controls; **harm
oracle** (separate module, never scores); mutation-based defects; metric v1 decisions; Stripe/Square
emulators + **scope gate**; **container isolation** (one per subject); **architecture variants**
(`lab/subjects/variants/`); open-source shops in containers (external validity, coordinated
disclosure).

**C — Study.**
- *Architecture sweep (primary):* run the registry + harm oracle across the variant matrix and the
  open-source shops; which layers stop which harms; feeds portal insights.
- *Agent literature review:* structured review from `data/library.json`; map reported failure modes
  onto PIAS controls and the layers the sweep measured; produce integration guidance. No large agent
  benchmark of our own; a small experiment would need its own ADR and sandboxing per SAFETY.md.

**D — Research site.** Split into a public landing page (`public/`) and a researcher-only portal
(`site/`, behind `api/portal.py`) — [ADR 008](decisions/008-public-landing-and-researcher-portal.md).
Still to do in the portal: **run ingest and viewer** (receive evidence records from local/CI runs,
store them, show what each run did); an **Insights** view (architecture-sweep charts); **About** (independent researcher; personal project); **security &
privacy disclosure** (owned/authorized-only scope, synthetic data, no live testing, retention
ceilings, PCI/GDPR disclaimers, responsible disclosure); state no analytics/cookies. Reuse existing
render helpers in `site/app.js`.

**E — Autonomous build loop.** A scheduled Claude Code cloud routine (via the `schedule` skill) that
picks the next milestone, works on a branch, runs typecheck + tests + `check:generated`, and opens a
PR — never pushes to `main`. Guardrails: obey SAFETY.md; no runtime deps in `packages/`; new checks
need a failing case; metric changes need an ADR + version bump; never touch secrets or external
targets.

## Timeline (half-time, ~20 h/week)
P0 wrap + Python env (done) → P1 measurement core (wk 1–5) → P2 realism (wk 5–9) → P3 containers,
variants, portal ingest, pilot + OSF preregistration (wk 9–14) → P4 architecture sweep + literature
review (wk 14–18) → P5 release: preprint, dataset, public site, open-source testing tool v0.1 with
scope gate (wk 18–22).
~4–5 months to preprint; a planning estimate, not a promise.

## Open decisions (need input or an ADR)
1. The variant matrix: which factor levels and layer removals, fixed after the pilot.
2. Which 2–4 open-source platforms (Saleor/Medusa/Solidus/Sylius/WooCommerce).
3. Whether the cloud loop may touch docs/site or code only.
4. How the portal stores runs (tables in the existing Neon database, retention, who may upload).
5. What the ML component is for, if anything.
6. About-section specifics (name/contact/ORCID); custom domain at release.
