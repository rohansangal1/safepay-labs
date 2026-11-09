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

## Novelty matrix (3 Oct 2026)
Based on the Alipay-PIBench full text (arXiv HTML, v4), the Stripe post and the BaxBench abstract. Recheck each entry against full texts and released artifacts before preregistration.

| | Alipay-PIBench | Stripe benchmark | BaxBench | **This project** |
|---|---|---|---|---|
| Subjects | 6 agent models, 9 Alipay projects | Coding agents on Stripe tasks | LLMs, generic backends | **Owned architecture variants** + 2–3 open-source shops; agent work reviewed, not rerun |
| Providers | Alipay only | Stripe only | None | **Stripe and Square** (cross-provider) |
| Security asked for in the prompt? | Yes: separate "Advanced" hardening scenario | Not described | Varies | Not applicable: subjects are built to a declared design, with layers switched on and off |
| How security is judged | Rubric pass rate; static, unit, integration and E2E checks, plus LLM-assisted judgment | Functional graders | Exploits against running apps | **Adversarial behavioral checks** with a sandbox-backed provider; no LLM judge |
| Outcome measured | Rubric items passed | Task success | Exploit success | **Money and state harm** (ADR 002), separate from the score |
| Missing evidence | Not modeled | Not modeled | Not modeled | **Explicit:** unknown ≠ pass; assurance range plus coverage |
| Score validity tested? | No | No | No | **Yes:** does PIAS predict harm on held-out subjects? |

**Defensible contribution.** Which architectural choices and security layers stop forged, replayed, reordered and mismatched provider events from causing money-level harm, across two providers, paired with a validated evidence-aware score ([ADR 007](decisions/007-rescope-architectures-and-testing-tool.md)). The agent benchmarks in this matrix are evidence we review and map onto those layers, not results we reproduce. Alipay-PIBench already shows that *asking* for hardening and providing a skill improve rubric scores. We should cite that and avoid claiming it. Because we write the variants ourselves, the claim is a controlled comparison, not a prevalence estimate.

**Risks to novelty.** Either benchmark could add an architecture ablation or cross-provider tasks. Position against both explicitly, and keep the harm oracle and the open-source shops as the parts they lack.

## Track B: agents operating payment tools ([ADR 011](decisions/011-agent-operators-django-sandbox-synthetic-data.md))
Search date: 8 November 2026. These are abstract- and summary-level reads; read each in full before the B1 pilot.

1. **Faghih, Wang, Cheng, Bharti, Sriramanan, Balasubramanian, Hosseini and Feizi (EMNLP 2025), Tool Preferences in Agentic LLMs are Unreliable.**
   - An LLM sees a tool only as a name and a description. Editing descriptions (assertive cues, claims of active maintenance and similar) substantially shifts which tool it calls.
   - Its "correct usage rate" metric is the one B2 adopts. Not about payments.
   - The basis for B2 and RQ7, from the UMD Reliable AI Lab. Code is public.
   - [ACL Anthology](https://aclanthology.org/2025.emnlp-main.1060/), [arXiv 2505.18135](https://arxiv.org/abs/2505.18135), [code](https://github.com/kazemf78/llm-unreliable-tool-preferences).
2. **Mansoor, Rana and Phadke (arXiv 2608.02645, Aug 2026), Verified Tool Calls Improve LLM Agent Reliability Under Non-Atomic Failures.**
   - Four non-atomic failure modes (timeout after dispatch, delayed visibility, partial success, stale conflict) in a seeded simulator.
   - An agent-side verify-before-retry wrapper cuts duplicate side effects sharply against a retry-only baseline.
   - Limits: one model (Gemini Flash-Lite), two non-payment tasks, 25 episodes per cell. Richer APIs are listed as future work.
   - The closest prior work to B1. B1 borrows its failure taxonomy and differs in three ways: the *provider-side* API design is the treatment, the domain is payments with a double-entry ledger, and several models are compared.
   - [Hugging Face papers](https://huggingface.co/papers/2608.02645), [arXiv](https://arxiv.org/abs/2608.02645).
3. **Yao, Shinn, Razavi and Narasimhan (ICLR 2025), τ-bench: A Benchmark for Tool-Agent-User Interaction in Real-World Domains.**
   - Agents use database API tools under domain policies. Success means the final database state matches an annotated goal state, and pass^k measures consistency over repeated trials.
   - Retail and airline, no fault injection.
   - B1 borrows end-state scoring and pass^k.
   - [arXiv 2406.12045](https://arxiv.org/abs/2406.12045), [code](https://github.com/sierra-research/tau-bench).
4. **Debenedetti, Zhang, Balunović, Beurer-Kellner, Fischer and Tramèr (NeurIPS 2024 Datasets & Benchmarks), AgentDojo.**
   - An extensible environment for prompt injection through tool outputs: 97 tasks and 629 security cases across workspace, Slack, travel and banking. The banking suite has 11 tools and 16 user tasks.
   - Tool outputs are deterministic, and the API design isn't varied.
   - Adjacent to B2; B2's channel is the tool *description*, not tool output.
   - [Proceedings](https://proceedings.neurips.cc/paper_files/paper/2024/hash/97091a5177d8dc64b1da8bf3e1f6fb54-Abstract.html), [code](https://github.com/ACAI-Security/agentdojo).
5. **Uchibeke (arXiv 2609.22076, Sep 2026), APort Vault: Benchmarking AI Agent Payment Authorization with the Open Agent Passport.**
   - Replays 4,371 human-written attacks against a payment agent across 14 models.
   - Reports that a deterministic policy layer blocked all unpermitted transfers while payments still executed.
   - A vendor preprint, scoped to one tool schema in a simulated bank. It supports B2's deterministic-policy defense as a comparison point. Treat claims as author-reported.
   - [alphaXiv](https://www.alphaxiv.org/abs/2609.22076).
6. **Protocol-Level Attacks on Agentic Commerce Platforms / AIP-Bench (2026 preprint)** (listed above). Agentic-commerce protocols remain out of scope; cite for its threat taxonomy.

### Track B novelty matrix (8 Nov 2026)
| | Faghih et al. | Mansoor et al. | τ-bench | AgentDojo (banking) | **This project (B1/B2)** |
|---|---|---|---|---|---|
| Domain | General tools | Generic CRM/invoice tasks | Retail, airline | Banking among four suites | **Payments: invoices, refunds, payouts on a double-entry ledger** |
| What varies | Tool descriptions | Agent-side wrapper | Model, agent method | Attacks and defenses | **Provider-side API design** (B1); descriptions × defenses (B2) |
| Faults injected | No | Yes, four types | No | No | **Yes**, the same four plus duplicate delivery |
| Models | Several | One | Several | Several | **≥3, ≥2 providers, one open-weight** |
| Outcome | Tool-usage rate | Success, duplicates | End-state match, pass^k | Utility, attack success | **Money harms from the ledger** (six types), success, pass^k |
| Data | Benchmark tools | Two templates | Generated + annotated | Hand-built | **Seeded synthetic worlds; tasks verified by a scripted solver** |

**Defensible contribution (Track B).** Which payment-API designs and defenses keep tool-using agents from causing money-level harm under ordinary faults and tool-supply manipulation, measured on a ledger across several models. Not claimed: that agents are unreliable under faults (Mansoor et al.), that descriptions steer tool choice (Faghih et al.), or end-state scoring (τ-bench).

**Risks to novelty.** Mansoor et al. could extend to payments or to API-side designs; AgentDojo's banking suite could add faults. Re-check before freezing B1, and track both through the library job.

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
