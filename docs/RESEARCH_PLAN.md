# Research protocol — draft 0.2

Revised 27 September 2026. Supersedes draft 0.1 (8 self-written template families). The reasons are recorded in [ADR 001](decisions/001-research-headline.md) and [ADR 002](decisions/002-harm-oracle.md).

Working title: **Do AI Coding Agents Build Safe Payment Integrations? Measuring Money-Level Harm and Evidence-Aware Assurance Across Providers**

## Contribution
Coding agents now write payment integrations routinely. Prior work measures whether they produce *working* integrations (Stripe, 2026), whether they satisfy a hardening rubric when *asked to* (Alipay-PIBench, 2026), or whether generic backends resist exploits (BaxBench, 2025). See the [novelty matrix](LITERATURE.md#novelty-matrix-27-sep-2026).

We contribute:
1. **A cross-provider adversarial benchmark.** Agent-built Stripe and Square integrations are attacked with forged, replayed, reordered and mismatched provider events, mostly when security was *not* requested.
2. **A harm oracle.** Outcomes are measured in money and state (underpayment, double fulfillment, cross-account access, lost or inconsistent orders), not rubric items.
3. **A validated evidence-aware score (PIAS).** It keeps unobserved controls visible, and we test whether it predicts harm on held-out subjects.
4. **An open tool and dataset:** zero-dependency engine, checks and CLI; generated subjects, prompts and results.

This is a proposal. Nothing here is a finding yet.

## Research questions
- **RQ1 Prevalence.** When security isn't requested, how often do agent-built integrations allow money-level harm? How does that vary by agent, provider and checkout architecture?
- **RQ2 Prompting.** How much does explicitly requesting security change harm outcomes (paired design)?
- **RQ3 Validity.** Does PIAS, computed from control checks, predict harm-oracle outcomes on held-out subjects? Is it better than simple baselines: pass count, equal weights, no critical gate?
- **RQ4 Observability.** How much harm does a browser-only assessment miss compared with backend plus provider evidence?
- **RQ5 External validity.** Do the same failure modes appear in the payment integrations of maintained open-source e-commerce platforms?

Hypotheses to preregister, not findings: (H1) a majority of unprompted agent integrations fail at least one critical control; (H2) requesting security reduces but doesn't eliminate harm; (H3) the PIAS lower bound ranks subjects by harm better than a pass count; (H4) browser-only assessment misses most webhook-layer harm.

## Subjects

### AI-generated integrations (main set)
- **Starter shop.** A small, fixed codebase with a catalog, customer identity, an orders database and a `fulfillOrder()` business action, but no payments. Agents add payments to it. Because the fulfillment table and identity model are fixed, the harness and harm oracle work the same way on every generated app, whatever code the agent writes.
- **Factors:**

  | Factor | Levels |
  |---|---|
  | Agent | 4–6 coding agents (to be chosen) |
  | Provider | Stripe, Square |
  | Architecture | hosted (Stripe Checkout / Square payment links), embedded (Stripe Payment Element / Square Web Payments SDK) |
  | Prompt | P0: realistic request with no mention of security; P1: the same request plus explicit security requirements |
  | Samples | k independent generations per cell |

- **Size:** for example, 5 agents × 2 × 2 × 2 × k=5 is 200 subjects. Fix the number after the pilot. Clusters for inference are agent × prompt, not individual apps.
- **Provenance recorded per subject:** agent, model ID, tool version, date, exact prompt, full transcript where available, token/cost, wall time, and the commit of the generated code. Subjects that fail to run are counted and reported as build failures, never dropped silently.

### Open-source shops (realism check)
Two or three maintained platforms with Stripe and/or Square support (candidates: Saleor, Medusa, Solidus, Sylius, WooCommerce + official plugin). Each runs locally in Docker against our own sandbox accounts. Results are analyzed separately from the agent set, and any finding goes through coordinated disclosure before publication ([ADR 006](decisions/006-public-site-and-publishing.md)).

### Reference checkout (calibration)
`lab/subjects/reference` is a known-good subject. Its seeded and mutated variants calibrate each check: every check must fail on a subject that lacks the control. Calibration subjects are never counted in RQ1–RQ5.

## Threat and observation model
**Actors:** customer browser, merchant application, merchant database/jobs, payment provider, webhook ingress.
**Trust boundaries:** browser/server, server/provider, webhook/worker, account/order ownership.
**Adversary:** controls its own client inputs, account and request timing; can replay or forge webhook requests at the merchant's endpoint; can create real sandbox payments for arbitrary amounts. The adversary does *not* compromise the provider or steal merchant secrets.

**Invariants.** An order is fulfilled only against a verified successful payment for its server-authoritative amount, currency and order. Each logical payment has at most one economic effect. One customer can't read or act on another's order. Invalid, stale or reordered events don't promote state. Refunds and recovery leave order and payment consistent.

**Observation layers.** Browser tooling sees requests, frames and navigation, but not merchant-to-provider calls, the database or webhook processing. Absence of browser-visible evidence isn't proof a backend check is absent. Each result states its observation layer. Browser-only results are reported as a separate profile, never mixed with full-evidence results (RQ4).

## Measurement

### Control checks → PIAS
Adversarial checks per control (see [METRIC.md](METRIC.md)), run against real sandbox payments plus harness-generated deliveries: unsigned, wrong-key, stale, tampered, replayed, reordered, cross-order and amount/currency-mismatched events, and cross-account requests. Each check has an ID, control, observation layer and version in a registry. Results are evidence records ([DATA_AND_TOOLS.md](DATA_AND_TOOLS.md)).

### Harm oracle (separate)
End-to-end scenarios frozen before the main study. For each scenario the oracle reads the provider sandbox ledger and the starter shop's fulfillment table:

| Harm | Measured as |
|---|---|
| Underpayment | Order value fulfilled minus amount captured for that order > 0 |
| Double fulfillment | More than one fulfillment for an order |
| Cross-account | A second identity reads, pays, refunds or fulfills another's order |
| Lost order | Captured payment with no fulfillment after the recovery window |
| Inconsistent refund | Refunded or canceled payment with the order still fulfilled or active |

Primary outcome: **any harm** per subject (binary), plus harm counts by type. The harm oracle never contributes to the score.

## Analysis plan
- **RQ1:** harm prevalence by agent, provider and architecture, with cluster-bootstrap 95% intervals. A logistic mixed model with random intercepts for agent × prompt, only if the pilot shows the data supports it.
- **RQ2:** paired P0 vs P1 differences within agent × provider × architecture, with bootstrap intervals and multiple-comparison adjustment.
- **RQ3:** discrimination of the PIAS lower bound for any-harm (AUROC, PR-AUC) under leave-one-agent-out cross-validation. Compared against pass count, equal weights and no critical gate. Sensitivity: weights ±20%, coverage threshold 60–90%, idempotency critical or not.
- **RQ4:** harm detected by browser-only vs full evidence; recall of browser-only relative to full.
- **RQ5:** descriptive; failure-mode taxonomy compared with the agent set.
- **Blinding:** the adjudicator reviewing inconclusive runs sees evidence, not agent identity or prompt condition.
- **Freezing:** the rubric, checks, harm scenarios, weights and exclusion rules are preregistered on OSF after the pilot and before the main run. Deviations are reported.
- **Exclusions**, preregistered: build failures, provider outages, unsupported capability. All are reported with denominators.

## Milestones and exit gates
| Phase | Weeks | Exit gate |
|---|---|---|
| 0 Foundation | 1 | Restructured repo, CI green, decisions recorded, novelty matrix |
| 1 Measurement core | 1–3 | SubjectAdapter, check registry, evidence schema, sqlite reference checkout, checks for all feasible controls, harm oracle; mutation-detection rate reported |
| 2 Realism | 3–5 | Stripe/Square emulators conform to recorded sandbox events; reference checkout passes against both real sandboxes; browser harness |
| 3 Subjects and pilot | 4–7 | Starter shop and prompts frozen; generator harness; 2–3 open-source shops running; pilot of 15–20 subjects; reviewer recruited; OSF preregistration |
| 4 Main study | 7–10 | All subjects run, exclusions accounted for, analysis reproducible from `data/runs` |
| 5 Release | 10–12 | Preprint, CLI v0.1 + GitHub Action, dataset, public site |

Twelve weeks is a planning estimate for one person, not a promise. Any open-source finding extends the timeline by its disclosure period.

## Out of scope for the preprint
Consented merchant cohort, public-web census, engineer-hours architecture study, mobile apps, agentic-commerce protocols, raw card handling, production or live-mode testing of any kind. These are future work; see [SAFETY.md](SAFETY.md) for the gates they'd need.

## Current implementation boundary
Implemented: PIAS engine and control catalog (`packages/core`); SubjectAdapter interface and a versioned registry of 19 checks across 6 controls (`packages/checks`); a local reference checkout with a fake provider, its adapter and 7 seeded defects (`lab/`); the research site. Not yet built: evidence schema v1, harm oracle, real-provider emulators and sandbox mode, browser harness, starter shop, generator, open-source subjects, analysis code.
