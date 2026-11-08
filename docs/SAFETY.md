# Safety, authorization and compliance plan
Draft operational design, not a finding that the project complies with every applicable law. Research affiliation and jurisdiction remain unspecified. Obtain a scoped institutional/legal determination before external collection.

## Collection tiers
| Tier | Permitted study activity | Required gate |
|---|---|---|
| Owned offline lab | Synthetic data, local models, instrumented owned fixtures | Ownership, isolated environment and synthetic-data check |
| Provider sandbox | Normal documented test flows in researcher-owned accounts | Provider terms and sandbox scope review; explicit test credentials |
| Consented partner staging | Named flows, bounded negative cases, owned test accounts | Written target/action/time authorization, provider limits, incident contact |
| Public surface census | Approved low-rate retrieval of public pages/metadata | Terms, access, robots/site policy and privacy review; no active payment testing |
| Production active testing | Outside this initial protocol | A separate authorization, legal/ethics review and financial-impact protocol |

Authorization from a merchant is not permission to attack a processor, CDN or unrelated third party. Test cards belong only in intended sandbox flows. Never attempt to use them in production. Do not place live orders, trigger fulfillment, consume inventory, initiate real refunds/disputes, send forged events to external targets, or probe other users' objects under this protocol. An own credit card does not authorize adversarial testing of a merchant.

## Study subjects: architecture variants, open-source shops and generated code
- **Every subject runs in its own container:** sealed, disposable, started fresh for each run, with no real keys or card data inside. Runs start locally or in CI and send redacted evidence records to the researcher portal; the hosted portal never launches a run.
- **Generated code is untrusted.** If any agent-generated app is run (not planned for the preprint), build and run it in an isolated container: no host mounts beyond its own directory, egress allowlisted to the provider's sandbox API only, no access to other subjects' data. The agent session that writes the code also runs sandboxed. Never give an agent live keys.
- **Open-source shops run only as our own local installs**, configured with our own sandbox accounts. Never test a maintainer's or anyone else's deployment. A weakness in a shop's code is a finding about the software: report it privately to the maintainers under their security policy and publish only after coordinated disclosure (ADR 006).
- **Provider sandboxes** are used only through documented test flows in our own accounts. Adversarial deliveries (forged, replayed or mismatched events) are sent only to our own subject endpoints, never to the provider.
- **Tool scope gate.** The CLI and harness refuse targets that aren't loopback or listed in a signed scope file, and refuse to run when a live-mode key or live-mode provider object is detected. This ships in the first CLI release, not later.

## Agents operating payment tools (Track B, [ADR 011](decisions/011-agent-operators-django-sandbox-synthetic-data.md))
- **Agents touch only our sandbox.** An agent's tools reach only the Django payments sandbox in the same run's Docker stack. No agent gets a real provider key, a provider sandbox key, a real MCP server for a payment provider, or any tool that reaches the internet.
- **Network.** The sandbox and tool server have no egress. The agent runner may reach only the configured model API hosts, enforced at the container network layer, not only by configuration.
- **Synthetic data only.** Worlds, people, accounts, payees and invoices come from the seeded generator. Never put real names, emails, account numbers or card data into a world, prompt or task. The generator's tests check this.
- **Model API keys** are the only secrets the lab needs. They live in a git-ignored `.env`, are passed only to the agent-runner container, and never appear in evidence, transcripts, logs or the portal. Each provider account has a spend cap, and each run has its own cap; a run that hits it stops and is recorded as an exclusion. The autonomous build loop never makes paid model calls.
- **Manipulated tools stay in the lab.** B2's edited tool descriptions are research artifacts. They are never published to a public MCP registry, package index or marketplace, and never offered to anyone else's agent. Published examples are shown as text in the paper and dataset, not as installable tools.
- **Transcripts** are evidence. They hold only synthetic data, but they are still redacted under the evidence policy before leaving the run (keys, tokens and anything that looks like a card number or email are scrubbed), and raw transcripts follow the 7-day ceiling for raw lab traces below.
- **Disclosure.** If a model or agent framework shows behavior that could cause real financial harm beyond what's already published, report it privately to its maintainer before publishing details, as for open-source findings.

