# Research protocol — draft 0.1
Prepared 27 September 2026. Working title: **Measuring Payment Integration Assurance Under Partial Observability**.

## Contribution and scope
Investigate whether a provider-neutral, evidence-aware control score predicts independently observed payment invariant violations, and how architecture affects security, recovery and implementation effort. This is a proposal, not a validated score or prevalence study. The literature review is a scoped search, not an exhaustive systematic review.

The likely contribution is a reproducible cross-provider benchmark, explicit treatment of missing evidence, and validation of a score against independent behavioral outcomes. Do not claim to invent payment integration testing: Wang et al. (2011), Sudhodanan et al. (2016), and Alipay-PIBench (2026) directly precede this work. See LITERATURE.md.

Initial scope: web checkout and merchant fulfillment, using Stripe and Square-compatible sandbox integrations; hosted, embedded and custom tokenized architectures. Exclude raw card handling, live financial transactions, mobile reverse engineering, agentic payment protocols, cryptocurrency and real disputes in the first study.

## Research questions
1. Does PIAS predict independent, held-out violations better than a generic checklist, browser-only indicators, or a simple count of passed controls?
2. How much does a browser-only assessment miss compared with backend plus provider evidence? Is the score stable under realistic missingness?
3. Which architecture/control combinations improve assurance and recovery for a fixed engineering budget?
4. Does the rubric transfer between providers, template families and independently implemented applications?

Hypotheses to preregister: critical-gated, evidence-aware reporting yields fewer falsely reassuring assessments than an undifferentiated pass percentage; server verification plus atomic fulfillment suppresses state inconsistency across architectures; architecture alone is a weaker predictor than implemented controls. These are hypotheses, not findings.

## Threat and observation model
Actors: customer browser, merchant application, merchant database/job system, payment provider, webhook ingress and third-party scripts. Trust boundaries: browser/server, server/provider, webhook/worker and account/order ownership. Assume an adversary can control its own client inputs and retry timing; do not assume compromise of processor infrastructure or secret keys.

Security invariants: an order is fulfilled only against a verified successful payment for its server-authoritative amount, currency, merchant and order; a logical payment/order action occurs at most once; one customer cannot control another customer's order; invalid or reordered events do not promote state; refunds and recovery reconcile according to explicit business rules. Test partial captures and refunds separately where supported.

DevTools/CDP and Playwright observe browser requests, responses, frames and navigation. They cannot directly observe merchant-to-provider API calls, private databases or webhook processing. Absence of browser-visible evidence is not proof a backend check is absent. Instrument owned/consented servers and correlate redacted traces with provider sandbox objects and fulfillment records. Browser-only results receive a surface profile, not a full assurance verdict.

## Three distinct datasets
A. **Controlled benchmark:** 8 independently implemented template families × 3 architecture variants × 2 provider adapters × 16 defect/control profiles × 4 seeded event schedules = 3,072 configuration records. This starter generates the manifest only. Thousands of configurations are not thousands of independent websites. Each family needs genuinely distinct implementation choices; copying layouts does not create independence.
B. **Consented validation cohort:** recruit approximately 20–50 owners for staging/sandbox replicas with explicit permission. Recruitment size is provisional, then refined by pilot variance and power analysis. Report selection and volunteer bias.
C. **Optional public-surface census:** approximately 1,000–3,000 domains to describe observable checkout types and client assets, only after access/terms/privacy review. No purchases, checkout submission, webhook requests, request mutation, account creation, access-control testing or vulnerability scoring without written authorization. Prefer licensed metadata or owner-provided traces. Keep this cohort analytically separate from A and B.

## Experimental design
Start with one clean reference application and one known defect per control. Demonstrate that each defect is observable with its assigned oracle before expanding. The 16 profiles should include a clean baseline, individually seeded defects and a small preregistered set of interactions; the manifest's profile numbers are placeholders until these definitions are frozen.

Compare hosted, embedded and custom tokenized checkout under matched catalog, prices, identity model, database semantics, event schedules and load. Where provider capabilities differ, document the mapping or mark the comparison unsupported rather than fabricate parity. Fully crossed 3,072 cells are a target, subject to this compatibility gate.

