# Research protocol — draft 0.3

Revised 3 October 2026. Supersedes draft 0.2 (coding agents as the primary subject). The reasons are recorded in [ADR 007](decisions/007-rescope-architectures-and-testing-tool.md); [ADR 002](decisions/002-harm-oracle.md) still governs the harm oracle.

Working title: **Which Payment-Integration Architectures Prevent Money-Level Harm? An Adversarial, Evidence-Aware Study Across Providers**

## Contribution
A payment integration can be built many ways: hosted or embedded checkout, fulfillment on the return page or on a webhook, with or without signature checks, amount matching, idempotency and recovery. Prior work measures whether coding agents produce *working* integrations (Stripe, 2026), whether they satisfy a hardening rubric when *asked to* (Alipay-PIBench, 2026), or whether generic backends resist exploits (BaxBench, 2025). None isolates which design choices stop which harms. See the [novelty matrix](LITERATURE.md#novelty-matrix-3-oct-2026).

We contribute:
1. **A controlled architecture comparison.** Owned checkout variants for Stripe and Square are attacked with forged, replayed, reordered and mismatched provider events, with security layers switched on and off one at a time.
2. **A harm oracle.** Outcomes are measured in money and state (underpayment, double fulfillment, cross-account access, lost or inconsistent orders), not rubric items.
3. **A validated evidence-aware score (PIAS).** It keeps unobserved controls visible, and we test whether it predicts harm on held-out subjects.
4. **Integration guidance** for developers and the coding agents they use, grounded in the measured results and a structured review of published work on agent-built integrations.
5. **An open tool and dataset:** zero-dependency engine, checks and evidence records, leading to an open-source tool for end-to-end payment testing in sealed environments without real card data.

This is a proposal. Nothing here is a finding yet.

## Research questions
- **RQ1 Architecture.** Which architectural choices and security layers prevent which money-level harms, and which harms remain when a single layer is removed?
- **RQ2 Validity.** Does PIAS, computed from control checks, predict harm-oracle outcomes on held-out subjects? Is it better than simple baselines: pass count, equal weights, no critical gate?
- **RQ3 Observability.** How much harm does a browser-only assessment miss compared with backend plus provider evidence?
- **RQ4 External validity.** Do the same failure modes appear in the payment integrations of maintained open-source e-commerce platforms?
- **RQ5 Agent guidance.** What does published work report about the payment integrations coding agents build, and which of the layers measured in RQ1 would have prevented the reported failures?

Hypotheses to preregister, not findings: (H1) no single layer prevents all five harms, and removing webhook authenticity or amount matching alone is enough for underpayment; (H2) return-page fulfillment without server-side confirmation allows harm that webhook-confirmed fulfillment prevents; (H3) the PIAS lower bound ranks subjects by harm better than a pass count; (H4) browser-only assessment misses most webhook-layer harm.

## Subjects

### Architecture variants (main set)
Owned checkouts under `lab/subjects/variants/`, built from the reference checkout so that each differs from its neighbour in one declared way.

| Factor | Levels |
|---|---|
| Provider | Stripe, Square (emulated, then real sandbox) |
| Checkout | hosted (Stripe Checkout / Square payment links), embedded (Stripe Payment Element / Square Web Payments SDK) |
| Fulfillment trigger | return page only, webhook only, webhook with reconciliation |
| Security layers | each PIAS control on or off: authenticity, amount and currency match, order binding, idempotency, ownership, lifecycle, recovery |

- **Design.** A full baseline per provider × checkout × trigger, then single-layer removals from each baseline, then selected pairs. The matrix is fixed after the pilot.
- **What this can and cannot show.** We write the variants, the checks and the defects, so this is a controlled comparison of design choices. It is not an estimate of how common any failure is in the wild. Three things keep it from being circular: the harm oracle is separate from the checks and frozen first; defects are also produced by automatic mutation, not only by hand; and the open-source shops are subjects we did not write.
- **Provenance recorded per subject:** the factor levels, the commit, and the evidence records for every run ([DATA_AND_TOOLS.md](DATA_AND_TOOLS.md)).

### Open-source shops (realism check)
Two or three maintained platforms with Stripe and/or Square support (candidates: Saleor, Medusa, Solidus, Sylius, WooCommerce + official plugin). Each runs locally in a container against our own sandbox accounts. Results are analyzed separately from the variant set, and any finding goes through coordinated disclosure before publication ([ADR 006](decisions/006-public-site-and-publishing.md)).

### Reference checkout (calibration)
`lab/subjects/reference` is a known-good subject. Its seeded and mutated variants calibrate each check: every check must fail on a subject that lacks the control. Calibration runs are reported separately from RQ1–RQ4.

### Coding agents (literature review)
Agent-built integrations are studied through published work, not by running a large benchmark ourselves. The review uses the project library (`data/library.json`): included sources are those that report security or correctness outcomes for agent- or LLM-written payment or backend code. For each we extract the task, whether security was requested, the failure modes reported and how they were judged, and map each failure mode to a PIAS control and to the layers measured in RQ1. A small experiment of our own is possible later and would need its own decision record.

## Isolation
Every subject runs in its own container: sealed, disposable, started fresh for each run, with an emulated or sandbox provider and no real keys or card data. The checks and harness drive it from outside through `SubjectAdapter`. Runs execute locally or in CI and send evidence records to the researcher portal, which stores and displays them; the hosted portal never launches a run. See [SAFETY.md](SAFETY.md).

## Threat and observation model
**Actors:** customer browser, merchant application, merchant database/jobs, payment provider, webhook ingress.
**Trust boundaries:** browser/server, server/provider, webhook/worker, account/order ownership.
**Adversary:** controls its own client inputs, account and request timing; can replay or forge webhook requests at the merchant's endpoint; can create real sandbox payments for arbitrary amounts. The adversary does *not* compromise the provider or steal merchant secrets.

**Invariants.** An order is fulfilled only against a verified successful payment for its server-authoritative amount, currency and order. Each logical payment has at most one economic effect. One customer can't read or act on another's order. Invalid, stale or reordered events don't promote state. Refunds and recovery leave order and payment consistent.

**Observation layers.** Browser tooling sees requests, frames and navigation, but not merchant-to-provider calls, the database or webhook processing. Absence of browser-visible evidence isn't proof a backend check is absent. Each result states its observation layer. Browser-only results are reported as a separate profile, never mixed with full-evidence results (RQ4).

## Measurement

### Control checks → PIAS
Adversarial checks per control (see [METRIC.md](METRIC.md)), run against emulated and real sandbox payments plus harness-generated deliveries: unsigned, wrong-key, stale, tampered, replayed, reordered, cross-order and amount/currency-mismatched events, and cross-account requests. Each check has an ID, control, observation layer and version in a registry. Results are evidence records ([DATA_AND_TOOLS.md](DATA_AND_TOOLS.md)).

### Harm oracle (separate)
End-to-end scenarios frozen before the main study. For each scenario the oracle reads the provider ledger (emulator or sandbox) and the subject's fulfillment records:

| Harm | Measured as |
|---|---|
| Underpayment | Order value fulfilled minus amount captured for that order > 0 |
| Double fulfillment | More than one fulfillment for an order |
| Cross-account | A second identity reads, pays, refunds or fulfills another's order |
| Lost order | Captured payment with no fulfillment after the recovery window |
| Inconsistent refund | Refunded or canceled payment with the order still fulfilled or active |

Primary outcome: **any harm** per subject (binary), plus harm counts by type. The harm oracle never contributes to the score.

## Analysis plan
- **RQ1:** a harm-by-variant matrix; for each layer, the harms that appear when only that layer is removed, per provider, checkout and trigger. Scenarios that depend on timing are repeated and reported as rates with intervals.
- **RQ2:** discrimination of the PIAS lower bound for any-harm (AUROC, PR-AUC) with whole architectures held out, and on the open-source shops. Compared against pass count, equal weights and no critical gate. Sensitivity: weights ±20%, coverage threshold 60–90%, idempotency critical or not.
- **RQ3:** harm detected by browser-only vs full evidence; recall of browser-only relative to full.
- **RQ4:** descriptive; failure-mode taxonomy compared with the variant set.
- **RQ5:** narrative synthesis with an extraction table; counts of reported failure modes by control. No pooled effect size is claimed.
- **Blinding:** the adjudicator reviewing inconclusive runs sees evidence records, not the variant's factor levels or defect labels.
- **Freezing:** the checks, harm scenarios, weights, variant matrix, review inclusion criteria and exclusion rules are preregistered on OSF after the pilot and before the main run. Deviations are reported.
- **Exclusions**, preregistered: build failures, provider outages, unsupported capability. All are reported with denominators.

## Milestones and exit gates
| Phase | Weeks | Exit gate |
|---|---|---|
| 0 Foundation | done | Restructured repo, CI green, decisions recorded, novelty matrix |
| 1 Measurement core | 1–5 | SubjectAdapter, check registry, evidence schema, reference checkout, checks for all feasible controls, harm oracle; mutation-detection rate reported |
| 2 Realism | 5–9 | Stripe/Square emulators conform to recorded sandbox events; reference checkout passes against both real sandboxes; browser harness |
| 3 Subjects and sweep | 9–14 | Container isolation; variant matrix built; 2–3 open-source shops running; runs reach the portal; pilot; reviewer recruited; OSF preregistration |
| 4 Main study | 14–18 | Full sweep run, literature review complete, exclusions accounted for, analysis reproducible from evidence records |
| 5 Release | 18–22 | Preprint, dataset, public site, open-source testing tool v0.1 with scope gate |

The weeks are a half-time planning estimate for one person, not a promise. Any open-source finding extends the timeline by its disclosure period.

## Out of scope for the preprint
A large agent benchmark of our own, consented merchant cohort, public-web census, engineer-hours architecture study, mobile apps, agentic-commerce protocols, raw card handling, machine-learning components, production or live-mode testing of any kind. These are future work; see [SAFETY.md](SAFETY.md) for the gates they'd need.

## Current implementation boundary
Implemented: PIAS engine and control catalog (`packages/core`); SubjectAdapter interface and a versioned registry of 24 checks across 8 controls and evidence schema v1 (`packages/checks`); a local reference checkout with a fake provider, its adapter and 11 seeded defects (`lab/`); the research site. Not yet built: harm oracle, real-provider emulators and sandbox mode, browser harness, container isolation, architecture variants, open-source subjects, run ingest in the portal.
