# 001. Headline: AI coding agents and payment-integration safety

- **Status:** Accepted, 2026-09-27
- **Supersedes:** the 8 self-written template families in RESEARCH_PLAN draft 0.1

## Context
The draft plan built 8 checkout "families" by hand and seeded defects into them. Everything would be written by one person, so the families aren't independent, and detection of self-planted defects by self-written checks is guaranteed. Eight clusters also can't support the planned statistics. The team is one person for now, with a preprint target of about 12 weeks.

## Decision
The preprint asks: **do AI coding agents build safe payment integrations?** Several coding agents implement the same frozen checkout spec for Stripe and Square across checkout architectures. Each generated app is assessed with PIAS and the harm oracle (ADR 002). Two or three open-source e-commerce platforms, run locally in sandbox mode, serve as an external-validity check.

## Consequences
- Subjects are independent of the checks and scale cheaply. Clusters are agent × prompt variant.
- Directly overlaps Alipay-PIBench. The novelty comparison in LITERATURE.md must hold up: cross-provider coverage, explicit missing evidence, and behavioral harm validation instead of rubric grading.
- Every agent result must record the model ID, tool version, date and exact prompt. Agents change quickly; results are a snapshot.
- The consented merchant cohort, public-web census and engineer-hours study move to future work.