## Enforced controls for the future runner
The lab runs only locally today: the reference checkout binds to 127.0.0.1 and makes no outbound calls. Implement these before any sandbox or external collection:
- A signed/reviewed scope record naming exact origins, ports, account IDs, actions, environments, expiration, request budgets, owners and incident contacts.
- Deny by default. Validate all navigation, redirects, popup, worker and API destinations, not just the first URL. Egress policy at the network/container layer complements browser routing; DNS/IP checks must address rebinding and metadata endpoints.
- Separate sandbox secrets and credentials. Verify test-mode state from provider objects/configuration, rather than relying only on key prefixes or a URL label. Never accept arbitrary user-supplied target URLs in the dashboard.
- Start with one browser worker per target, bounded retries and an agreed budget; stop on 429s, unplanned personal/card data, live-mode indicators, unauthorized origin, financial effect or owner request. Keep an immediate kill switch and audit trail.
- Prevent order shipment, customer notifications and real inventory changes in fixtures. Test only synthetic identities. Disable outbound email/SMS and production integrations.
- Browser traces and HAR files can contain credentials, tokens and personal data. Prefer allowlisted derived fields; redact before durable storage. Avoid request bodies and full query strings by default. Never log secret keys, cookies, PAN or CVV. Store only necessary metadata and cryptographic artifact hashes.

## Data governance
Proposed retention: raw lab traces no longer than 7 days; redacted consented evidence no longer than 30 days pending agreement; aggregate/pseudonymous research records under the approved reproducibility policy. These are proposed ceilings, not legal retention requirements. Encrypt permitted retained evidence, restrict access, audit exports and keep any merchant-identity mapping separately. Review deletion/withdrawal obligations and access requests for the applicable jurisdiction.

Pseudonymous data can still be personal or reidentifiable. Do not claim anonymization because a domain or user ID is hashed. If GDPR applies, document purposes, controller/processor roles, lawful basis, data minimization, storage limitation, any required DPIA and transfer safeguards; research purpose is not a universal exemption. Other local privacy and computer misuse laws need jurisdiction-specific review.

## PCI and payment regulation
PIAS does not replace PCI DSS validation, an SAQ, a QSA assessment or provider compliance requirements. PCI is an industry security standard with contractual ecosystem obligations; do not equate it with a universal law. Architecture affects scope but does not prove compliance. PCI SSC FAQ 1588 distinguishes embedded forms from redirects for a particular SAQ A script eligibility criterion; other conditions still apply. Confirm the relevant questionnaire and evidence with the acquirer/compliance-accepting entity.

EU/UK payment authentication and payment-services rules may affect real deployments, but the synthetic study must not claim to test or certify SCA/PSD2 compliance merely by exercising sandbox 3DS screens. Native 3DS and delayed-payment scenarios should be tested through supported sandbox flows. Avoid holding/transmitting real funds; revisit regulatory scope if the project becomes a payment service.

## Authorization and ethics
The U.S. DOJ good-faith research charging policy is not blanket immunity from civil claims, other laws or provider terms. Written scope remains necessary. Institutional ethics/IRB applicability depends on institution, funding, interactions and identifiability; request a determination instead of assuming all internet research is exempt. If independent, obtain an appropriate external ethics and legal review for external work.

## Disclosure and publication
Use a private report with minimal reproduction, scope, impact, evidence and remediation. Verify findings with the owner before publication and avoid naming unconfirmed vulnerable merchants. Negotiate disclosure timing; a 90-day target is a proposal, not permission to publish sensitive details automatically. Release synthetic fixtures, aggregate results and sanitized evidence schemas. Keep merchant identifiers, credentials and raw production traces out of public repositories and issue trackers.

Primary references and exact links are in LITERATURE.md. This plan reduces avoidable risk but cannot certify legal compliance until jurisdiction, affiliation, processors and collection scope are known.
