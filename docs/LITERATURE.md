# Related work and primary sources
Search date: 27 September 2026. Scoped discovery review; bibliographic/abstract screening unless otherwise stated. Full-text quality appraisal, code reproducibility and citation chaining remain work before preregistration. Search themes: cashier-as-a-service logic flaws, multi-party application testing, payment integration benchmarks, provider webhook/fulfillment guidance and PCI payment-page scope.

## Closest research
1. **Wang, Chen, Wang and Qadeer (IEEE S&P, 2011), How to Shop for Free Online — Security Analysis of Cashier-as-a-Service Based Web Stores.** Establishes that merchant/cashier state coordination can create payment logic flaws. Historical systems and findings do not quantify present-day Stripe/Square deployments. [Author publication page](https://www.microsoft.com/en-us/research/publication/how-to-shop-for-free-online-security-analysis-of-cashier-as-a-service-based-web-stores/).
2. **Sudhodanan, Armando, Carbone and Compagna (NDSS, 2016), Attack Patterns for Black-Box Security Testing of Multi-Party Web Applications.** Pattern-based automated testing is relevant to protocol-state and replay cases. Broader multi-party applications, not a modern universal payment assurance metric. [Conference paper](https://www.ndss-symposium.org/wp-content/uploads/2017/09/attack-patterns-black-box-security-testing-multi-party-web-applications.pdf).
3. **Ying et al., Alipay-PIBench (2026 preprint, v4 revised 13 August).** The most direct recent overlap: nine Alipay product projects, 18 coding-agent tasks, functional and risk-aware rubrics. Our proposed distinction is cross-provider integration assurance under partial observation and independent behavioral validation; novelty must be checked against full text and artifacts. [arXiv](https://arxiv.org/abs/2607.14573).
4. **Protocol-Level Attacks on Agentic Commerce Platforms: A Cross-Platform Taxonomy, AIP-Bench, and Unified Defense (2026 preprint).** Adjacent agentic-commerce protocol benchmark; useful threat taxonomy but a different system population from ordinary web checkout. Treat claims as author-reported pending independent reproduction. [arXiv](https://arxiv.org/abs/2607.21824).
5. **Park and Hastings, Weak Enforcement and Low Compliance in PCI DSS: A Comparative Security Study (2026 ISDFS journal reference listed on arXiv).** Governance context; not a technical payment-integration scanner and not evidence of vulnerability prevalence in a new website sample. [arXiv record](https://arxiv.org/abs/2512.13430).
6. **Security analysis of third-party in-app payment in mobile applications (2019).** Adjacent mobile integration work combining static/dynamic analysis. Mobile findings cannot be generalized to modern web merchants without replication. [Publisher abstract](https://www.sciencedirect.com/science/article/abs/pii/S2214212619301632).

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