Use deterministic browser workflows first. An AI UI driver can suggest selectors or explore owned fixture variations, but must never assign the final vulnerability label or decide authorization. Record flow completion separately from security: navigation failure is an inconclusive run, not a vulnerability. Bound time, retries and requests.

Injected cases in owned labs: inconsistent amount/order binding, invalid event origin, duplicate delivery, event reordering, delayed success, cancellation, refund transitions, dropped events and simulated worker crashes. No production payload generator or arbitrary-target runner is provided.

Primary outcome: independently adjudicated invariant violation per fixture and scenario, measured from merchant database effects and provider sandbox state. Secondary outcomes: recovery delay, duplicate effects, checkout completion, false-positive/false-negative rate, evaluation time and engineering effort. The score cannot validate itself by predicting the same control labels used to calculate it.

## Validation and statistical analysis
- Freeze rubric, critical gates, baseline weights and inclusion rules before the held-out evaluation. Preserve score version and source commit on every result.
- Split by implementation family: F1–F5 development, F6 validation, F7–F8 held-out; keep all architectures, mutations and schedule seeds for a family in the same split. This is only 8 clusters; expand families before making broad statistical claims.
- Add leave-one-family-out and provider holdout analyses as sensitivity checks. Avoid training on near-clones of test cases or tuning weights to the final test set.
- Use independent annotators blinded to score and seeded profile, reconcile disagreements, report inter-rater agreement and reasons for inconclusive evidence.
- Report precision, recall, F1 and PR-AUC for finding detection; confidence intervals clustered by family. For score validity, use held-out rank association and discrimination against independently measured harm. A probability-of-failure claim requires separate calibration and adequate data.
- Use paired architecture comparisons, effect sizes and cluster bootstrap intervals; adjust multiple comparisons. Use mixed-effects analysis only if sample size and model assumptions justify it.
- Compare equal weights, expert weights, no critical gates, browser-only and full instrumentation. Vary draft weights ±20%, coverage thresholds and missingness patterns; report rank reversals.
- Preregister exclusions (provider outages, unsupported capability, bot failure) and report denominators and missingness by architecture/provider. Do not silently discard failed runs.
- Pilot 24–60 cells to estimate variance, detection quality and run cost before selecting final sample size. Benchmark defect prevalence is deliberately artificial and cannot estimate production prevalence.

## Architecture hypothesis and evaluation
Hosted checkout plus server-created orders, authenticated provider completion, atomic/idempotent fulfillment and reconciliation is a practical reference architecture to test. Embedded components and custom tokenized flows can also satisfy these properties. There is no experimentally established optimum yet. Plot a Pareto frontier of invariant failure rate, recovery time, p95 latency and engineer hours, stratified by comparable business requirements. Do not call the largest weighted security score universally optimal.

## Proposed milestones and exit gates
Weeks 1–2: ethics/jurisdiction determination, literature full-text extraction, threat model and preregistration. Exit: approved scope and frozen pilot rubric.
Weeks 3–4: reference fixtures, two sandbox adapters, durable evidence oracle. Exit: clean baseline and each single defect reproducible.
Weeks 5–6: blind pilot, missingness and leakage checks. Exit: error analysis and a documented revised/frozen v1 rubric.
Weeks 7–9: batch execution of approved matrix, resource tracking and architecture analysis. Exit: reproducible results with exclusions accounted for.
Weeks 10–12: optional consented external validation, robustness checks and paper/artifact. External cohort timing depends on recruitment and approvals.

## Resources and feasibility
Initial team: one implementation lead plus one independent security/research reviewer, with institutional/legal support for external work. A 12-week schedule is a planning estimate, not a delivery promise. At 3,072 cells × 3 repeats × 90 seconds, browser work alone is about 230 worker-hours. Measure actual duration and provider quotas in the pilot; price compute using the chosen platform at that time. Do not infer sample size from available compute alone.

## Current implementation boundary
The repository contains a dashboard, draft score engine, configuration generator, offline toy state model and tests. It does not yet contain 8 deployed templates, provider SDK adapters, a browser bot, a collection scheduler, live evidence, persistent dashboard storage, or validated findings. Those are the next research milestones.
