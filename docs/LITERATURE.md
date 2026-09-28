# Related work and primary sources
The full, current list of sources is [`data/library.json`](../data/library.json), updated daily by a review-gated job (see the README). This page holds the analysis: the closest work, the novelty matrix and review notes.

Search date: 27 September 2026. Scoped discovery review; bibliographic/abstract screening unless otherwise stated. Full-text quality appraisal, code reproducibility and citation chaining remain work before preregistration. Search themes: cashier-as-a-service logic flaws, multi-party application testing, payment integration benchmarks, provider webhook/fulfillment guidance and PCI payment-page scope.

## Closest research
1. **Wang, Chen, Wang and Qadeer (IEEE S&P, 2011), How to Shop for Free Online — Security Analysis of Cashier-as-a-Service Based Web Stores.** Establishes that merchant/cashier state coordination can create payment logic flaws. Historical systems and findings do not quantify present-day Stripe/Square deployments. [Author publication page](https://www.microsoft.com/en-us/research/publication/how-to-shop-for-free-online-security-analysis-of-cashier-as-a-service-based-web-stores/).
2. **Sudhodanan, Armando, Carbone and Compagna (NDSS, 2016), Attack Patterns for Black-Box Security Testing of Multi-Party Web Applications.** Pattern-based automated testing is relevant to protocol-state and replay cases. Broader multi-party applications, not a modern universal payment assurance metric. [Conference paper](https://www.ndss-symposium.org/wp-content/uploads/2017/09/attack-patterns-black-box-security-testing-multi-party-web-applications.pdf).
3. **Ying et al., Alipay-PIBench (2026 preprint, v4 revised 13 August).** The most direct recent overlap: nine Alipay product projects, 18 coding-agent tasks, functional and risk-aware rubrics. Our proposed distinction is cross-provider integration assurance under partial observation and independent behavioral validation; novelty must be checked against full text and artifacts. [arXiv](https://arxiv.org/abs/2607.14573).
4. **Protocol-Level Attacks on Agentic Commerce Platforms: A Cross-Platform Taxonomy, AIP-Bench, and Unified Defense (2026 preprint).** Adjacent agentic-commerce protocol benchmark; useful threat taxonomy but a different system population from ordinary web checkout. Treat claims as author-reported pending independent reproduction. [arXiv](https://arxiv.org/abs/2607.21824).
5. **Park and Hastings, Weak Enforcement and Low Compliance in PCI DSS: A Comparative Security Study (2026 ISDFS journal reference listed on arXiv).** Governance context; not a technical payment-integration scanner and not evidence of vulnerability prevalence in a new website sample. [arXiv record](https://arxiv.org/abs/2512.13430).
6. **Security analysis of third-party in-app payment in mobile applications (2019).** Adjacent mobile integration work combining static/dynamic analysis. Mobile findings cannot be generalized to modern web merchants without replication. [Publisher abstract](https://www.sciencedirect.com/science/article/abs/pii/S2214212619301632).
7. **Stripe (2026), "Can AI agents build real Stripe integrations? We built a benchmark to find out."** Industry benchmark of coding agents on full-stack Stripe integrations, with deterministic graders over APIs, UI and Stripe-side artifacts. It measures whether integrations *work*. The post does not describe security, webhook-authenticity or adversarial evaluation. [Stripe blog](https://stripe.com/blog/can-ai-agents-build-real-stripe-integrations). Related: [Stripe steering experiments](https://stripe.dev/blog/ai-steering-experiments).
8. **Vero et al., BaxBench: Can LLMs Generate Correct and Secure Backends? (2025 preprint).** Generated backends are checked with functional tests and then attacked with concrete exploits. This is the closest *method*: behavioral security testing of generated code. It covers generic backend vulnerabilities, not payment-specific multi-party state or money outcomes. [arXiv 2502.11844](https://arxiv.org/abs/2502.11844).
9. **Endor Labs (2026), AI coding agent security benchmark.** Industry benchmark of security in agent-written code. Cited by Alipay-PIBench; not yet read in full. [Endor Labs](https://www.endorlabs.com/research/ai-code-security-benchmark).

## Novelty matrix (27 Sep 2026)
Based on the Alipay-PIBench full text (arXiv HTML, v4), the Stripe post and the BaxBench abstract. Recheck each entry against full texts and released artifacts before preregistration.

| | Alipay-PIBench | Stripe benchmark | BaxBench | **This project** |
|---|---|---|---|---|
| Subjects | 6 agent models, 9 Alipay projects | Coding agents on Stripe tasks | LLMs, generic backends | Coding agents + 2–3 open-source shops |
| Providers | Alipay only | Stripe only | None | **Stripe and Square** (cross-provider) |
| Security asked for in the prompt? | Yes: separate "Advanced" hardening scenario | Not described | Varies | **Primary condition: no.** Realistic prompts that don't mention security, plus a paired condition that does |
| How security is judged | Rubric pass rate; static, unit, integration and E2E checks, plus LLM-assisted judgment | Functional graders | Exploits against running apps | **Adversarial behavioral checks** with a sandbox-backed provider; no LLM judge |
| Outcome measured | Rubric items passed | Task success | Exploit success | **Money and state harm** (ADR 002), separate from the score |
| Missing evidence | Not modeled | Not modeled | Not modeled | **Explicit:** unknown ≠ pass; assurance range plus coverage |
| Score validity tested? | No | No | No | **Yes:** does PIAS predict harm on held-out subjects? |

**Defensible contribution.** Whether coding agents build payment integrations that resist forged, replayed, reordered and mismatched provider events when security isn't requested, across two providers. It is measured by money-level harm and paired with a validated evidence-aware score. Alipay-PIBench already shows that *asking* for hardening and providing a skill improve rubric scores. We should cite that and avoid claiming it.

**Risks to novelty.** Stripe could publish security results from its benchmark. Alipay-PIBench could add cross-provider tasks. Move quickly, and position against both explicitly.

## Current implementation sources
- [Stripe fulfillment](https://docs.stripe.com/payments/checkout/fulfill-orders): use authoritative payment completion and handle repeat fulfillment safely.
- [Stripe webhooks](https://docs.stripe.com/webhooks): provider event handling and signature verification requirements.
- [Stripe testing](https://docs.stripe.com/testing): use test environments and supported synthetic payment methods.
- [Square signature validation](https://developer.squareup.com/docs/webhooks/step3validate): verification binds the raw request body and configured notification URL using the subscription key.
- [Square webhook overview](https://developer.squareup.com/docs/webhooks/overview): event delivery can repeat; application behavior must tolerate duplicates.
- [Square Sandbox](https://developer.squareup.com/docs/devtools/sandbox/overview): sandbox environment for integration development and testing.

## Standards, ethics and tooling
- [PCI SSC FAQ 1588](https://www.pcisecuritystandards.org/faqs/1588/): the particular SAQ A script eligibility criterion addresses embedded forms and distinguishes redirects. This does not settle all PCI scope or questionnaire requirements.
- [DOJ CFAA policy](https://www.justice.gov/jm/jm-9-48000-computer-fraud) and [2022 announcement](https://www.justice.gov/archives/opa/pr/department-justice-announces-new-policy-charging-cases-under-computer-fraud-and-abuse-act): good-faith research charging policy is not target permission or a blanket legal defense.
- [GDPR official text](https://eur-lex.europa.eu/eli/reg/2016/679/oj): determine applicable lawful basis, data minimization and research safeguards when personal data is involved.
- [HHS internet research considerations](https://www.hhs.gov/ohrp/sachrp-committee/recommendations/2013-may-20-letter-attachment-b/index.html): institutional ethics review may be needed; public accessibility does not answer every research/privacy question.
- [Playwright network](https://playwright.dev/docs/network): browser request/response observation and owned-fixture mocking.
- [OpenTelemetry](https://opentelemetry.io/docs/what-is-opentelemetry/): correlate server events without retaining sensitive payloads.
- [OWASP WSTG](https://owasp.org/projects/web-security-testing-guide): testing taxonomy and general control baselines.
- [FIRST CVSS v4.0](https://www.first.org/cvss/v4.0/specification-document): severity of individual findings, separate from integration assurance.

## Next review pass
Use backward/forward citations from the first three entries; search IEEE S&P, USENIX Security, CCS, NDSS and software-engineering venues through the submission date. Log inclusion/exclusion reasons, systems, scale, authorization, observability, evaluation oracles, false-positive analysis, availability and reproducibility. Treat preprints and reviewed venue papers separately. No claim of exhaustive novelty is warranted yet.
