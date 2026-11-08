# 007. Re-scope: architectures first, agent evidence from the literature, then a testing tool

- **Status:** Accepted, 2026-10-03. Amended by [011](011-agent-operators-django-sandbox-synthetic-data.md): adds Track B (agents operating payment tools) and runs it first.
- **Supersedes in part:** [001](001-research-headline.md) (the headline question and the agent experiment).

## Context
ADR 001 made the preprint about one question: do AI coding agents build safe payment integrations? Answering it means running several agents ourselves on a frozen spec, which is costly, ages quickly as agents change, and overlaps Alipay-PIBench. Meanwhile the parts already built (reference checkout, check registry, seeded defects) measure something more durable: which design choices in a payment integration stop money-level harm.

## Decision
1. **Primary question.** Which architectures and security layers prevent money-level payment harm? The subjects are architecture variants we own, plus open-source shops run locally for external validity.
2. **Coding agents.** The project still aims to tell developers how to get safe integrations from coding agents, measured with PIAS. The evidence for that comes mostly from reviewing published work (the library in `data/library.json`), not from running a large agent benchmark ourselves. A small own experiment remains possible and would need its own ADR.
3. **Isolated environments.** Every subject runs in its own container: a sealed, disposable environment with an emulated provider and no real keys or card data, started fresh for each run and discarded afterwards. Attacks and payment simulations happen only there. The existing TypeScript checks and harness drive the container from outside through `SubjectAdapter`, so a subject can be written in any language; Python is used for orchestration, analysis and any later ML. The harness and reference checkout are not rewritten in Python.
4. **Portal.** The researcher portal becomes the place to see what a run did and to hold the collected data. Runs execute locally or in CI and send evidence records ([ADR 009](009-evidence-schema-v1.md)) to the portal. The hosted portal never launches attacks.
5. **Open-source tool.** After the research, the checks, emulators and environments are packaged as an open-source tool that lets developers run end-to-end payment tests on their own apps without real card data.
6. **Machine learning.** Wanted, not yet defined. Nothing is built for it until a concrete use is written down. Evidence records are kept in a form that could serve as its data.

## Consequences
- The former milestones 15, 16 and 18 (starter shop and prompts, generator harness, agent pilot) are replaced by container isolation, architecture variants, run ingest in the portal and a literature review. The roadmap, RESEARCH_PLAN (draft 0.3), LITERATURE and the portal overview were rewritten on acceptance.
- ADR 001 moved away from self-written subjects because one author's variants are not independent and self-written checks will catch self-planted defects. This decision returns to owned variants, so the study must be framed as a controlled comparison of design choices, not an estimate of how common failures are. Independence comes from the separate harm oracle ([ADR 002](002-harm-oracle.md)), automatically mutated defects and the open-source shops.
- The novelty claim changes: less overlap with Alipay-PIBench, and the contribution rests on harm measured across architectures.
- The portal needs a way to receive and store runs, with the same access rules as [ADR 008](008-public-landing-and-researcher-portal.md).
- Running subjects needs a container runtime (such as Docker) locally and in CI. The in-process reference checkout keeps working for fast tests.
- The safety boundary in [SAFETY.md](../SAFETY.md) is unchanged: owned or locally run open-source software only.
- The tool is a product commitment beyond the preprint, and inherits the scope gate (loopback or signed scope file, no live-mode keys).
